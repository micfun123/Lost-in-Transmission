// Radio words shared by the browser and the server. The server rejects any word not listed here.
export const WORD_GROUPS = {
  ACTION: ["GO", "TAKE", "DROP", "WAIT", "USE", "RETURN"],
  DIRECTION: ["NORTH", "EAST", "SOUTH", "WEST", "LEFT", "RIGHT"],
  PLACE: ["CAFE", "FOUNTAIN", "STATION", "PARK", "BANK", "TOWER"],
  COLOUR: ["RED", "BLUE", "GREEN", "BLACK", "WHITE", "GREY"],
  ITEM: ["BRIEFCASE", "ENVELOPE", "RECORDING", "UMBRELLA", "PAPER", "KEY"],
  NUMBER: ["1", "2", "3", "4", "5", "6"],
  REPORT: ["YES", "NO", "GUARD", "CLEAR", "BLOCKED", "READY"],
};
export const MESSAGE_LIMIT = 6;
export const REDACTED = "[STATIC]";
export const CALLSIGNS = { handler: "MAGPIE", agent: "WREN" };
