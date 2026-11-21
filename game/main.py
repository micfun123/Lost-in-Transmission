import asyncio
from functools import lru_cache
import math
import time

import pygame

from transport import BrowserTransport, DesktopTransport, IN_BROWSER


TITLE = "Lost in Transmission"
SIZE = (1280, 720)
BG = "#101614"
PANEL = "#17201c"
LINE = "#34453c"
INK = "#eee9d8"
MUTED = "#a4b2a7"
GREEN = "#a8dabe"
AMBER = "#f1ba72"
RED = "#ed9b85"
TILE_COLOR = {"?": BG, "#": "#222f29", ".": "#3c5648", "D": "#436f57", "X": "#634842", "E": "#715c3b"}
RESULT_ACTIONS = {
    "cleared": ("Mission cleared", "Next mission"),
    "failed": ("Mission failed", "Retry mission"),
    "complete": ("Campaign complete", "Replay campaign"),
}

WORLD = pygame.Rect(48, 151, 768, 499)
RADIO = pygame.Rect(836, 151, 396, 499)
CREATE = pygame.Rect(359, 365, 562, 50)
CODE = pygame.Rect(359, 437, 360, 50)
JOIN = pygame.Rect(733, 437, 188, 50)
LEAVE = pygame.Rect(1117, 29, 115, 42)
READY = pygame.Rect(590, 561, 200, 50)
RADIO_INPUT = pygame.Rect(856, 562, 275, 48)
SEND = pygame.Rect(1143, 562, 69, 48)
INTERACT = pygame.Rect(590, 548, 196, 42)
PAD = {
    "up": pygame.Rect(660, 430, 52, 42),
    "left": pygame.Rect(602, 478, 52, 42),
    "down": pygame.Rect(660, 478, 52, 42),
    "right": pygame.Rect(718, 478, 52, 42),
}
MOVE_KEYS = {
    "up": (pygame.K_w, pygame.K_UP),
    "left": (pygame.K_a, pygame.K_LEFT),
    "down": (pygame.K_s, pygame.K_DOWN),
    "right": (pygame.K_d, pygame.K_RIGHT),
}


@lru_cache(maxsize=16)
def font(size, bold):
    result = pygame.font.Font(None, size)
    result.set_bold(bold)
    return result


@lru_cache(maxsize=512)
def label(value, size, color, bold):
    return font(size, bold).render(value, True, color)


def text(surface, value, x, y, size=24, color=INK, bold=False):
    surface.blit(label(value, size, color, bold), (x, y))


@lru_cache(maxsize=256)
def wrap(value, width, size):
    lines = []
    line = ""
    measure = font(size, False).size
    for word in value.split():
        candidate = f"{line} {word}" if line else word
        if measure(candidate)[0] <= width:
            line = candidate
            continue
        if line:
            lines.append(line)
        while measure(word)[0] > width:
            split = len(word) - 1
            while split > 1 and measure(word[:split])[0] > width:
                split -= 1
            lines.append(word[:split])
            word = word[split:]
        line = word
    if line:
        lines.append(line)
    return lines


def button(surface, rect, value, enabled=True, primary=False):
    fill = GREEN if primary and enabled else PANEL
    foreground = BG if primary and enabled else INK if enabled else MUTED
    pygame.draw.rect(surface, fill, rect, border_radius=4)
    pygame.draw.rect(surface, GREEN if primary and enabled else LINE, rect, 1, border_radius=4)
    image = label(value, 24, foreground, True)
    surface.blit(image, image.get_rect(center=rect.center))


