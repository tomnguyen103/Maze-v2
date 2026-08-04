import { readFile, readdir } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";
import { gzipSync } from "node:zlib";

const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const files = await readdir(assetsDirectory);
const budgets = [
  { label: "landing JavaScript", prefix: "index-", suffix: ".js", maxKb: 8 },
  // Every chunk an Explorer downloads to start a Run, summed. Measuring
  // `main-` alone let the two heaviest pieces — the engine and the renderer —
  // grow outside the ceiling this budget exists to hold, so the gate reported
  // 26% less than the real weight and passed at 99% headroom.
  {
    label: "game JavaScript",
    prefixes: ["main-", "game-session-", "canvas-renderer-"],
    suffix: ".js",
    maxKb: 42
  },
  {
    label: "Campfire Resume JavaScript",
    prefix: "active-run-recovery-",
    suffix: ".js",
    maxKb: 5
  },
  // Raised from 12 KB deliberately, not to stop it complaining. The A+ audit
  // remediation added a `:focus` floor so script-moved focus is visible, a
  // text-safe contrast pair, and a three-step ordinal ramp — all of them
  // things the stylesheet has to carry. 12.02 KB against a 12 KB ceiling was
  // a real signal; this is the new honest number plus a little room.
  { label: "shared styles", prefix: "index-", suffix: ".css", maxKb: 13 },
  {
    label: "Trail Compass JavaScript",
    prefix: "trail-compass-",
    suffix: ".js",
    maxKb: 6
  },
  {
    label: "Class Expedition play JavaScript",
    prefix: "class-expedition-play-",
    suffix: ".js",
    maxKb: 5
  },
  {
    label: "Question Narration JavaScript",
    prefix: "question-narration-",
    suffix: ".js",
    maxKb: 6
  },
  // Extracted from the game chunk to hold the 30 KB ceiling. Budgeted so the
  // bytes moved out stay measured rather than growing unpoliced.
  {
    label: "Deck picker JavaScript",
    prefix: "deck-picker-",
    suffix: ".js",
    maxKb: 2
  },
  {
    label: "Daily submission JavaScript",
    prefix: "daily-submission-",
    suffix: ".js",
    maxKb: 2
  },
  {
    label: "Lantern Journal continuity JavaScript",
    prefix: "journal-continuity-",
    suffix: ".js",
    maxKb: 3
  },
  {
    label: "Daily Constellation JavaScript",
    prefix: "daily-constellation-view-",
    suffix: ".js",
    maxKb: 2
  },
  {
    label: "Offline continuity JavaScript",
    prefix: "offline-continuity-view-",
    suffix: ".js",
    maxKb: 3
  },
  {
    label: "Echo Postcard JavaScript",
    prefix: "echo-postcard-",
    suffix: ".js",
    maxKb: 2
  },
  { label: "optional Clerk", prefix: "clerk-", suffix: ".js", maxKb: 600 },
  // Loaded only on /admin. Budgeted from the start so phase 7's dashboard
  // grows against a number rather than unpoliced.
  { label: "admin JavaScript", prefix: "admin-controller-", suffix: ".js", maxKb: 20 },
  // Exists only when VITE_SENTRY_DSN was set at build time; an unset DSN
  // eliminates the chunk, so absence is a pass, not a missing asset.
  {
    label: "optional Sentry",
    prefix: "error-reporting-",
    suffix: ".js",
    maxKb: 120,
    optional: true
  }
];

let failed = false;
for (const budget of budgets) {
  // A budget may name several prefixes: what matters to a player is the total
  // they wait for, not how the bundler happened to split it.
  const prefixes = budget.prefixes ?? [budget.prefix];
  const matched = prefixes.map((prefix) =>
    files.find(
      (candidate) =>
        candidate.startsWith(prefix) && candidate.endsWith(budget.suffix)
    )
  );
  if (matched.some((file) => !file)) {
    if (budget.optional) {
      process.stdout.write(`SKIP ${budget.label}: not built
`);
      continue;
    }
    const missing = prefixes.filter((_, at) => !matched[at]);
    throw new Error(
      `Could not find ${budget.label} in dist/assets (${missing.join(", ")}).`
    );
  }
  let gzipKb = 0;
  for (const file of matched) {
    const bytes = await readFile(new URL(String(file), assetsDirectory));
    gzipKb += gzipSync(bytes).byteLength / 1024;
  }
  const result = `${budget.label}: ${gzipKb.toFixed(2)} KB gzip / ${budget.maxKb} KB`;
  if (gzipKb > budget.maxKb) {
    failed = true;
    process.stderr.write(`OVER ${result}\n`);
  } else {
    process.stdout.write(`PASS ${result}\n`);
  }
}

if (failed) {
  process.exitCode = 1;
}
