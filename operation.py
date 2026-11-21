from collections import Counter, deque
from dataclasses import dataclass
import re
import secrets
import time


ROLES = ("handler", "agent")
DIRECTIONS = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}
MISSION_SECONDS = 600
WORD = re.compile(r"[^\W\d_]{3,}", re.UNICODE)
COMMON_WORDS = set("the and you for are then that this with from have just your now one".split())
HANDLER_TILES = str.maketrans("S", ".")
AGENT_TILES = str.maketrans("SD", ".X")


@dataclass(frozen=True)
class Mission:
    name: str
    briefing: str
    cargo: str
    grid: tuple[str, ...]

    def site(self, marker):
        return next((row.index(marker), y) for y, row in enumerate(self.grid) if marker in row)


MISSIONS = (
    Mission(
        "The Last Post",
        "A postal clerk copied a list of foreign agents. Find the dead drop and leave through the tram gate.",
        "the dossier",
        (
            "###########",
            "#S..#....E#",
            "#.#.#.###.#",
            "#.#X..D...#",
            "#.###.###.#",
            "#..X..#...#",
            "##.##.#.#.#",
            "#....X....#",
            "###########",
        ),
    ),
    Mission(
        "Night Freight",
        "A night porter hid the freight manifest in the railway quarter. Recover it before the shift changes.",
        "the manifest",
        (
            "###########",
            "#...X...#S#",
            "#.#.###.#.#",
            "#.#...#.X.#",
            "#.###.###.#",
            "#D..#...X.#",
            "###.#.#.#.#",
            "#E....#...#",
            "###########",
        ),
    ),
    Mission(
        "Dead Air",
        "A signal technician left a recording of ECHO in the relay district. Carry the tape to the cable-car gate.",
        "the recording",
        (
            "###########",
            "#D..#..X.E#",
            "#.#.#.#.#.#",
            "#.#...#.X.#",
            "#.###.###.#",
            "#...#...#.#",
            "###.###.#.#",
            "#S....X...#",
            "###########",
        ),
    ),
)


