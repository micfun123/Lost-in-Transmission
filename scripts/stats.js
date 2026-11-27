// Summarises the analytics file: time spent per game and how far players get.
// Usage: node scripts/stats.js [file]   (defaults to $ANALYTICS_FILE). The server also shows it at /stats.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const minutes = (seconds) => `${(seconds / 60).toFixed(1)} min`;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function report(text) {
  const events = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const rooms = events.filter((event) => event.event === "room");
  const games = rooms.filter((room) => room.paired);
  const cases = events.filter((event) => event.event === "case");
  const lines = [`Games played: ${games.length} (plus ${rooms.length - games.length} rooms nobody joined)`];

  if (games.length) {
    const seconds = games.map((game) => game.seconds);
    lines.push(`Time per game: median ${minutes(median(seconds))}, average ${minutes(seconds.reduce((a, b) => a + b, 0) / seconds.length)}`);
    lines.push("", "Cases cleared per game:");
    const most = Math.max(...games.map((game) => game.cases_cleared));
    for (let count = 0; count <= most; count += 1) {
      const total = games.filter((game) => game.cases_cleared === count).length;
      lines.push(`  ${count}: ${total} game${total === 1 ? "" : "s"}`);
    }
  }

  lines.push("", `${"Case".padEnd(22)} Attempts  Cleared  Failed  Median time to clear`);
  const byCase = Map.groupBy(cases, (event) => event.case);
  for (const number of [...byCase.keys()].sort((a, b) => a - b)) {
    const attempts = byCase.get(number);
    const cleared = attempts.filter((event) => event.outcome !== "failed");
    const label = `${number} ${attempts[0].name}`.slice(0, 22).padEnd(22);
    lines.push(`${label} ${String(attempts.length).padStart(8)}  ${String(cleared.length).padStart(7)}  ${String(attempts.length - cleared.length).padStart(6)}  ${cleared.length ? minutes(median(cleared.map((e) => e.seconds))) : "-"}`);
  }
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? process.env.ANALYTICS_FILE;
  if (!file) throw new Error("Pass the analytics file, or set ANALYTICS_FILE.");
  process.stdout.write(report(readFileSync(file, "utf8")));
}
