from functools import lru_cache
from pathlib import Path

import pygame

from radio import CALLSIGNS, MESSAGE_LIMIT, REDACTED, WORD_GROUPS


SIZE = (390, 844)
FONT_DIR = Path(__file__).with_name("assets") / "fonts"
BG = "#0F1416"
PANEL = "#1A2226"
LINE = "#2B3539"
MUTED = "#8E989D"
LIGHT = "#E8E2D0"
PAPER = "#EFE8D6"
INK = "#1E1A14"
FADED = "#5A5247"
RULE = "#C9BFA8"
AMBER = "#F2A541"
RED = "#A3321F"
GREEN = "#6BF09A"
ECHO_BG = "#0C1A12"

TILE_COLOURS = {
    "?": "#0A0D0F", ".": "#1C2528", "S": "#1C2528", "#": "#3A4448",
    "D": "#B4432F", "X": "#2F6DB4", "E": "#2E8C9C", "P": "#3E7D3A", "T": "#7A6A48",
}
EXTRACTION = {1: "FTN", 2: "STN", 3: "PARK"}
PLAY_BUTTONS = (
    (64, 568, "up", "move"), (16, 621, "left", "move"),
    (112, 621, "right", "move"), (64, 674, "down", "move"),
    (180, 568, "TAKE", "take"), (280, 568, "DROP", "drop"),
    (180, 621, "WAIT", "wait"), (280, 621, "USE", "use"),
)


@lru_cache(maxsize=24)
def font(size, face="mono"):
    filename = {
        "mono": "IBMPlexMono-Regular.ttf",
        "bold": "IBMPlexMono-SemiBold.ttf",
        "title": "SpecialElite-Regular.ttf",
    }[face]
    return pygame.font.Font(FONT_DIR / filename, size)


@lru_cache(maxsize=512)
def label(value, size, colour, face):
    return font(size, face).render(value, True, colour)


@lru_cache(maxsize=256)
def wrap(value, width, size, face):
    measure = font(size, face).size
    lines = []
    line = ""
    for word in value.split():
        candidate = f"{line} {word}" if line else word
        if line and measure(candidate)[0] > width:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