class Room:
    def __init__(self, code):
        self.code = code
        self.tokens = {}
        self.peers = {}
        self.phase = "lobby"
        self.mission_index = 0
        self.position = self.mission.site("S")
        self.carrying = False
        self.heat = 0
        self.checked_decoys = set()
        self.deadline = None
        self.paused_at = None
        self.finished_at = None
        self.empty_since = None
        self.ready = set()
        self.words = Counter()
        self.logs = {role: deque(maxlen=24) for role in ROLES}
        self.last_radio = {}
        self.last_move = 0
        self.result = ""

    @property
    def mission(self):
        return MISSIONS[self.mission_index]

    @property
    def paired(self):
        return len(self.peers) == len(ROLES)

    def connect(self, role, peer):
        if role not in self.tokens:
            self.tokens[role] = secrets.token_urlsafe(24)
        self.peers[role] = peer
        self.empty_since = None
        if self.paired and self.phase == "lobby":
            self.start_mission()
        elif self.paired and self.paused_at is not None:
            self.deadline += time.monotonic() - self.paused_at
            self.paused_at = None
        return self.tokens[role]

    def disconnect(self, role):
        self.peers.pop(role, None)
        self.ready.discard(role)
        if self.phase == "active" and self.paused_at is None:
            self.paused_at = time.monotonic()
        if not self.peers:
            self.empty_since = time.monotonic()

    def start_mission(self):
        self.position = self.mission.site("S")
        self.phase = "active"
        self.carrying = False
        self.heat = 0
        self.checked_decoys.clear()
        self.deadline = time.monotonic() + MISSION_SECONDS
        self.paused_at = None
        self.finished_at = None
        self.ready.clear()
        self.last_move = 0
        self.result = ""
        for log in self.logs.values():
            log.clear()
        if self.mission_index == 0 and not self.words:
            self.echo("Can you hear me through the snow?")
        else:
            self.echo("Back on this frequency? I remember your voices.")

    def echo(self, text):
        for log in self.logs.values():
            log.append({"from": "echo", "text": text})

    def expire_mission(self):
        if self.phase == "active" and self.paired and time.monotonic() >= self.deadline:
            self.finish("failed", "Time ran out. The drop has gone cold.")
            return True
        return False

    def finish(self, phase, result):
        self.phase = phase
        self.result = result
        self.finished_at = time.monotonic()

    def command(self, role, data):
        action = data.get("type")
        if not self.paired:
            return False, "Waiting for the other player."
        if action == "ready" and self.phase in {"cleared", "failed", "complete"}:
            self.ready.add(role)
            if self.ready == set(ROLES):
                if self.phase == "cleared":
                    self.mission_index += 1
                elif self.phase == "complete":
                    self.mission_index = 0
                    self.words.clear()
                self.start_mission()
            return True, ""
        if self.phase != "active":
            return False, "The operation is on hold."
        if action == "radio":
            return self.transmit(role, data.get("text"))
        if action in {"move", "interact"} and role == "agent":
            if action == "move":
                return self.move(data.get("direction")), ""
            return self.interact()
        return False, "That action is unavailable."

    def move(self, direction):
        if not isinstance(direction, str) or direction not in DIRECTIONS:
            return False
        now = time.monotonic()
        if now - self.last_move < 0.12:
            return False
        self.last_move = now
        dx, dy = DIRECTIONS[direction]
        x, y = self.position
        x, y = x + dx, y + dy
        if self.mission.grid[y][x] == "#":
            return False
        self.position = x, y
        return True

    def interact(self):
        x, y = self.position
        site = self.mission.grid[y][x]
        if site == "D" and not self.carrying:
            self.carrying = True
            return True, "Package secured. Reach extraction."
        if site == "E" and self.carrying:
            phase = "complete" if self.mission_index == len(MISSIONS) - 1 else "cleared"
            self.finish(phase, f"You got {self.mission.cargo} out of the district.")
            return True, ""
        if site == "X" and not self.carrying:
            if self.position in self.checked_decoys:
                return False, "This drop was already checked."
            self.checked_decoys.add(self.position)
            self.heat += 1
            if self.heat == 3:
                self.finish("failed", "The watch followed you from the decoy. Your cover is blown.")
            return True, "Wrong drop. The watch is taking notice."
        return False, "Nothing to collect here." if site != "E" else "Secure the package before extracting."

    def transmit(self, role, text):
        if not isinstance(text, str):
            return False, "Enter a radio message."
        text = " ".join(text.split())
        if not text or len(text) > 120:
            return False, "Radio messages must be 1 to 120 characters."
        now = time.monotonic()
        if now - self.last_radio.get(role, 0) < 0.6:
            return False, "Let the radio settle before sending again."
        self.last_radio[role] = now
        keywords = {word.casefold() for word in WORD.findall(text)} - COMMON_WORDS
        learned = {word for word in keywords if self.words[word] >= 2}
        intercepted = set(sorted(learned, key=lambda word: (-self.words[word], word))[:self.mission_index + 1])
        self.words.update(keywords)
        delivery = WORD.sub(
            lambda match: "[STATIC]" if match.group().casefold() in intercepted else match.group(),
            text,
        )
        partner = "agent" if role == "handler" else "handler"
        self.logs[role].append({"from": "you", "text": text})
        self.logs[partner].append({"from": role, "text": delivery})
        if any(self.words[word] == 3 for word in intercepted):
            self.echo("I've heard that word before. Try another.")
        return True, ""

    def snapshot(self, role):
        x, y = self.position
        mission = self.mission
        if role == "handler":
            grid = [row.translate(HANDLER_TILES) for row in mission.grid]
        else:
            grid = [
                "".join(
                    tile if abs(x - i) + abs(y - j) <= 2 else "?"
                    for i, tile in enumerate(row.translate(AGENT_TILES))
                )
                for j, row in enumerate(mission.grid)
            ]
        now = self.finished_at or self.paused_at or time.monotonic()
        return {
            "type": "state",
            "role": role,
            "code": self.code,
            "phase": self.phase,
            "paired": self.paired,
            "mission": self.mission_index + 1,
            "mission_count": len(MISSIONS),
            "name": mission.name,
            "briefing": mission.briefing,
            "grid": grid,
            "position": self.position,
            "carrying": self.carrying,
            "heat": self.heat,
            "seconds": max(0, self.deadline - now) if self.deadline is not None else MISSION_SECONDS,
            "messages": list(self.logs[role]),
            "ready": sorted(self.ready),
            "result": self.result,
        }