def field(surface, rect, value, placeholder, focused):
    pygame.draw.rect(surface, BG, rect, border_radius=4)
    pygame.draw.rect(surface, GREEN if focused else LINE, rect, 1, border_radius=4)
    old_clip = surface.get_clip()
    surface.set_clip(rect.inflate(-20, -4))
    display = value + ("|" if focused else "")
    image = label(display or placeholder, 24, INK if display else MUTED, False)
    x = min(rect.left + 10, rect.right - 10 - image.get_width())
    surface.blit(image, (x, rect.centery - image.get_height() // 2))
    surface.set_clip(old_clip)


class Game:
    def __init__(self, surface, transport):
        self.surface = surface
        self.transport = transport
        self.online = False
        self.reconnect_at = math.inf
        self.session = transport.read_session()
        self.state = None
        self.state_at = 0
        self.notice = ""
        self.focus = None
        self.code = ""
        self.draft = ""
        self.next_move = 0
        self.next_radio = 0

    @property
    def active(self):
        return self.online and self.state and self.state["paired"] and self.state["phase"] == "active"

    def edit(self, focus):
        self.focus = focus
        if IN_BROWSER:
            self.transport.edit(focus, self.code if focus == "code" else self.draft)
        elif focus:
            pygame.key.start_text_input()
            pygame.key.set_text_input_rect(CODE if focus == "code" else RADIO_INPUT)
        else:
            pygame.key.stop_text_input()

    async def update_connection(self, now):
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
                self.edit(None)
            elif kind == "state":
                if self.state is None or message["phase"] != self.state["phase"]:
                    self.edit(None)
                    self.notice = ""
                self.state = message
                self.state_at = now
            elif kind in ("left", "resume_failed"):
                self.session = None
                self.transport.save_session(None)
                self.state = None
                self.draft = ""
                self.notice = message.get("text", "")
                self.edit(None)
            elif kind == "notice":
                self.notice = message["text"]
            elif kind == "edit" and self.focus == message["focus"]:
                if self.focus == "code":
                    self.code = message["value"]
                else:
                    self.draft = message["value"]
            elif kind == "submit":
                command = self.submit()
                if command:
                    self.notice = ""
                    await self.transport.send(command)
            elif kind == "cancel_edit":
                self.edit(None)

    def submit(self):
        if self.focus == "code" and self.online and len(self.code) == 5:
            return {"type": "join", "code": self.code}
        if self.focus == "radio" and self.active and self.draft.strip():
            now = time.monotonic()
            if now < self.next_radio:
                self.notice = "Let the radio settle before sending again."
                return None
            message = self.draft
            self.draft = ""
            self.edit(None)
            self.next_radio = now + 0.75
            return {"type": "radio", "text": message}
        return None

    def handle(self, event):
        if event.type == pygame.TEXTINPUT and not IN_BROWSER:
            if self.focus == "code":
                letters = "".join(c for c in event.text.upper() if c.isascii() and c.isalnum())
                self.code = (self.code + letters)[:5]
            elif self.focus == "radio":
                self.draft = (self.draft + event.text)[:120]
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                self.edit(None)
            elif event.key == pygame.K_BACKSPACE:
                if self.focus == "code":
                    self.code = self.code[:-1]
                elif self.focus == "radio":
                    self.draft = self.draft[:-1]
            elif event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                if self.focus:
                    return self.submit()
                if self.active:
                    self.edit("radio")
                elif self.state is None:
                    self.edit("code")
            elif event.key == pygame.K_e and not self.focus and self.active and self.state["role"] == "agent":
                return {"type": "interact"}
        elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            return self.click(event.pos)
        return None

    def click(self, position):
        if self.state is None:
            if CODE.collidepoint(position):
                self.edit("code")
            elif JOIN.collidepoint(position):
                self.edit("code")
                return self.submit()
            elif CREATE.collidepoint(position) and self.online:
                return {"type": "create"}
            else:
                self.edit(None)
            return None

        if self.online and LEAVE.collidepoint(position):
            return {"type": "leave"}
        if self.active:
            if RADIO_INPUT.collidepoint(position):
                self.edit("radio")
                return None
            if SEND.collidepoint(position):
                self.edit("radio")
                return self.submit()
            self.edit(None)
            if self.state["role"] == "agent":
                for direction, rect in PAD.items():
                    if rect.collidepoint(position):
                        self.next_move = time.monotonic() + 0.16
                        return {"type": "move", "direction": direction}
                if INTERACT.collidepoint(position):
                    return {"type": "interact"}
        elif self.online and self.state["paired"] and self.state["phase"] in RESULT_ACTIONS:
            if self.state["role"] not in self.state["ready"] and READY.collidepoint(position):
                return {"type": "ready"}
        return None

    def held_move(self, now):
        if not self.active or self.focus or self.state["role"] != "agent" or now < self.next_move:
            return None
        keys = pygame.key.get_pressed()
        for direction, alternatives in MOVE_KEYS.items():
            if any(keys[key] for key in alternatives):
                self.next_move = now + 0.16
                return {"type": "move", "direction": direction}
        return None

    def draw(self, now):
        surface = self.surface
        surface.fill(BG)
        text(surface, "KESSEL   /   1974", 48, 26, 24, GREEN, True)
        text(surface, TITLE, 48, 53, 59, INK, True)
        if self.state:
            button(surface, LEAVE, "Leave room", self.online)
            text(surface, f"ROOM {self.state['code']}", 981, 40, 25, GREEN, True)
        pygame.draw.line(surface, LINE, (48, 119), (1232, 119))
        if not self.state or self.state["phase"] == "lobby":
            self.draw_lobby()
        else:
            self.draw_operation(now)
        status = self.notice
        if not self.online:
            status = "Radio link offline. Reconnecting…" if self.session else "Connecting to the multiplayer server…"
        elif self.state and not self.state["paired"] and self.state["phase"] != "lobby":
            status = "The other player has disconnected. The mission clock is paused."
        if status:
            text(surface, status, 48, 671, 24, AMBER)

    def draw_lobby(self):
        surface = self.surface
        panel = pygame.Rect(333, 178, 614, 360)
        pygame.draw.rect(surface, PANEL, panel, border_radius=6)
        pygame.draw.rect(surface, LINE, panel, 1, border_radius=6)
        if self.state:
            text(surface, "Waiting for the agent", 359, 217, 44, bold=True)
            text(surface, "Send this room code to the other player.", 359, 279, 28, MUTED)
            text(surface, self.state["code"], 359, 341, 96, GREEN, True)
            text(surface, "The operation starts when they join.", 359, 459, 24, MUTED)
            return

        text(surface, "Open a radio channel", 359, 215, 44, bold=True)
        text(surface, "One handler maps the route. One agent retrieves the drop.", 359, 277, 25, MUTED)
        text(surface, "Use the in-game radio to guide each other.", 359, 306, 25, MUTED)
        button(surface, CREATE, "Create room as handler", self.online, primary=True)
        field(surface, CODE, self.code, "Enter room code", self.focus == "code")
        button(surface, JOIN, "Join as agent", self.online and len(self.code) == 5)

    def draw_operation(self, now):
        surface = self.surface
        state = self.state
        pygame.draw.rect(surface, PANEL, WORLD, border_radius=6)
        pygame.draw.rect(surface, LINE, WORLD, 1, border_radius=6)
        pygame.draw.rect(surface, PANEL, RADIO, border_radius=6)
        pygame.draw.rect(surface, LINE, RADIO, 1, border_radius=6)
        self.draw_radio()
        heading = "Handler map" if state["role"] == "handler" else "Street view"
        text(surface, heading, 72, 166, 37, bold=True)
        x, y = state["position"]
        text(surface, f"SECTOR {chr(65 + x)}{y + 1}", 590, 177, 25, GREEN, True)
        self.draw_map()

        text(surface, f"MISSION {state['mission']} / {state['mission_count']}", 590, 219, 23, GREEN, True)
        for index, line in enumerate(wrap(state["name"], 194, 30)):
            text(surface, line, 590, 245 + 24 * index, 30, bold=True)
        seconds = state["seconds"]
        if self.active:
            seconds -= now - self.state_at
        seconds = max(0, math.ceil(seconds))
        text(surface, f"{seconds // 60:02d}:{seconds % 60:02d}", 590, 281, 38, AMBER if seconds <= 60 else INK, True)
        text(surface, f"Heat {state['heat']} / 3", 708, 293, 23, AMBER if state["heat"] else MUTED)
        if state["phase"] in RESULT_ACTIONS:
            outcome, action = RESULT_ACTIONS[state["phase"]]
            result_color = AMBER if state["phase"] == "failed" else GREEN
            text(surface, outcome, 590, 329, 25, result_color, bold=True)
            for index, line in enumerate(wrap(state["result"], 192, 24)):
                text(surface, line, 590, 379 + index * 24, 24, result_color)
            ready = state["role"] in state["ready"]
            button(surface, READY, "Waiting for partner" if ready else action,
                   self.online and state["paired"] and not ready, primary=True)
            return
        objective = "Reach extraction." if state["carrying"] else "Recover the package."
        text(surface, objective, 590, 329, 25, GREEN)
        if state["role"] == "agent":
            text(surface, "WASD or arrow keys", 590, 391, 24, MUTED)
            for direction, glyph in zip(PAD, ("↑", "←", "↓", "→")):
                button(surface, PAD[direction], glyph, self.active)
            button(surface, INTERACT, "Interact  ·  E", self.active, primary=True)
        else:
            for index, line in enumerate(wrap(state["briefing"], 193, 23)):
                text(surface, line, 590, 375 + index * 22, 23, MUTED)
            text(surface, "D  Drop", 590, 545, 23, GREEN)
            text(surface, "X  Decoy", 590, 574, 23, RED)
            text(surface, "E  Extraction", 590, 603, 23, AMBER)

    def draw_map(self):
        surface = self.surface
        state = self.state
        x, y = state["position"]
        handler = state["role"] == "handler"
        if handler:
            left, top, size = 88, 225, 44
            coordinates = range(0, 11), range(0, 9)
            for col in coordinates[0]:
                text(surface, chr(65 + col), left + col * size + 15, 206, 20, MUTED)
            for row in coordinates[1]:
                text(surface, str(row + 1), 68, top + row * size + 14, 20, MUTED)
        else:
            left, top, size = 112, 225, 79
            coordinates = range(x - 2, x + 3), range(y - 2, y + 3)
        for row_index, row in enumerate(coordinates[1]):
            for col_index, col in enumerate(coordinates[0]):
                tile = "?"
                if 0 <= row < len(state["grid"]) and 0 <= col < len(state["grid"][row]):
                    tile = state["grid"][row][col]
                rect = pygame.Rect(left + col_index * size, top + row_index * size, size - 2, size - 2)
                pygame.draw.rect(surface, TILE_COLOR[tile], rect, border_radius=2)
                if tile == "#" and not handler:
                    pygame.draw.rect(surface, LINE, rect.inflate(-12, -12), 1)
                if tile in ("D", "E", "X"):
                    symbol = "?" if not handler and tile == "X" else tile
                    image = label(symbol, 29 if handler else 36, INK, True)
                    surface.blit(image, image.get_rect(center=rect.center))
                if (col, row) == (x, y):
                    pygame.draw.circle(surface, BG, rect.center, 14 if handler else 22)
                    pygame.draw.circle(surface, GREEN, rect.center, 10 if handler else 17)

    def draw_radio(self):
        surface = self.surface
        text(surface, "Radio channel", 856, 169, 34, bold=True)
        y = 540
        names = {"you": ("YOU", GREEN), "handler": ("HANDLER", INK),
                 "agent": ("AGENT", INK), "echo": ("ECHO", AMBER)}
        for message in reversed(self.state["messages"]):
            lines = wrap(message["text"], 345, 24)
            height = 29 + len(lines) * 22
            if y - height < 212:
                break
            y -= height
            speaker, color = names[message["from"]]
            text(surface, speaker, 856, y, 19, color, True)
            for index, line in enumerate(lines):
                text(surface, line, 856, y + 19 + index * 22, 24, color)
        field(surface, RADIO_INPUT, self.draft, "Type a transmission", self.focus == "radio")
        button(surface, SEND, "Send", self.active, primary=True)
        text(surface, "Enter to type or send", 856, 620, 21, MUTED)


async def main():
    pygame.display.init()
    pygame.font.init()
    screen = pygame.display.set_mode(SIZE)
    pygame.display.set_caption(TITLE)
    pygame.key.stop_text_input()
    transport = BrowserTransport() if IN_BROWSER else DesktopTransport()
    game = Game(screen, transport)
    transport.connect()
    clock = pygame.time.Clock()
    try:
        running = True
        while running:
            now = time.monotonic()
            await game.update_connection(now)
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                    break
                command = game.handle(event)
                if command:
                    game.notice = ""
                    await transport.send(command)
            command = game.held_move(now)
            if command:
                await transport.send(command)
            game.draw(now)
            pygame.display.flip()
            clock.tick(0 if IN_BROWSER else 60)
            await asyncio.sleep(0)
    finally:
        await transport.close()
        pygame.quit()


if __name__ == "__main__":
    asyncio.run(main())
