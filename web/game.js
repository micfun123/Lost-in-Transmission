// Browser client: talks to the server over /ws, handles input, and redraws on every change.
import { MESSAGE_LIMIT, REDACTED } from "./radio.js";
import { interferenceIntensity, StaticNoise } from "./interference.js";
import { renderBriefingModal, renderScreen } from "./screens.js";

const SESSION_KEY = "lost-in-transmission";
const TUTORIAL_KEY = "lost-in-transmission-tutorial";
const ROOM_CODE = /^[A-HJ-NP-Z2-9]{5}$/i;
const TUTORIAL_TILES = { ".": "", "#": "wall", D: "package", E: "drop", W: "wren" };
const MOVEMENT_KEYS = {
  ArrowUp: "up", w: "up", ArrowLeft: "left", a: "left",
  ArrowDown: "down", s: "down", ArrowRight: "right", d: "right",
};

function readSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return typeof session?.code === "string" && typeof session.token === "string" ? session : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // The open tab can still reconnect using the session in memory.
  }
}

function setupTutorial(dialog) {
  for (const map of dialog.querySelectorAll("[data-map]")) {
    const [fogX, fogY] = (map.dataset.fog ?? "").split(",").map(Number);
    map.dataset.map.split(" ").forEach((row, y) => [...row].forEach((tile, x) => {
      const fogged = map.dataset.fog && (Math.abs(x - fogX) > 1 || Math.abs(y - fogY) > 1);
      const cell = document.createElement("span");
      cell.className = `tile ${fogged ? "unknown" : TUTORIAL_TILES[tile]}`;
      if (tile === "W") cell.textContent = "W";
      map.append(cell);
    }));
  }
  const steps = dialog.querySelectorAll("section");
  const back = dialog.querySelector("#tutorial-back");
  const next = dialog.querySelector("#tutorial-next");
  let step = 0;
  const show = (index) => {
    step = index;
    steps.forEach((section, i) => { section.hidden = i !== index; });
    dialog.querySelector("#tutorial-step").textContent = index + 1;
    back.disabled = index === 0;
    next.textContent = index === steps.length - 1 ? "Play" : "Next";
  };
  back.addEventListener("click", () => show(step - 1));
  next.addEventListener("click", () => (step === steps.length - 1 ? dialog.close() : show(step + 1)));
  return () => {
    show(0);
    dialog.showModal();
    try {
      localStorage.setItem(TUTORIAL_KEY, "seen");
    } catch {
      // Without storage the tutorial just opens again on the next visit.
    }
  };
}

const openTutorial = setupTutorial(document.getElementById("tutorial"));

