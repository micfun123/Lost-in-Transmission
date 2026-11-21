WORD_GROUPS = {
    "ACTION": ("GO", "TAKE", "DROP", "WAIT", "USE", "RETURN"),
    "DIRECTION": ("NORTH", "EAST", "SOUTH", "WEST", "LEFT", "RIGHT"),
    "PLACE": ("CAFE", "FOUNTAIN", "STATION", "PARK", "BANK", "TOWER"),
    "COLOUR": ("RED", "BLUE", "GREEN", "BLACK", "WHITE", "GREY"),
    "ITEM": ("BRIEFCASE", "ENVELOPE", "RECORDING", "UMBRELLA", "PAPER", "KEY"),
    "NUMBER": ("1", "2", "3", "4", "5", "6"),
    "REPORT": ("YES", "NO", "GUARD", "CLEAR", "BLOCKED", "READY"),
}
WORDS = frozenset(word for group in WORD_GROUPS.values() for word in group)
MESSAGE_LIMIT = 6
REDACTED = "[STATIC]"
CALLSIGNS = {"handler": "MAGPIE", "agent": "WREN"}
