const REDACTION_TOKEN = "[REDACTED BY PORTSMOUTH MARITIME AUTHORITY]";

const els = {
  statShore: document.getElementById("stat-shore"),
  statDrifting: document.getElementById("stat-drifting"),
  statContaminated: document.getElementById("stat-contaminated"),
  statLost: document.getElementById("stat-lost"),
  statTide: document.getElementById("stat-tide"),
  beachcombBtn: document.getElementById("beachcomb-btn"),
  bottleCard: document.getElementById("bottle-card"),
  throwForm: document.getElementById("throw-form"),
  messageInput: document.getElementById("bottle-message"),
  aliasInput: document.getElementById("bottle-alias"),
  charCount: document.getElementById("char-count"),
  throwSubmit: document.getElementById("throw-submit"),
  throwError: document.getElementById("throw-error"),
  launchReceipt: document.getElementById("launch-receipt"),
  graveyardList: document.getElementById("graveyard-list"),
  graveyardRefresh: document.getElementById("graveyard-refresh"),
};

const seenBottleIds = [];
let activeReceiptTimer = null;

function rememberBottleId(id) {
  if (!id) return;
  const existing = seenBottleIds.indexOf(id);
  if (existing >= 0) seenBottleIds.splice(existing, 1);
  seenBottleIds.push(id);
  while (seenBottleIds.length > 25) seenBottleIds.shift();
}

function appendMessageWithRedactions(container, text) {
  const parts = String(text).split(REDACTION_TOKEN);
  parts.forEach((part, index) => {
    if (part) container.append(document.createTextNode(part));
    if (index < parts.length - 1) {
      const badge = document.createElement("span");
      badge.className = "bottle-card__redacted";
      badge.textContent = REDACTION_TOKEN;
      container.append(badge);
    }
  });
}

function renderOceanStats(ocean) {
  if (!ocean) return;
  els.statShore.textContent = String(ocean.shoreCount);
  els.statDrifting.textContent = String(ocean.driftingCount);
  els.statContaminated.textContent = String(ocean.contaminatedShoreCount);
  els.statLost.textContent = String(ocean.lostCount);

  if (ocean.driftingCount > 0 && typeof ocean.nextWashUpInMs === "number") {
    const secs = Math.max(1, Math.ceil(ocean.nextWashUpInMs / 1000));
    const noun = ocean.driftingCount === 1 ? "bottle" : "bottles";
    els.statTide.textContent = `${ocean.driftingCount} ${noun} drifting in the Solent — next tide arrival in ~${secs}s.`;
  } else {
    els.statTide.textContent = "Solent tide steady — shingle stocked and ready for beachcombing.";
  }
}

function renderBottle(bottle) {
  els.bottleCard.replaceChildren();
  els.bottleCard.classList.toggle("is-contaminated", Boolean(bottle.contaminated));

  const top = document.createElement("div");
  top.className = "bottle-card__top";

  const meta = document.createElement("div");
  meta.className = "bottle-card__meta";

  const idEl = document.createElement("span");
  idEl.className = "bottle-card__id";
  idEl.textContent = `RECOVERY FILE · ${bottle.id.toUpperCase()}`;

  const senderEl = document.createElement("strong");
  senderEl.className = "bottle-card__sender";
  senderEl.textContent = `From: ${bottle.senderAlias}`;

  meta.append(idEl, senderEl);

  const stamps = document.createElement("div");
  stamps.className = "bottle-card__stamps";

  const waterStamp = document.createElement("span");
  waterStamp.className = "bureau-stamp bureau-stamp--water";
  waterStamp.textContent = "WATER DAMAGED";
  stamps.append(waterStamp);

  if (bottle.contaminated) {
    const so14Stamp = document.createElement("span");
    so14Stamp.className = "bureau-stamp bureau-stamp--so14";
    so14Stamp.textContent = "☣ SO14 CONTAMINATED";
    stamps.append(so14Stamp);
  }

  top.append(meta, stamps);
  els.bottleCard.append(top);

  if (bottle.contaminated) {
    const warn = document.createElement("div");
    warn.className = "bottle-card__warning";
    warn.textContent =
      "BIOHAZARD ADVISORY: Vessel made unauthorised contact with SO14 waters. Ink stability compromised; wash hands after reading.";
    els.bottleCard.append(warn);
  }

  const msg = document.createElement("blockquote");
  msg.className = "bottle-card__message";
  appendMessageWithRedactions(msg, bottle.message);
  els.bottleCard.append(msg);

  const logWrap = document.createElement("div");
  const logHeading = document.createElement("span");
  logHeading.className = "bureau-caption drift-log__heading";
  logHeading.textContent = "SOLENT DRIFT LOG";

  const list = document.createElement("ol");
  list.className = "drift-log";
  (bottle.driftLog || []).forEach((step, index) => {
    const li = document.createElement("li");
    if (step.startsWith("WARNING:")) li.className = "is-warning";
    const bullet = document.createElement("span");
    bullet.className = "drift-log__bullet";
    bullet.textContent = `${String(index + 1).padStart(2, "0")} ▸`;
    const label = document.createElement("span");
    label.textContent = step;
    li.append(bullet, label);
    list.append(li);
  });

  logWrap.append(logHeading, list);
  els.bottleCard.append(logWrap);

  if (bottle.contaminated) {
    const glyph = document.createElement("span");
    glyph.className = "bottle-card__biohazard";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = "☣";
    els.bottleCard.append(glyph);
  }
}