class Game {
  constructor(root, dialog, briefingDialog) {
    this.root = root;
    this.dialog = dialog;
    this.briefingDialog = briefingDialog;
    this.session = readSession();
    this.state = null;
    this.stateAt = 0;
    this.staticNoise = null;
    this.socket = null;
    this.resuming = false;
    this.notice = "";
    const joinCode = new URLSearchParams(location.search).get("join") ?? "";
    this.code = ROOM_CODE.test(joinCode) ? joinCode.toUpperCase() : "";
    this.autoJoin = Boolean(this.code);
    this.copied = false;
    this.draft = [];
    this.category = "PLACE";

    root.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (button && !button.disabled) this.command(button.dataset.action, button.dataset.value);
    });
    root.addEventListener("input", (event) => {
      if (event.target.id !== "room-code") return;
      this.code = event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 5);
      if (event.target.value !== this.code) event.target.value = this.code;
      document.getElementById("join-room").disabled = !this.online || this.code.length !== 5;
    });
    root.addEventListener("submit", (event) => {
      if (event.target.id !== "join-form") return;
      event.preventDefault();
      this.command("join");
    });
    dialog.addEventListener("close", () => {
      if (dialog.returnValue === "leave") this.command("leave");
    });
    briefingDialog.addEventListener("click", (event) => {
      if (event.target !== briefingDialog) return;
      const rect = briefingDialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) briefingDialog.close();
    });
    document.addEventListener("keydown", (event) => this.onKey(event));

    this.render();
    this.connect();
    setInterval(() => this.updateTimer(), 250);
  }

  get online() {
    return this.socket?.readyState === WebSocket.OPEN && !this.resuming;
  }

  get available() {
    return this.online && Boolean(this.state?.paired);
  }

  get composing() {
    return this.available && this.state.phase === "active" &&
      this.state.stage === (this.state.role === "handler" ? "order" : "report");
  }

  get moving() {
    return this.available && this.state.phase === "active" &&
      this.state.role === "agent" && this.state.stage === "moves";
  }

  get canDecrypt() {
    return this.available && this.state.key && this.state.incoming?.tiles.includes(REDACTED);
  }

  get status() {
    if (!this.online) {
      return this.session ? "Reconnecting to the channel…" : "Connecting to the channel…";
    }
    if (this.state && this.state.phase !== "lobby" && !this.state.paired) {
      return "Partner disconnected. Channel paused.";
    }
    return this.notice;
  }

  connect() {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${scheme}//${location.host}/ws`);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.resuming = Boolean(this.session);
      this.notice = "";
      if (this.session) this.send({ type: "resume", ...this.session });
      else if (this.autoJoin) this.command("join");
      this.render();
    });
    socket.addEventListener("message", (event) => this.receive(JSON.parse(event.data)));
    socket.addEventListener("close", () => {
      if (this.state?.phase === "active" && this.state.paired && !this.resuming) {
        this.state.seconds = this.remainingSeconds();
      }
      this.resuming = false;
      this.render();
      setTimeout(() => this.connect(), 2000);
    });
  }

  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  receive(message) {
    switch (message.type) {
      case "joined":
        this.session = { code: message.code, token: message.token };
        saveSession(this.session);
        this.copied = false;
        if (this.autoJoin && message.code === this.code) {
          this.autoJoin = false;
          const url = new URL(location.href);
          url.searchParams.delete("join");
          history.replaceState(null, "", url);
        }
        break;
      case "state": {
        const old = this.state;
        const newScreen = !old || old.phase !== message.phase || old.stage !== message.stage || old.mission !== message.mission;
        if (newScreen) {
          this.draft = [];
          this.notice = "";
          this.category = message.stage === "report" ? "REPORT" : "PLACE";
        }
        if (message.phase !== "active") this.briefingDialog.close();
        this.resuming = false;
        this.state = message;
        this.stateAt = performance.now();
        this.render();
        if (newScreen) window.scrollTo(0, 0);
        break;
      }
      case "left":
      case "resume_failed":
        this.session = null;
        saveSession(null);
        this.state = null;
        this.resuming = false;
        this.notice = message.text ?? "";
        this.draft = [];
        this.dialog.close();
        this.briefingDialog.close();
        this.render();
        window.scrollTo(0, 0);
        if (message.type === "resume_failed" && this.autoJoin) this.command("join");
        break;
      case "notice":
        this.notice = message.text;
        this.render();
        break;
    }
  }

  openBriefing() {
    const content = this.briefingDialog.querySelector("#briefing-dialog-content");
    content.replaceChildren(...renderBriefingModal(this.state));
    this.briefingDialog.showModal();
  }

  async copyCode() {
    const room = this.state;
    try {
      await navigator.clipboard.writeText(room.code);
      if (this.state !== room) return;
      this.copied = true;
      clearTimeout(this.copyTimeout);
      this.copyTimeout = setTimeout(() => {
        this.copied = false;
        this.render();
      }, 2000);
    } catch {
      if (this.state !== room) return;
      this.notice = "Couldn't copy the code. Read it out to Wren instead.";
    }
    this.render();
  }

  command(action, value) {
    if (action === "lock") {
      fetch("/api/clearance/reset", { method: "POST" })
        .then(() => location.reload())
        .catch(() => {});
      return;
    }
    if (action === "tutorial") {
      openTutorial();
      return;
    }
    if (action === "briefing" && this.state?.role === "handler" && this.state.phase === "active") {
      this.openBriefing();
      return;
    }
    if (action === "copy" && this.state) {
      this.copyCode();
      return;
    }
    if (action === "static") {
      this.toggleStatic();
      return;
    }
    if (!this.online) return;
    if (action === "confirm-leave") {
      this.dialog.returnValue = "";
      this.dialog.showModal();
      return;
    }
    if (action === "category" || action === "tile" || action === "remove") {
      if (!this.composing) return;
      if (action === "category") this.category = value;
      if (action === "tile" && this.draft.length < MESSAGE_LIMIT) this.draft.push(value);
      if (action === "remove") this.draft.splice(Number(value), 1);
      this.render();
      return;
    }
    let message = { type: action };
    if (action === "transmit") {
      if (!this.composing || !this.draft.length) return;
      message = { type: "radio", tiles: this.draft };
    } else if (action === "join") {
      if (this.state || this.code.length !== 5) return;
      message.code = this.code;
    } else if (action === "move") {
      message.direction = value;
    }
    if (this.send(message)) {
      this.notice = "";
      if (action === "transmit") this.draft = [];
      this.render();
    }
  }

  onKey(event) {
    if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]")) return;
    const key = event.key.toLowerCase();
    if (event.target instanceof HTMLInputElement) {
      if (key === "escape") event.target.blur();
      return;
    }
    if (key === "escape" && this.state) {
      this.command("confirm-leave");
      return;
    }
    if (key === "enter") {
      if (event.target.matches?.("button:focus-visible")) return;
      event.preventDefault();
      if (!this.state) document.getElementById("room-code")?.focus();
      else if (this.composing) this.command("transmit");
      else if (this.moving) this.command("end_moves");
      else if (this.available && this.state.phase !== "active" && !this.state.ready.includes(this.state.role)) {
        this.command("ready");
      }
      return;
    }
    if (!this.moving || this.state.points === 0) return;
    const direction = MOVEMENT_KEYS[event.key] ?? MOVEMENT_KEYS[key];
    if (typeof direction === "string" || key === "e") {
      event.preventDefault();
      if (key === "e") this.command("interact");
      else this.command("move", direction);
    }
  }

  remainingSeconds() {
    return Math.max(0, this.state.seconds - (performance.now() - this.stateAt) / 1000);
  }

  async toggleStatic() {
    try {
      if (!this.staticNoise) this.staticNoise = new StaticNoise();
      await this.staticNoise.setEnabled(!this.staticNoise.enabled);
      this.notice = "";
    } catch (error) {
      console.error("Unable to toggle radio static", error);
      this.notice = "Radio static could not start. Check your browser audio settings.";
    }
    this.render();
  }

  updateTimer() {
    const timer = document.getElementById("timer");
    if (!timer) return;
    const seconds = Math.floor(this.available ? this.remainingSeconds() : this.state.seconds);
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    const text = `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
    if (timer.textContent !== text) timer.textContent = text;
  }

  render() {
    const focused = document.activeElement;
    const inGame = this.root.contains(focused);
    const selection = inGame && focused instanceof HTMLInputElement ? focused.selectionStart : null;
    this.root.replaceChildren(renderScreen(this));
    this.staticNoise?.update(
      this.state?.phase === "active",
      interferenceIntensity(this.state?.interference),
    );
    if (inGame) {
      let replacement;
      if (focused.id) {
        replacement = document.getElementById(focused.id);
      } else if (focused.dataset.action) {
        replacement = [...this.root.querySelectorAll("button[data-action]")].find((button) =>
          button.dataset.action === focused.dataset.action && button.dataset.value === focused.dataset.value);
      }
      replacement?.focus({ preventScroll: true });
      if (selection !== null) replacement?.setSelectionRange(selection, selection);
    }
    this.updateTimer();
  }
}

new Game(
  document.getElementById("game"),
  document.getElementById("leave-dialog"),
  document.getElementById("briefing-dialog"),
);
try {
  if (!localStorage.getItem(TUTORIAL_KEY)) openTutorial();
} catch {
  // Storage is blocked, so skip the first-visit tutorial; the lobby button still opens it.
}
