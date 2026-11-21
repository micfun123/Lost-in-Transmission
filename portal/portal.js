const oceanSummary = document.getElementById("portal-ocean-summary");
const bottlesLive = document.getElementById("portal-bottles-live");

async function loadOceanTelemetry() {
  try {
    const response = await fetch("/api/bottles/status");
    if (!response.ok) return;
    const { ocean } = await response.json();
    if (!ocean) return;

    if (oceanSummary) {
      oceanSummary.textContent = `${ocean.shoreCount} ashore · ${ocean.driftingCount} adrift · ${ocean.lostCount} lost`;
    }
    if (bottlesLive) {
      bottlesLive.textContent =
        `${ocean.shoreCount} bottles washed ashore (${ocean.contaminatedShoreCount} SO14 quarantined), ${ocean.lostCount} in the graveyard`;
    }
  } catch {
    if (oceanSummary) oceanSummary.textContent = "Tide telemetry standby";
  }
}

loadOceanTelemetry();
