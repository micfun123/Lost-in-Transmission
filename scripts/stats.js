// Summarises the analytics file: time spent per game and how far players get.
// Usage: node scripts/stats.js [file]   (defaults to $ANALYTICS_FILE)
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? process.env.ANALYTICS_FILE;
if (!file) throw new Error("Pass the analytics file, or set ANALYTICS_FILE.");

const events = readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const games = events.filter((event) => event.event === "room" && event.paired);
const cases = events.filter((event) => event.event === "case");

const minutes = (seconds) => `${(seconds / 60).toFixed(1)} min`;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

console.log(`Games played: ${games.length} (plus ${events.filter((e) => e.event === "room" && !e.paired).length} rooms nobody joined)`);
if (games.length) {
  const seconds = games.map((game) => game.seconds);
  console.log(`Time per game: median ${minutes(median(seconds))}, average ${minutes(seconds.reduce((a, b) => a + b, 0) / seconds.length)}`);
  console.log("\nCases cleared per game:");
  const most = Math.max(...games.map((game) => game.cases_cleared));
  for (let count = 0; count <= most; count += 1) {
    const games_ = games.filter((game) => game.cases_cleared === count).length;
    console.log(`  ${count}: ${games_} game${games_ === 1 ? "" : "s"}`);
  }
}

console.log(`\n${"Case".padEnd(22)} Attempts  Cleared  Failed  Median time to clear`);
const byCase = Map.groupBy(cases, (event) => event.case);
for (const number of [...byCase.keys()].sort((a, b) => a - b)) {
  const attempts = byCase.get(number);
  const cleared = attempts.filter((event) => event.outcome !== "failed");
  const label = `${number} ${attempts[0].name}`.slice(0, 22).padEnd(22);
  console.log(`${label} ${String(attempts.length).padStart(8)}  ${String(cleared.length).padStart(7)}  ${String(attempts.length - cleared.length).padStart(6)}  ${cleared.length ? minutes(median(cleared.map((e) => e.seconds))) : "-"}`);
}