function renderBottleError(message) {
  els.bottleCard.classList.remove("is-contaminated");
  els.bottleCard.replaceChildren();
  const p = document.createElement("p");
  p.className = "bottle-card__loading";
  p.textContent = message;
  els.bottleCard.append(p);
}

async function beachcomb() {
  els.beachcombBtn.disabled = true;
  try {
    const query = seenBottleIds.length
      ? `?exclude=${encodeURIComponent(seenBottleIds.join(","))}`
      : "";
    const response = await fetch(`/api/bottles/beachcomber${query}`);
    const data = await response.json();
    renderOceanStats(data.ocean);
    if (!response.ok || !data.bottle) {
      renderBottleError(data.error || "No bottles found on this stretch of shingle.");
      return;
    }
    rememberBottleId(data.bottle.id);
    renderBottle(data.bottle);
  } catch {
    renderBottleError("Lost contact with Station PO1 shore patrol. Try again.");
  } finally {
    els.beachcombBtn.disabled = false;
  }
}

function renderGraveyard(obituaries) {
  els.graveyardList.replaceChildren();
  if (!obituaries || obituaries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "graveyard-card";
    empty.textContent = "No recent maritime casualties logged.";
    els.graveyardList.append(empty);
    return;
  }

  for (const item of obituaries) {
    const li = document.createElement("li");
    li.className = "graveyard-card";

    const head = document.createElement("div");
    head.className = "graveyard-card__head";
    const idSpan = document.createElement("span");
    idSpan.textContent = item.id.toUpperCase();
    const stamp = document.createElement("span");
    stamp.className = "bureau-stamp bureau-stamp--lost";
    stamp.textContent = "LOST AT SEA";
    head.append(idSpan, stamp);

    const obit = document.createElement("p");
    obit.className = "graveyard-card__obituary";
    appendMessageWithRedactions(obit, item.obituary || item.message);

    const alias = document.createElement("span");
    alias.className = "graveyard-card__alias";
    alias.textContent = `Dispatched by: ${item.senderAlias}`;

    li.append(head, obit, alias);
    els.graveyardList.append(li);
  }
}

async function loadGraveyard() {
  try {
    const response = await fetch("/api/bottles/graveyard");
    const data = await response.json();
    renderOceanStats(data.ocean);
    renderGraveyard(data.obituaries);
  } catch {
    // Keep existing ledger on transient network failure.
  }
}

async function refreshStatus() {
  try {
    const response = await fetch("/api/bottles/status");
    const data = await response.json();
    renderOceanStats(data.ocean);
  } catch {
    // Ignore background polling errors.
  }
}

