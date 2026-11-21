import asyncio
from collections import deque
from contextlib import suppress
import json
import os
import sys

from screens import SIZE


IN_BROWSER = sys.platform == "emscripten"

SOCKET_BRIDGE = """
document.body.style.background = "#0F1416";
document.getElementById("canvas").style.touchAction = "none";
globalThis.litSocket = {
    queue: [],
    socket: null,
    input: null,
    zones: [],
    notify(data) { this.queue.push(JSON.stringify(data)); },
    connect() {
        const scheme = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(scheme + "//" + location.host + "/ws");
        this.socket = socket;
        socket.onopen = () => this.notify({type: "opened"});
        socket.onmessage = (event) => this.queue.push(event.data);
        socket.onclose = () => this.notify({type: "disconnected"});
    },
    drain() {
        return "[" + this.queue.splice(0).join(",") + "]";
    },
    send(message) {
        if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(message);
    },
    setZones(zones) { this.zones = zones; },
    // Focus and clipboard access only work inside the browser's own input event,
    // so taps on these canvas areas are handled here rather than a frame later.
    gesture(event) {
        const box = document.getElementById("canvas").getBoundingClientRect();
        const x = (event.clientX - box.left) * WIDTH / box.width;
        const y = (event.clientY - box.top) * HEIGHT / box.height;
        const zone = this.zones.find(([left, top, width, height]) =>
            x >= left && x < left + width && y >= top && y < top + height);
        if (!zone) return;
        const [, , , , action, value] = zone;
        if (action === "focus") {
            this.edit("code", this.input?.value ?? "");
        } else if (action === "copy") {
            const copied = navigator.clipboard?.writeText(value) ?? Promise.reject();
            copied.then(() => this.notify({type: "copied"}), () => this.notify({type: "copy_failed"}));
        }
    },
    edit(focus, value) {
        if (!this.input) {
            const input = document.createElement("input");
            input.type = "text";
            input.autocomplete = "off";
            input.autocapitalize = "characters";
            input.tabIndex = -1;
            input.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
            input.addEventListener("input", () => {
                input.value = input.value.replace(/[^a-z0-9]/gi, "").toUpperCase();
                this.notify({type: "edit", value: input.value});
            });
            input.addEventListener("keydown", (event) => {
                event.stopPropagation();
                if (!event.isComposing && ["Enter", "Escape"].includes(event.key)) {
                    event.preventDefault();
                    this.notify({type: event.key === "Enter" ? "submit" : "cancel_edit"});
                }
            });
            input.addEventListener("keyup", (event) => event.stopPropagation());
            input.addEventListener("focus", () => this.notify({type: "focused"}));
            input.addEventListener("blur", () => this.notify({type: "blurred"}));
            document.body.appendChild(input);
            this.input = input;
        }
        if (focus) {
            this.input.setAttribute("aria-label", "Room code");
            this.input.maxLength = 5;
            this.input.value = value;
            this.input.focus({preventScroll: true});
            this.input.setSelectionRange(value.length, value.length);
        } else if (document.activeElement === this.input) {
            this.input.blur();
            document.getElementById("canvas").focus({preventScroll: true});
        }
    },
    readSession() {
        try { return sessionStorage.getItem("lost-in-transmission") || "null"; }
        catch { return "null"; }
    },
    saveSession(value) {
        try { sessionStorage.setItem("lost-in-transmission", value); }
        catch {}
    },
    close() { this.socket?.close(); },
};
window.addEventListener("pointerup", (event) => globalThis.litSocket.gesture(event), true);
"""


class BrowserTransport:
    def __init__(self):
        import platform

        self.evaluate = platform.window.eval
        self.zones = None
        self.evaluate(f"const WIDTH = {SIZE[0]}, HEIGHT = {SIZE[1]};\n{SOCKET_BRIDGE}")

    def connect(self):
        self.evaluate("globalThis.litSocket.connect()")

    def drain(self):
        return json.loads(self.evaluate("globalThis.litSocket.drain()"))

    async def send(self, data):
        encoded = json.dumps(json.dumps(data))
        self.evaluate(f"globalThis.litSocket.send({encoded})")

    def edit(self, focus, value):
        self.evaluate(f"globalThis.litSocket.edit({json.dumps(focus)}, {json.dumps(value)})")

    def set_zones(self, zones):
        if zones != self.zones:
            self.zones = zones
            self.evaluate(f"globalThis.litSocket.setZones({json.dumps(zones)})")

    def copy(self, text):
        pass

    def read_session(self):
        return json.loads(self.evaluate("globalThis.litSocket.readSession()"))

    def save_session(self, value):
        encoded = json.dumps(json.dumps(value))
        self.evaluate(f"globalThis.litSocket.saveSession({encoded})")

    async def close(self):
        self.evaluate("globalThis.litSocket.close()")


class DesktopTransport:
    def __init__(self):
        self.url = os.environ.get("LIT_SERVER_URL", "ws://127.0.0.1:8000/ws")
        self.inbox = deque()
        self.task = None
        self.socket = None
        self.session = None

    def connect(self):
        self.task = asyncio.create_task(self.receive())

    async def receive(self):
        from aiohttp import ClientError, ClientSession, ClientTimeout, WSMsgType

        try:
            async with ClientSession(timeout=ClientTimeout(total=8)) as session:
                async with session.ws_connect(self.url, heartbeat=20) as socket:
                    self.socket = socket
                    self.inbox.append({"type": "opened"})
                    async for message in socket:
                        if message.type == WSMsgType.TEXT:
                            self.inbox.append(json.loads(message.data))
        except (ClientError, OSError, TimeoutError, ValueError):
            pass
        finally:
            self.socket = None
            self.inbox.append({"type": "disconnected"})

    def drain(self):
        messages = list(self.inbox)
        self.inbox.clear()
        return messages

    async def send(self, data):
        if self.socket is not None:
            with suppress(ConnectionError, RuntimeError):
                await self.socket.send_json(data)

    def set_zones(self, zones):
        pass

    def copy(self, text):
        import pygame

        try:
            pygame.scrap.put_text(text)
        except pygame.error:
            self.inbox.append({"type": "copy_failed"})
        else:
            self.inbox.append({"type": "copied"})

    def read_session(self):
        return self.session

    def save_session(self, value):
        self.session = value

    async def close(self):
        if self.task is not None:
            self.task.cancel()
            with suppress(asyncio.CancelledError):
                await self.task
