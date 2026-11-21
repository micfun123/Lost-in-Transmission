import argparse
import asyncio
from contextlib import suppress
import json
from pathlib import Path
import secrets
import time
from urllib.parse import urlsplit

from aiohttp import WSMsgType, web

from operation import Room


WEB_BUILD = Path(__file__).resolve().parent / "game" / "build" / "web"
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class Client:
    def __init__(self, socket):
        self.socket = socket
        self.outbox = asyncio.Queue(maxsize=32)
        self.room = None
        self.role = None

    def send(self, data):
        try:
            self.outbox.put_nowait(data)
        except asyncio.QueueFull:
            # A stalled client can reconnect and receive the current snapshot.
            asyncio.create_task(self.socket.close(code=1013, message=b"Reconnect for current state"))

    def notice(self, text):
        self.send({"type": "notice", "text": text})

    async def write(self):
        try:
            while True:
                await self.socket.send_json(await self.outbox.get())
        except (ConnectionError, RuntimeError):
            await self.socket.close()


class Multiplayer:
    def __init__(self):
        self.rooms = {}

    def publish(self, room):
        for role, client in room.peers.items():
            client.send(room.snapshot(role))

    def join(self, client, room, role):
        client.room = room
        client.role = role
        token = room.connect(role, client)
        client.send({"type": "joined", "code": room.code, "token": token})
        self.publish(room)

    def leave(self, client):
        if client.room is not None:
            room = client.room
            room.disconnect(client.role)
            client.room = None
            client.role = None
            self.publish(room)

    def receive(self, client, data):
        action = data.get("type")
        if action == "leave":
            room = client.room
            if room is None:
                client.send({"type": "left"})
                return
            for player in room.peers.values():
                player.room = None
                player.role = None
                player.send({
                    "type": "left",
                    "text": "" if player is client else "The other player closed the room.",
                })
            del self.rooms[room.code]
            return
        if client.room is not None:
            room = client.room
            expired = room.expire_mission()
            changed, notice = room.command(client.role, data)
            if changed or expired:
                self.publish(room)
            if notice:
                client.notice(notice)
            return

        if action == "create":
            if len(self.rooms) >= 100:
                client.notice("All rooms are in use. Try again later.")
                return
            while True:
                code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(5))
                if code not in self.rooms:
                    break
            room = self.rooms[code] = Room(code)
            self.join(client, room, "handler")
            return

        code = data.get("code")
        room = self.rooms.get(code.strip().upper()) if isinstance(code, str) else None
        if action == "join":
            if room is None:
                client.notice("Room code not found.")
            elif "agent" in room.tokens:
                client.notice("Both roles are already assigned.")
            else:
                self.join(client, room, "agent")
        elif action == "resume":
            token = data.get("token")
            if room and isinstance(token, str):
                for role, saved_token in room.tokens.items():
                    if token == saved_token and role not in room.peers:
                        self.join(client, room, role)
                        return
            client.send({"type": "resume_failed", "text": "Could not reconnect to that room."})

    async def socket(self, request):
        origin = request.headers.get("Origin")
        if origin:
            try:
                same_origin = urlsplit(origin).netloc == request.host
            except ValueError:
                same_origin = False
            if not same_origin:
                raise web.HTTPForbidden()

        ws = web.WebSocketResponse(heartbeat=20, max_msg_size=2048)
        await ws.prepare(request)
        client = Client(ws)
        writer = asyncio.create_task(client.write())
        try:
            async for message in ws:
                if message.type != WSMsgType.TEXT:
                    continue
                try:
                    data = json.loads(message.data)
                except (ValueError, RecursionError):
                    continue
                if isinstance(data, dict) and isinstance(data.get("type"), str):
                    self.receive(client, data)
        finally:
            self.leave(client)
            writer.cancel()
            with suppress(asyncio.CancelledError):
                await writer
        return ws

    async def maintain_rooms(self):
        while True:
            await asyncio.sleep(0.5)
            now = time.monotonic()
            for code, room in tuple(self.rooms.items()):
                if room.empty_since is not None and now - room.empty_since > 600:
                    del self.rooms[code]
                elif room.expire_mission():
                    self.publish(room)


def create_app():
    multiplayer = Multiplayer()

    async def maintenance(_app):
        task = asyncio.create_task(multiplayer.maintain_rooms())
        yield
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

    async def index(_request):
        path = WEB_BUILD / "index.html"
        if not path.is_file():
            return web.Response(status=503, text="Build the browser client with python -m pygbag --build game.")
        return web.FileResponse(path, headers={"Cache-Control": "no-cache"})

    async def asset(request):
        return web.FileResponse(WEB_BUILD / request.match_info["file"], headers={"Cache-Control": "no-cache"})

    app = web.Application()
    app.cleanup_ctx.append(maintenance)
    app.router.add_get("/", index)
    app.router.add_get("/ws", multiplayer.socket)
    app.router.add_get(r"/{file:game\.apk|game\.tar\.gz|favicon\.png}", asset)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Serve Lost in Transmission and its multiplayer rooms.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    web.run_app(create_app(), host=args.host, port=args.port)
