from collections import Counter
from dataclasses import dataclass
import random
import secrets
import time

from game.radio import CALLSIGNS, MESSAGE_LIMIT, REDACTED, WORDS


ROLES = ("handler", "agent")
DIRECTIONS = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}
OUTCOMES = {"cleared", "failed", "complete"}
MISSION_SECONDS = 600
ROUND_LIMIT = 8
ACTION_POINTS = 4
# ECHO's interference by mission risk: (chance per extra use of a learned word, max static tiles per message).
INTERFERENCE = {"Light": (0.20, 1), "Moderate": (0.25, 2), "Heavy": (0.30, 2)}
JAM_CHANCE_LIMIT = 0.6


@dataclass(frozen=True)
class Mission:
    name: str
    briefing: str
    package: str
    destination: str
    decoy: str
    risk: str
    grid: tuple[str, ...]
    patrol: tuple[tuple[int, int], ...]

    def site(self, marker):
        return next((row.index(marker), y) for y, row in enumerate(self.grid) if marker in row)

    @property
    def objective(self):
        return f"{self.package.capitalize()} → {self.destination}"


MISSIONS = (
    Mission(
        "Dead Drop",
        "A briefcase is waiting under a table at the red café. Bring it to the fountain. Routine.",
        "briefcase", "fountain", "umbrella", "Light",
        ("...#..D.", ".#.#.#..", ".#......", ".S..E.##",
         "..#.....", ".#X#..P.", "........", "#..T..#."),
        ((5, 2), (5, 3), (5, 4), (5, 5), (5, 6)),
    ),
    Mission(
        "The Courier",
        "The courier missed their connection. Collect the envelope at the red café and leave it at the station.",
        "envelope", "station", "paper", "Moderate",
        ("..D.....", ".###.#..", "..S#.#P.", ".#...#..",
         "....##..", ".#X.....", "...#....", ".#...E#."),
        ((4, 5), (5, 5), (6, 5), (7, 5)),
    ),
    Mission(
        "Dead Air",
        "A technician left a recording of ECHO at the red café. Take it to the park before the signal disappears.",
        "recording", "park", "paper", "Heavy",
        ("....#..D", ".##.#.#.", "...#....", ".#...#..",
         ".#.#...T", "....##..", "..X.....", "S..#...E"),
        ((4, 2), (5, 2), (6, 2), (7, 2), (7, 3)),
    ),
)