class Screens:
    def __init__(self, surface):
        self.surface = surface
        self.targets = []
        self.log_limit = 0

    def text(self, value, x, y, size=12, colour=LIGHT, face="mono", align="left"):
        image = label(str(value), size, colour, face)
        if align == "right":
            x -= image.get_width()
        if align == "center":
            x -= image.get_width() // 2
        self.surface.blit(image, (x, y))

    def paragraph(self, value, x, y, width, size, colour=INK, face="mono", line_height=None):
        for line in wrap(value, width, size, face):
            self.text(line, x, y, size, colour, face)
            y += line_height or size + 5
        return y

    def rectangle(self, bounds, fill, outline=None, radius=4):
        rect = pygame.Rect(bounds)
        pygame.draw.rect(self.surface, fill, rect, border_radius=radius)
        if outline:
            pygame.draw.rect(self.surface, outline, rect, 1, border_radius=radius)
        return rect

    def activate(self, bounds, command):
        self.targets.append((pygame.Rect(bounds), command))

    def button(self, bounds, value, command, enabled=True, style="normal", size=12):
        primary = style == "primary" and enabled
        selected = style == "selected"
        paper = style == "paper"
        key = style == "key" and enabled
        fill = AMBER if primary or selected else PAPER if paper else PANEL
        ink = BG if primary or selected else INK if paper else AMBER if key else LIGHT if enabled else MUTED
        line = AMBER if primary or selected or key else "#4A555A" if enabled else LINE
        if paper:
            line = PAPER
        rect = self.rectangle(bounds, fill, line)
        top = rect.centery - font(size, "bold").get_height() // 2
        self.text(value, rect.centerx, top, size, ink, "bold", "center")
        if enabled and command:
            self.activate(rect, command)

    def stamp(self, value, x, y, colour, angle):
        message = label(value, 15, colour, "title")
        seal = pygame.Surface((message.get_width() + 20, 28), pygame.SRCALPHA)
        pygame.draw.rect(seal, colour, seal.get_rect(), 3)
        seal.blit(message, message.get_rect(center=seal.get_rect().center))
        rotated = pygame.transform.rotate(seal, angle)
        self.surface.blit(rotated, rotated.get_rect(topright=(x, y)))

    def draw(self, game, now):
        self.targets.clear()
        self.surface.fill(BG)
        state = game.state
        if not state or state["phase"] == "lobby":
            self.lobby(game, now)
        elif state["phase"] == "briefing":
            self.briefing(game)
        elif state["phase"] != "active":
            self.debrief(game)
        elif state["role"] == "handler":
            self.handler(game, now)
        else:
            self.agent(game, now)
        if game.confirm_leave:
            self.leave_dialog()

    def station(self):
        self.text("THE BUREAU · KESSEL · 1974", 20, 28, 11, MUTED)
        self.text("CH 7.215 MHz", 370, 28, 11, MUTED, align="right")

    def lobby(self, game, now):
        self.station()
        self.rectangle((20, 62, 350, 635), PAPER)
        self.stamp("CONFIDENTIAL", 350, 72, RED, -8)
        self.text("LOST IN TRANSMISSION", 44, 111, 11, FADED)
        self.text("Open a channel", 44, 139, 35, INK, "title")
        if game.state:
            self.text("ROOM CODE", 44, 222, 11, FADED)
            self.text(game.state["code"], 44, 246, 54, INK, "bold")
            copied = now - game.copied_at < 2
            self.button((246, 254, 100, 44), "COPIED" if copied else "COPY", {"type": "copy"},
                        style="selected" if copied else "normal")
            self.paragraph("Share this code with Wren to open the case file.", 44, 338, 300, 13)
            self.paragraph(game.status or "Waiting for Wren to connect.", 44, 419, 300, 12, FADED)
            self.button((20, 764, 350, 56), "CLOSE ROOM", {"type": "confirm_leave"}, game.online)
            return
        self.paragraph("Magpie reads the map. Wren works the street. Orders and reports go over the radio.", 44, 211, 300, 14)
        self.button((44, 315, 302, 49), "CREATE ROOM · MAGPIE", {"type": "create"}, game.online, "primary", 13)
        field = self.rectangle((44, 403, 302, 48), "#F7F0DE", RED if game.editing else RULE)
        self.text(game.code + ("|" if game.editing else "") or "ENTER ROOM CODE",
                  58, 418, 14, INK if game.code else FADED, "bold")
        self.activate(field, {"type": "edit"})
        self.button((44, 463, 302, 48), "JOIN ROOM · WREN", {"type": "join"},
                    game.online and len(game.code) == 5, size=13)
        if game.status:
            self.paragraph(game.status, 44, 540, 302, 12, RED)

    def briefing(self, game):
        state = game.state
        handler = state["role"] == "handler"
        partner_role = "agent" if handler else "handler"
        self.station()
        self.rectangle((20, 62, 350, 647), PAPER)
        self.stamp("CONFIDENTIAL", 350, 74, RED, -8)
        self.text(f"CASE FILE {state['mission']:02d}", 44, 91, 12, FADED)
        self.text(state["name"], 44, 120, 42, INK, "title")
        end = self.paragraph(f"“{state['briefing']}”", 44, 181, 302, 18, INK, "title", 27)
        line_y = max(282, end + 8)
        self.rectangle((44, line_y, 302, 1), RULE, radius=0)
        metrics = (("OBJECTIVE", state["objective"]), ("ROUNDS", state["round_limit"]),
                   ("GUARDS", "1, on patrol"), ("INTERFERENCE", state["interference"]))
        for index, (key, value) in enumerate(metrics):
            col = 44 + (index % 2) * 159
            y = line_y + 19 + (index // 2) * 62
            self.text(key, col, y, 11, FADED)
            self.paragraph(str(value), col, y + 16, 144 if index == 0 else 150, 13, INK, "bold", 17)
        self.rectangle((44, line_y + 131, 302, 1), RULE, radius=0)
        y = line_y + 153
        role_text = ("You are MAGPIE, the handler. You see the map. You do not see Wren." if handler
                     else "You are WREN, the agent. You see the street around you. Magpie has the map.")
        y = self.paragraph(role_text, 44, y, 302, 13, line_height=20)
        partner = "Partner: WREN, on the street." if handler else "Partner: MAGPIE, on the radio."
        y = self.paragraph(partner, 44, y + 4, 302, 13, line_height=20)
        self.paragraph("No talking. Everything goes over the radio.", 44, y + 6, 302, 13, FADED, line_height=20)
        self.partner_status(game, partner_role, 731)
        ready = state["role"] in state["ready"]
        self.button((20, 764, 350, 56), "WAITING FOR PARTNER" if ready else "READY · OPEN CHANNEL",
                    {"type": "ready"}, game.available and not ready, "primary", 15)

    def partner_status(self, game, partner_role, y):
        state = game.state
        ready = partner_role in state["ready"]
        dot = GREEN if game.available else RED
        pygame.draw.circle(self.surface, dot, (24, y + 8), 4)
        status = f"{CALLSIGNS[partner_role]} is on the channel"
        if ready:
            status += " and ready"
        if game.status:
            status = game.status
        self.paragraph(status, 36, y, 294, 11, MUTED)
        self.button((336, y - 5, 34, 25), "×", {"type": "confirm_leave"}, game.online, size=14)

    def header(self, state, now, game):
        role = state["role"]
        self.text(f"{role.upper()} · CASE {state['mission']:02d}", 16, 13, 11, MUTED)
        self.text(CALLSIGNS[role], 16, 28, 24, LIGHT, "bold")
        seconds = max(0, int(state["seconds"] - (now - game.state_at) if game.available else state["seconds"]))
        self.text(f"{seconds // 60:02d}:{seconds % 60:02d}", 110, 39, 10, MUTED)
        self.text(f"ROUND {state['round']} / {state['round_limit']}", 374, 13, 12, LIGHT, align="right")
        self.text("SUSPICION", 170, 39, 10, MUTED)
        self.rectangle((237, 44, 104, 7), "#263034")
        fill = round(state["suspicion"] * 1.04)
        if fill:
            self.rectangle((237, 44, fill, 7), "#E07A3F")
        self.text(state["suspicion"], 374, 38, 12, LIGHT, "bold", "right")

    def map(self, state, bounds):
        base = self.rectangle(bounds, "#06080A", radius=6)
        handler = state["role"] == "handler"
        patrol = {tuple(pos) for pos in state.get("patrol", ())}
        seen = state.get("last_seen")
        last_position = tuple(seen["position"]) if seen else None
        wren = tuple(state.get("position", ()))
        guard = tuple(state["guard"]) if state.get("guard") else None
        for row, line in enumerate(state["grid"]):
            for col, tile in enumerate(line):
                x = base.x + 2 + col * (base.width - 2) // 8
                y = base.y + 2 + row * (base.height - 2) // 8
                right = base.x + (col + 1) * (base.width - 2) // 8
                bottom = base.y + (row + 1) * (base.height - 2) // 8
                position = col, row
                player_here = position == wren
                guarded = position == guard
                mark = {"D": "CAFÉ", "X": "CAFÉ", "E": EXTRACTION[state["mission"]], "P": "PARK",
                        "T": "STN", "S": "START" if handler else ""}.get(tile, "")
                is_seen = position == last_position
                colour = AMBER if is_seen else MUTED if tile == "S" else "#FFFFFF"
                fill = AMBER if player_here else "#B4432F" if guarded else TILE_COLOURS[tile]
                cell = self.rectangle((x, y, right - x, bottom - y), fill, AMBER if is_seen else None, radius=3)
                if position in patrol:
                    self.patrol_outline(cell)
                if is_seen or player_here or guarded:
                    mark = "W" if player_here else "G" if guarded else "?"
                    colour = BG if player_here else AMBER if is_seen else "#FFFFFF"
                if mark:
                    size = 9 if handler else 10
                    self.text(mark, cell.centerx, cell.centery - font(size, "bold").get_height() // 2,
                              size, colour, "bold", "center")

    def patrol_outline(self, rect):
        for step in range(3, rect.width - 4, 6):
            for row in (rect.top + 1, rect.bottom - 2):
                pygame.draw.line(self.surface, "#E0634F", (rect.left + step, row), (rect.left + step + 2, row))
        for step in range(3, rect.height - 4, 6):
            for col in (rect.left + 1, rect.right - 2):
                pygame.draw.line(self.surface, "#E0634F", (col, rect.top + step), (col, rect.top + step + 2))

    def legend(self, state):
        self.text("LEGEND", 294, 72, 10, MUTED)
        for i, (name, fill, outline, marker) in enumerate((
            ("Last seen", BG, AMBER, "?"), ("Guard route", BG, "#E0634F", ""),
            ("Briefcase" if state["mission"] == 1 else "Package", "#B4432F", None, ""),
            ("Drop point", "#2E8C9C", None, ""),
        )):
            y = 94 + 23 * i
            rect = self.rectangle((294, y, 14, 14), fill, None if i == 1 else outline, radius=3)
            if i == 1:
                self.patrol_outline(rect)
            self.text(marker, 301, y - 1, 10, AMBER, "bold", "center")
            self.text(name, 314, y, 9, MUTED)
        self.rectangle((292, 257, 82, 81), PANEL, LINE)
        self.text("CCTV · CAM 2", 298, 264, 9, AMBER, "bold")
        sighting = state["last_seen"]
        if sighting:
            x, y = sighting["position"]
            self.paragraph(f"Wren crossed {chr(65 + x)}{y + 1}", 298, 282, 69, 10, LIGHT)
            self.text(f"Round {sighting['round']}", 298, 321, 9, MUTED)
        else:
            self.paragraph("No sighting yet", 298, 282, 69, 10, MUTED)

    def tiles(self, values, x, y, width, height=23, colour=INK, accent=()):
        left, top = x, y
        for index, value in enumerate(values):
            redacted = value == REDACTED
            size = max(30, font(11, "bold").size(value)[0] + 12) if not redacted else 43
            if left + size > x + width and left > x:
                left, top = x, top + height + 4
            highlighted = index in accent
            fill = "#141414" if redacted else RED if highlighted else PAPER
            self.rectangle((left, top, size, height), fill, None if redacted else RED if highlighted else colour, 2)
            if not redacted:
                self.text(value, left + 6, top + (height - font(11, "bold").get_height()) // 2,
                          11, "#FFFFFF" if highlighted else colour, "bold")
            left += size + 5
        return top + height

    def incoming(self, state, bounds):
        rect = self.rectangle(bounds, PAPER)
        packet = state["incoming"]
        if packet:
            self.text(f"FROM {packet['sender']} · RX {packet['number']:02d}", rect.left + 11, rect.top + 7, 10, FADED)
            self.text(f"R{packet['round']:02d}", rect.right - 11, rect.top + 7, 10, FADED, align="right")
            self.tiles(packet["tiles"], rect.left + 11, rect.top + 25, rect.width - 22)
        else:
            self.text("INCOMING RADIO", rect.left + 11, rect.top + 8, 10, FADED)
            self.text("No transmission received yet", rect.left + 11, rect.top + 33, 12, FADED)

    def echo(self, state, y):
        self.rectangle((16, y, 358, 34), ECHO_BG, "#2F6B45")
        self.text("▒ ECHO", 26, y + 8, 12, GREEN, "bold")
        packet = state.get("incoming")
        status = "▓ ░ · · intercept detected" if packet and REDACTED in packet["tiles"] else "· · · ▓ ░ · · listening"
        self.text(status, 95, y + 8, 12, GREEN)

    def handler(self, game, now):
        state = game.state
        self.header(state, now, game)
        self.map(state, (16, 66, 268, 268))
        self.legend(state)
        self.incoming(state, (16, 346, 358, 79))
        self.echo(state, 435)
        self.composer(game, 483, "NEW ORDER", state["stage"] == "order")

    def agent(self, game, now):
        state = game.state
        self.header(state, now, game)
        if state["stage"] == "report":
            self.map(state, (61, 66, 268, 268))
            self.incoming(state, (16, 346, 358, 79))
            self.echo(state, 435)
            self.composer(game, 483, "FIELD REPORT", True)
            return
        self.map(state, (16, 66, 358, 358))
        self.text("ACTION POINTS", 16, 437, 11, MUTED)
        for index in range(state["point_limit"]):
            charged = index < state["points"]
            self.rectangle((114 + index * 20, 438, 14, 14), AMBER if charged else BG, AMBER if charged else "#4A555A")
        self.text(f"BAG: {state['bag'] or 'empty'}", 374, 437, 11, LIGHT, align="right")
        self.incoming(state, (16, 465, 358, 79))
        mobile = game.available and state["stage"] == "moves"
        for x, y, value, kind in PLAY_BUTTONS:
            direction = kind == "move"
            bounds = (x, y, 44 if direction else 94, 46)
            command = {"type": kind}
            if direction:
                command["direction"] = value
                self.arrow_button(bounds, value, command, mobile and state["points"] > 0)
            else:
                self.button(bounds, value, command, mobile and state["points"] > 0, size=12)
        self.text("MOVE", 86, 638, 10, MUTED, align="center")
        self.button((180, 674, 194, 46), f"DECRYPT KEY ×{int(state['key'])}",
                    {"type": "decrypt"}, self.can_decrypt(game), "key", 11)
        status = game.status or ("MAGPIE is composing an order." if state["stage"] == "order" else "")
        self.footer(game, status)
        self.button((16, 780, 358, 48), "END MOVES · WRITE REPORT",
                    {"type": "end_moves"}, mobile, "primary", 13)

    def arrow_button(self, bounds, name, command, enabled):
        rect = self.rectangle(bounds, PANEL, "#4A555A" if enabled else LINE)
        cx, cy = rect.center
        dx, dy = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}[name]
        tip = (cx + dx * 4, cy + dy * 4)
        base = (cx - dx * 3, cy - dy * 3)
        points = [(base[0] + dy * 6, base[1] - dx * 6), tip,
                  (base[0] - dy * 6, base[1] + dx * 6)]
        pygame.draw.lines(self.surface, LIGHT if enabled else MUTED, False, points, 2)
        if enabled:
            self.activate(rect, command)

    def can_decrypt(self, game):
        state = game.state
        packet = state["incoming"]
        return bool(game.available and state["key"] and packet and REDACTED in packet["tiles"])

    def composer(self, game, y, heading, turn):
        draft = game.draft
        state = game.state
        enabled = turn and game.available
        self.rectangle((16, y, 358, 1), LINE)
        self.text(heading, 16, y + 9, 11, MUTED)
        self.text(f"{len(draft)} / {MESSAGE_LIMIT} TILES", 374, y + 9, 11, MUTED, align="right")
        self.rectangle((16, y + 30, 358, 58), BG, AMBER if enabled else LINE, 6)
        left, top = 23, y + 36
        for index in range(MESSAGE_LIMIT):
            word = draft[index] if index < len(draft) else ""
            width = max(23, font(11, "bold").size(word)[0] + 12)
            if left + width > 368:
                left, top = 23, top + 23
            bounds = (left, top, width, 21)
            if word:
                self.button(bounds, word, {"type": "remove", "index": index}, enabled, "paper", 11)
            else:
                self.rectangle(bounds, BG, "#4A555A", 3)
            left += width + 5
        left = 16
        for category in WORD_GROUPS:
            width = font(9, "bold").size(category)[0] + 12
            self.button((left, y + 96, width, 30), category, {"type": "category", "name": category},
                        enabled, "selected" if enabled and category == game.category else "normal", 9)
            left += width + 3
        for index, word in enumerate(WORD_GROUPS[game.category]):
            col, row = index % 3, index // 3
            self.button((16 + col * 121, y + 134 + row * 50, 116, 44), word,
                        {"type": "tile", "word": word}, enabled and len(draft) < MESSAGE_LIMIT, size=12)
        partner = CALLSIGNS["agent" if state["role"] == "handler" else "handler"]
        status = game.status or (f"Waiting for {partner}." if not turn else "")
        self.footer(game, status)
        self.button((16, 780, 120, 48), f"KEY ×{int(state['key'])}", {"type": "decrypt"},
                    self.can_decrypt(game), "key", 12)
        self.button((144, 780, 230, 48), "TRANSMIT", {"type": "transmit"},
                    enabled and bool(draft), "primary", 14)

    def footer(self, game, status=""):
        if status:
            self.paragraph(status, 16, 743, 314, 11, AMBER if game.status else MUTED, line_height=14)
        self.button((340, 741, 34, 25), "×", {"type": "confirm_leave"}, game.online, size=14)

    def debrief(self, game):
        state = game.state
        failed = state["phase"] == "failed"
        self.rectangle((16, 16, 358, 676), PAPER)
        self.stamp("COVER BLOWN" if failed else "COMPLETED", 357, 27, RED if failed else "#2E6B3A", 7)
        self.text(f"DEBRIEF · CASE {state['mission']:02d}", 32, 33, 11, FADED)
        self.text(state["name"], 32, 56, 30, INK, "title")
        for index, (caption, value) in enumerate((
            ("SIGNAL", f"{state['signal']}%"), ("ROUNDS", f"{state['round']} / {state['round_limit']}"),
            ("PEAK SUSP.", state["peak_suspicion"]),
        )):
            x = 32 + 111 * index
            self.rectangle((x, 98, 103, 52), PAPER, INK, 3)
            self.text(caption, x + 8, 105, 10, FADED)
            self.text(value, x + 8, 119, 18, INK, "bold")
        self.paragraph(state["result"], 32, 164, 326, 13, INK, "title", 17)
        y = 210
        entries = state["transmissions"]
        worst = max(entries, key=lambda entry: entry["heard"].count(REDACTED), default=None)
        if worst and REDACTED in worst["heard"]:
            highlighted = [i for i, tile in enumerate(worst["heard"]) if tile == REDACTED]
            self.rectangle((32, y, 326, 135), "#F7E3D2", RED, 3)
            self.text(f"WORST INTERCEPT · ROUND {worst['round']}", 42, y + 8, 10, RED, "bold")
            self.text("SENT", 42, y + 31, 10, FADED)
            bottom = self.tiles(worst["sent"], 84, y + 27, 265, 20, accent=highlighted)
            self.text("HEARD", 42, bottom + 10, 10, FADED)
            self.tiles(worst["heard"], 84, bottom + 6, 265, 20)
            y += 149
        self.text("TRANSMISSION LOG", 32, y + 3, 11, FADED)
        self.log_limit = max(0, len(entries) - 1)
        offset = min(game.log_offset, self.log_limit)
        if offset:
            self.button((290, y - 4, 30, 24), "↑", {"type": "log_scroll", "delta": -1}, size=13)
        if offset < self.log_limit:
            self.button((326, y - 4, 30, 24), "↓", {"type": "log_scroll", "delta": 1}, size=13)
        y += 25
        if not entries:
            self.text("No transmissions recorded.", 32, y + 9, 11, FADED)
        for entry in entries[offset:]:
            sent = " ".join(entry["sent"])
            heard = " ".join("███" if tile == REDACTED else tile for tile in entry["heard"])
            activity = state["activity"].get(str(entry["round"]), ())
            notes = activity[-1] if activity else ""
            lines = len(wrap(sent, 285, 11, "mono")) + len(wrap("→ " + heard, 285, 11, "mono"))
            lines += len(wrap(notes, 285, 10, "mono"))
            if y + 15 * lines + 12 > 680:
                break
            self.rectangle((32, y, 326, 1), RULE, radius=0)
            self.text(f"R{entry['round']}", 32, y + 7, 11, FADED, "bold")
            y = self.paragraph(sent, 60, y + 7, 285, 11, INK, line_height=15)
            y = self.paragraph("→ " + heard, 60, y, 285, 11, RED, line_height=15)
            y = self.paragraph(notes, 60, y, 285, 10, FADED, line_height=15) + 7
        self.rectangle((16, 705, 358, 62), ECHO_BG, "#2F6B45")
        self.text("INCOMING · SENDER UNKNOWN", 28, 713, 10, GREEN)
        self.text("H E L L O", 28, 731, 23, GREEN, "bold")
        self.button((332, 711, 30, 22), "×", {"type": "confirm_leave"}, game.online, size=13)
        ready = state["role"] in state["ready"]
        action = "RETRY CASE" if failed else "REPLAY CAMPAIGN" if state["phase"] == "complete" else f"NEXT CASE · {state['next_case'].upper()}"
        title = "WAITING FOR PARTNER" if ready else action
        if game.status:
            title = game.status.upper()
        self.button((16, 780, 358, 48), title, {"type": "ready"},
                    game.available and not ready, "primary", 13)

    def leave_dialog(self):
        cover = pygame.Surface(SIZE, pygame.SRCALPHA)
        cover.fill((0, 0, 0, 190))
        self.surface.blit(cover, (0, 0))
        self.targets.clear()
        self.rectangle((30, 318, 330, 155), PAPER)
        self.text("Close the room?", 48, 338, 30, INK, "title")
        self.text("Both players will return to the lobby.", 48, 380, 11, FADED)
        self.button((48, 411, 137, 42), "STAY", {"type": "cancel_leave"})
        self.button((195, 411, 147, 42), "CLOSE ROOM", {"type": "leave"}, style="primary")