function renderLaunchReceipt(result) {
  if (activeReceiptTimer) {
    clearInterval(activeReceiptTimer);
    activeReceiptTimer = null;
  }

  const { bottle, fate, censored } = result;
  els.launchReceipt.hidden = false;
  els.launchReceipt.className = "launch-receipt";
  els.launchReceipt.replaceChildren();

  const head = document.createElement("div");
  head.className = "launch-receipt__head";

  const title = document.createElement("h3");
  title.className = "launch-receipt__title";

  const badge = document.createElement("span");
  badge.className = "bureau-stamp";

  if (fate === "lost") {
    els.launchReceipt.classList.add("launch-receipt--lost");
    title.textContent = `Bottle ${bottle.id.toUpperCase()} — Lost at Sea`;
    badge.classList.add("bureau-stamp--lost");
    badge.textContent = "LOST AT SEA";
  } else if (bottle.contaminated) {
    els.launchReceipt.classList.add("launch-receipt--contaminated");
    title.textContent = `Bottle ${bottle.id.toUpperCase()} — Adrift (SO14 Alert)`;
    badge.classList.add("bureau-stamp--so14");
    badge.textContent = "☣ SO14 DRIFT";
  } else {
    els.launchReceipt.classList.add("launch-receipt--drifting");
    title.textContent = `Bottle ${bottle.id.toUpperCase()} — Cast into the Solent`;
    badge.classList.add("bureau-stamp--signal");
    badge.textContent = "IN TRANSIT";
  }

  head.append(title, badge);
  els.launchReceipt.append(head);

  if (censored) {
    const censorNote = document.createElement("p");
    censorNote.className = "launch-receipt__censor";
    censorNote.textContent = "Portsmouth Maritime Authority auto-censor redacted forbidden westerly terminology.";
    els.launchReceipt.append(censorNote);
  }

  const body = document.createElement("p");
  body.className = "launch-receipt__body";

  if (fate === "lost") {
    appendMessageWithRedactions(body, `Obituary: ${bottle.obituary}`);
    els.launchReceipt.append(body);
    return;
  }

  const totalMs = Math.max(1000, bottle.etaMs ?? 25_000);
  const targetTime = Date.now() + totalMs;
  const route = bottle.driftLog || [];

  body.textContent = `Route plotted: ${route.join(" → ")}`;
  els.launchReceipt.append(body);

  const progress = document.createElement("div");
  progress.className = "drift-progress";
  const bar = document.createElement("div");
  bar.className = "drift-progress__bar";
  progress.append(bar);
  els.launchReceipt.append(progress);

  const eta = document.createElement("p");
  eta.className = "launch-receipt__eta";
  els.launchReceipt.append(eta);

  const tick = () => {
    const remaining = Math.max(0, targetTime - Date.now());
    const ratio = Math.min(1, 1 - remaining / totalMs);
    bar.style.width = `${Math.round(ratio * 100)}%`;

    if (remaining <= 0) {
      eta.textContent = "Washed ashore! Click “Search the Shore” — your bottle is now in the Solent pool.";
      badge.textContent = bottle.contaminated ? "☣ ASHORE" : "WASHED UP";
      clearInterval(activeReceiptTimer);
      activeReceiptTimer = null;
      refreshStatus();
      return;
    }

    const stepIndex = Math.min(route.length - 1, Math.floor(ratio * Math.max(1, route.length - 1)));
    const secs = Math.ceil(remaining / 1000);
    eta.textContent = `${route[stepIndex] || "Drifting in the Solent"}… ETA ${secs}s`;
  };

  tick();
  activeReceiptTimer = setInterval(tick, 500);
}

els.messageInput.addEventListener("input", () => {
  els.charCount.textContent = `${els.messageInput.value.length} / 500`;
});

els.throwForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.throwError.textContent = "";

  const message = els.messageInput.value.trim();
  const senderAlias = els.aliasInput.value.trim();
  if (!message) {
    els.throwError.textContent = "Write a message before corking the bottle.";
    els.messageInput.focus();
    return;
  }

  els.throwSubmit.disabled = true;
  try {
    const response = await fetch("/api/bottles/throw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, senderAlias: senderAlias || undefined }),
    });
    const data = await response.json();
    if (!response.ok) {
      els.throwError.textContent = data.error || "Could not launch bottle.";
      return;
    }

    els.messageInput.value = "";
    els.charCount.textContent = "0 / 500";
    renderOceanStats(data.ocean);
    renderLaunchReceipt(data);
    if (data.fate === "lost") loadGraveyard();
  } catch {
    els.throwError.textContent = "Station PO1 could not reach the harbour slipway. Try again.";
  } finally {
    els.throwSubmit.disabled = false;
  }
});

els.beachcombBtn.addEventListener("click", beachcomb);
els.graveyardRefresh.addEventListener("click", loadGraveyard);

beachcomb();
loadGraveyard();
setInterval(refreshStatus, 8000);
