import asyncio
import math
import time

import pygame

from radio import MESSAGE_LIMIT
from screens import SIZE, Screens
from transport import BrowserTransport, DesktopTransport, IN_BROWSER


MOVEMENT_KEYS = {
    pygame.K_w: "up", pygame.K_UP: "up",
    pygame.K_a: "left", pygame.K_LEFT: "left",
    pygame.K_s: "down", pygame.K_DOWN: "down",
    pygame.K_d: "right", pygame.K_RIGHT: "right",
}
END_STATES = {"cleared", "failed", "complete"}
ENTER = {pygame.K_RETURN, pygame.K_KP_ENTER}


class Game:
    def __init__(self, transport):
        self.transport = transport
        self.online = False
        self.reconnect_at = math.inf
        self.session = transport.read_session()
        self.state = None
        self.state_at = 0
        self.notice = ""
        self.editing = False
        self.confirm_leave = False
        self.code = ""
        self.draft = []
        self.category = "PLACE"
        self.log_offset = 0

    @property
    def available(self):
        return self.online and self.state is not None and self.state["paired"]

    @property
    def composing(self):
        if not self.available or self.state["phase"] != "active":
            return False
        turn = "order" if self.state["role"] == "handler" else "report"
        return self.state["stage"] == turn

    @property
    def moving(self):
        return (self.available and self.state["phase"] == "active"
                and self.state["role"] == "agent" and self.state["stage"] == "moves")

    @property
    def status(self):
        if not self.online:
            return "Reconnecting to the channel…" if self.session else "Connecting to the channel…"
        if self.state and self.state["phase"] != "lobby" and not self.state["paired"]:
            return "Partner disconnected. Channel paused."
        return self.notice

    def edit_code(self, editing):
        if self.editing == editing:
            return
        self.editing = editing
        if IN_BROWSER:
            self.transport.edit("code" if editing else None, self.code)
        elif editing:
            pygame.key.start_text_input()
            pygame.key.set_text_input_rect(pygame.Rect(44, 403, 302, 48))
        else:
            pygame.key.stop_text_input()

    def set_code(self, value):
        self.code = "".join(char for char in value.upper() if char.isascii() and char.isalnum())[:5]

    async def receive(self, now):
        if now >= self.reconnect_at:
            self.transport.connect()
            self.reconnect_at = math.inf
        for message in self.transport.drain():
            kind = message["type"]
            if kind == "opened":
                self.online = True
                self.notice = ""
                if self.session:
                    await self.transport.send({"type": "resume", **self.session})
            elif kind == "disconnected":
                self.online = False
                self.reconnect_at = now + 2
            elif kind == "joined":
                self.session = {"code": message["code"], "token": message["token"]}
                self.transport.save_session(self.session)
                self.edit_code(False)
            elif kind == "state":
                self.update_state(message, now)
            elif kind in ("left", "resume_failed"):
                self.session = None
                self.transport.save_session(None)
                self.state = None
                self.notice = message.get("text", "")
                self.draft.clear()
                self.confirm_leave = False
                self.edit_code(False)
            elif kind == "notice":
                self.notice = message["text"]
            elif kind == "edit" and self.editing:
                self.set_code(message["value"])
            elif kind == "submit":
                await self.command({"type": "join"})
            elif kind == "cancel_edit":
                self.edit_code(False)

    def update_state(self, state, now):
        old = self.state
        if old is None or any(old[k] != state[k] for k in ("phase", "stage", "mission")):
            self.draft.clear()
            self.notice = ""
            self.category = "REPORT" if state["stage"] == "report" else "PLACE"
            self.log_offset = 0
        self.state = state
        self.state_at = now

    async def command(self, command):
        action = command["type"]
        if action == "edit":
            self.edit_code(True)
            return
        if action == "confirm_leave":
            self.confirm_leave = True
            return
        if action == "cancel_leave":
            self.confirm_leave = False
            return
        if action == "log_scroll":
            self.log_offset = max(0, self.log_offset + command["delta"])
            return
        if not self.online:
            return
        if action == "category":
            self.category = command["name"]
            return
        if action == "tile":
            if self.composing and len(self.draft) < MESSAGE_LIMIT:
                self.draft.append(command["word"])
            return
        if action == "remove":
            if self.composing and command["index"] < len(self.draft):
                self.draft.pop(command["index"])
            return
        if action == "transmit":
            if not self.composing or not self.draft:
                return
            command = {"type": "radio", "tiles": self.draft.copy()}
            self.draft.clear()
        elif action == "join":
            if self.state or len(self.code) != 5:
                return
            self.edit_code(False)
            command = {"type": "join", "code": self.code}
        elif action == "leave":
            self.confirm_leave = False
        self.notice = ""
        await self.transport.send(command)

    def key_action(self, key):
        if key == pygame.K_ESCAPE:
            if self.editing:
                self.edit_code(False)
            elif self.state:
                self.confirm_leave = not self.confirm_leave
            return None
        if self.confirm_leave:
            return None
        if self.editing:
            if key == pygame.K_BACKSPACE:
                self.code = self.code[:-1]
            if key in ENTER:
                return {"type": "join"}
            return None
        if self.state is None:
            return {"type": "edit"} if key in ENTER else None
        if key in ENTER:
            if self.composing:
                return {"type": "transmit"}
            if self.moving:
                return {"type": "end_moves"}
            if self.state["phase"] == "briefing" or self.state["phase"] in END_STATES:
                if self.available and self.state["role"] not in self.state["ready"]:
                    return {"type": "ready"}
        if self.moving and self.state["points"] > 0:
            if key in MOVEMENT_KEYS:
                return {"type": "move", "direction": MOVEMENT_KEYS[key]}
            if key == pygame.K_e:
                return {"type": "interact"}
        return None

    async def handle(self, event, screens):
        if event.type == pygame.TEXTINPUT and self.editing and not IN_BROWSER:
            self.set_code(self.code + event.text)
        if event.type == pygame.KEYDOWN:
            command = self.key_action(event.key)
            if command:
                await self.command(command)
        elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            for rect, command in screens.targets:
                if rect.collidepoint(event.pos):
                    await self.command(command)
                    break
            else:
                if self.editing:
                    self.edit_code(False)
        elif event.type == pygame.MOUSEWHEEL and self.state and self.state["phase"] in END_STATES:
            self.log_offset = max(0, min(screens.log_limit, self.log_offset - event.y))


async def main():
    pygame.display.init()
    pygame.font.init()
    surface = pygame.display.set_mode(SIZE)
    pygame.display.set_caption("Lost in Transmission")
    pygame.key.stop_text_input()
    transport = BrowserTransport() if IN_BROWSER else DesktopTransport()
    game = Game(transport)
    screens = Screens(surface)
    transport.connect()
    clock = pygame.time.Clock()
    try:
        running = True
        while running:
            now = time.monotonic()
            await game.receive(now)
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                    break
                await game.handle(event, screens)
            screens.draw(game, now)
            pygame.display.flip()
            clock.tick(0 if IN_BROWSER else 60)
            await asyncio.sleep(0)
    finally:
        await transport.close()
        pygame.quit()


if __name__ == "__main__":
    asyncio.run(main())