class Room:
    def __init__(self, code):
        self.code = code
        self.tokens = {}
        self.peers = {}
        self.mission_index = 0
        self.words = Counter()
        self.random = random.Random()
        self.empty_since = None
        self.prepare_case()
        self.phase = "lobby"

    @property
    def mission(self):
        return MISSIONS[self.mission_index]

    @property
    def paired(self):
        return len(self.peers) == len(ROLES)

    @property
    def guard(self):
        route = self.mission.patrol
        step = self.patrol_step % (len(route) * 2 - 2)
        return route[min(step, len(route) * 2 - 2 - step)]

    def connect(self, role, peer):
        if role not in self.tokens:
            self.tokens[role] = secrets.token_urlsafe(24)
        self.peers[role] = peer
        self.empty_since = None
        if self.paired and self.phase == "lobby":
            self.phase = "briefing"
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

    def prepare_case(self):
        self.phase = "briefing"
        self.stage = "order"
        self.round = 1
        self.points = ACTION_POINTS
        self.position = self.mission.site("S")
        self.package_at = self.mission.site("D")
        self.decoy_at = self.mission.site("X")
        self.bag = None
        self.patrol_step = 0
        self.suspicion = 0
        self.peak_suspicion = 0
        self.last_seen = None
        self.keys = set(ROLES)
        self.decoded = {}
        self.transmissions = []
        self.activity = {}
        self.ready = set()
        self.deadline = None
        self.paused_at = None
        self.finished_at = None
        self.result = ""

    def confirm(self, role):
        self.ready.add(role)
        if self.ready == set(ROLES):
            if self.phase == "briefing":
                self.ready.clear()
                self.phase = "active"
                self.deadline = time.monotonic() + MISSION_SECONDS
            else:
                if self.phase == "cleared":
                    self.mission_index += 1
                    # ECHO's memory fades between cases so later cases don't start fully jammed.
                    self.words = Counter({term: count // 2 for term, count in self.words.items()})
                elif self.phase == "complete":
                    self.mission_index = 0
                    self.words.clear()
                self.prepare_case()
        return True, ""

    def expire_mission(self):
        if self.phase == "active" and self.paired and time.monotonic() >= self.deadline:
            self.finish("failed", "Time ran out. The drop went cold.")
            return True
        return False

    def finish(self, phase, result):
        self.phase = phase
        self.result = result
        self.finished_at = time.monotonic()

    def command(self, role, data):
        action = data.get("type")
        if not self.paired:
            return False, "Waiting for your partner."
        if action == "ready" and (self.phase == "briefing" or self.phase in OUTCOMES):
            return self.confirm(role)
        if self.phase != "active":
            return False, "The channel is on hold."
        if action == "decrypt":
            return self.decrypt(role)
        if action == "radio":
            return self.transmit(role, data.get("tiles"))
        if role != "agent" or self.stage != "moves":
            return False, "Wait for the next order."
        if action == "end_moves":
            self.stage = "report"
            return True, ""
        if self.points == 0:
            return False, "No action points left this round."
        if action == "move":
            return self.move(data.get("direction"))
        if action == "interact":
            action = "drop" if self.bag else "take"
        if action in ("take", "drop", "use", "wait"):
            return self.act(action)
        return False, "That action is unavailable."

    def move(self, direction):
        if not isinstance(direction, str) or direction not in DIRECTIONS:
            return False, ""
        dx, dy = DIRECTIONS[direction]
        x, y = self.position[0] + dx, self.position[1] + dy
        grid = self.mission.grid
        if not (0 <= y < len(grid) and 0 <= x < len(grid[y])) or grid[y][x] == "#":
            return False, ""
        self.position = x, y
        self.spend_point()
        return True, ""

    def act(self, action):
        mission = self.mission
        if action == "take":
            if self.bag:
                return False, "Your bag is full."
            if self.position == self.package_at:
                self.bag, self.package_at = mission.package, None
            elif self.position == self.decoy_at:
                self.bag, self.decoy_at = mission.decoy, None
                self.raise_suspicion(15)
            else:
                return False, "There is nothing to take here."
            self.record(f"Took the {self.bag}.")
        elif action == "drop":
            if not self.bag:
                return False, "Your bag is empty."
            if self.bag == mission.package and self.position == mission.site("E"):
                self.points -= 1
                self.bag = None
                self.record(f"Delivered the {mission.package}.")
                outcome = "complete" if self.mission_index == len(MISSIONS) - 1 else "cleared"
                self.finish(outcome, f"The {mission.package} reached the {mission.destination}.")
                return True, ""
            if self.bag == mission.package:
                self.package_at = self.position
            else:
                self.decoy_at = self.position
            self.record(f"Dropped the {self.bag}.")
            self.bag = None
        elif action == "use":
            if self.bag != mission.decoy:
                return False, "A decoy item can lower suspicion."
            self.bag = None
            self.suspicion = max(0, self.suspicion - 15)
            self.record(f"Blended in using the {mission.decoy}.")
        self.spend_point()
        return True, ""

    def record(self, text):
        self.activity.setdefault(self.round, []).append(text)

    def raise_suspicion(self, amount):
        self.suspicion = min(100, self.suspicion + amount)
        self.peak_suspicion = max(self.peak_suspicion, self.suspicion)
        if self.suspicion == 100:
            self.finish("failed", "The guard recognised Wren. Cover blown.")

    def spend_point(self):
        self.points -= 1
        self.patrol_step += 1
        gx, gy = self.guard
        x, y = self.position
        if abs(gx - x) + abs(gy - y) <= 1:
            if self.last_seen is None or self.last_seen["round"] != self.round:
                self.record("The guard spotted Wren.")
                self.raise_suspicion(25)
            self.last_seen = {"position": self.position, "round": self.round}

    def transmit(self, role, tiles):
        expected = {"order": "handler", "moves": None, "report": "agent"}
        if expected[self.stage] != role:
            return False, "Your partner has the channel."
        if not isinstance(tiles, list) or not 1 <= len(tiles) <= MESSAGE_LIMIT or any(
            not isinstance(tile, str) or tile not in WORDS for tile in tiles
        ):
            return False, "Choose one to six radio tiles."

        terms = set(tiles)
        growth, limit = INTERFERENCE[self.mission.risk]
        # Words ECHO has heard twice may be jammed, more often the more they are used.
        jammed = [term for term in sorted(terms) if self.words[term] >= 2
                  and self.random.random() < min(JAM_CHANCE_LIMIT, growth * (self.words[term] - 1))]
        self.random.shuffle(jammed)
        blocked = set(jammed[:min(limit, max(1, len(tiles) // 2))])
        self.words.update(terms)
        heard = [REDACTED if tile in blocked else tile for tile in tiles]
        self.transmissions.append({"round": self.round, "sender": role, "sent": tiles, "heard": heard})

        if role == "handler":
            self.stage = "moves"
        elif self.round == ROUND_LIMIT:
            self.finish("failed", "The last round ended before the drop was made.")
        else:
            self.round += 1
            self.points = ACTION_POINTS
            self.stage = "order"
        return True, ""

    def decrypt(self, role):
        message = self.incoming(role)
        if role not in self.keys or not message or REDACTED not in message["tiles"]:
            return False, "There is no intercepted tile to decrypt."
        self.keys.remove(role)
        index = message["number"] - 1
        self.decoded[index] = message["tiles"].index(REDACTED)
        self.record(f"{CALLSIGNS[role]} used their decrypt key.")
        return True, ""

    def incoming(self, role):
        for index in range(len(self.transmissions) - 1, -1, -1):
            message = self.transmissions[index]
            if message["sender"] != role:
                tiles = message["heard"].copy()
                if index in self.decoded:
                    tile = self.decoded[index]
                    tiles[tile] = message["sent"][tile]
                return {"number": index + 1, "round": message["round"],
                        "sender": CALLSIGNS[message["sender"]], "tiles": tiles}
        return None

    def snapshot(self, role):
        mission = self.mission
        handler = role == "handler"
        x, y = self.position

        def visible(col, row):
            return abs(col - x) <= 1 and abs(row - y) <= 1

        grid = (
            list(mission.grid) if handler else [
                "".join(tile if visible(col, row) else "?" for col, tile in enumerate(line))
                for row, line in enumerate(mission.grid)
            ]
        )
        now = self.finished_at or self.paused_at or time.monotonic()
        state = {
            "type": "state", "role": role, "code": self.code, "phase": self.phase, "stage": self.stage,
            "paired": self.paired, "mission": self.mission_index + 1, "name": mission.name,
            "next_case": MISSIONS[self.mission_index + 1].name if self.mission_index + 1 < len(MISSIONS) else None,
            "interference": mission.risk, "suspicion": self.suspicion, "grid": grid,
            "round": self.round, "round_limit": ROUND_LIMIT, "key": role in self.keys,
            "incoming": self.incoming(role), "ready": sorted(self.ready),
            "seconds": max(0, self.deadline - now) if self.deadline is not None else MISSION_SECONDS,
        }
        if handler:
            state.update(briefing=mission.briefing, objective=mission.objective,
                         patrol=mission.patrol, last_seen=self.last_seen)
        else:
            state.update(briefing="The bureau will send orders over the radio. Recover the package and deliver it at the drop point.",
                         objective="Follow Magpie’s orders", position=self.position, bag=self.bag,
                         points=self.points, point_limit=ACTION_POINTS,
                         guard=self.guard if visible(*self.guard) else None)
        if self.phase in OUTCOMES:
            sent = sum(len(entry["sent"]) for entry in self.transmissions)
            blocked = sum(entry["heard"].count(REDACTED) for entry in self.transmissions)
            state.update(result=self.result, peak_suspicion=self.peak_suspicion,
                         signal=round(100 * (sent - blocked) / sent) if sent else 100,
                         transmissions=self.transmissions.copy(), activity=self.activity.copy())
        return state
