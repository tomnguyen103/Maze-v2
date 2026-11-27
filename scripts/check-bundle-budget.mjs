import { readFile, readdir } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";
import { gzipSync } from "node:zlib";
import { loadEnv } from "vite";
import { resolveLook } from "../vite.config.mjs";

// The look comes from the first argument, else from `VITE_LOOK` read the way the build reads it.
const look = resolveLook(
  process.argv[2] ?? loadEnv("production", process.cwd(), "").VITE_LOOK
);
/** @type {Record<string, string>} */
const outDirectories = { pilot: "dist", popup: "dist-look-popup" };
const assetsDirectory = new URL(`../${outDirectories[look]}/assets/`, import.meta.url);
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
  // Game-only rules split out of the shared sheet to hold its ceiling.
  // Budgeted so the bytes moved out stay measured rather than growing unpoliced.
  // The game dialog rules moved here too: 4.88 KB measured, plus room for the
  // Journey dialog restyle. The shared sheet fell from 12.88 KB to 9.20 KB.
  { label: "game styles", prefix: "main-", suffix: ".css", maxKb: 6 },
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
  {
    label: "Lifetime Membership JavaScript",
    prefix: "lifetime-view-",
    suffix: ".js",
    maxKb: 2
  },
  {
    label: "Run Records JavaScript",
    prefix: "run-records-view-",
    suffix: ".js",
    maxKb: 2
  },
  {
    label: "Verified Daily Board JavaScript",
    prefix: "verified-daily-board-",
    suffix: ".js",
    maxKb: 1
  },
  {
    label: "Quest Atlas opener JavaScript",
    prefix: "quest-atlas-opener-",
    suffix: ".js",
    maxKb: 2
  },
  {
    label: "Run Replay opener JavaScript",
    prefix: "run-replay-opener-",
    suffix: ".js",
    maxKb: 1
  },
  {
    label: "Lantern Journal render JavaScript",
    prefix: "lantern-journal-render-",
    suffix: ".js",
    maxKb: 1
  },
  {
    label: "Workshop opener JavaScript",
    prefix: "workshop-opener-",
    suffix: ".js",
    maxKb: 2
  },
  {
    label: "Access Settings opener JavaScript",
    prefix: "access-settings-opener-",
    suffix: ".js",
    maxKb: 1
  },
  {
    label: "Daily Constellation board JavaScript",
    prefix: "daily-constellation-board-",
    suffix: ".js",
    maxKb: 1
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
  // Every asset per prefix counts: a `?retry=1` import emits a second chunk with the same prefix.
  const matched = prefixes.map((prefix) =>
    files.filter(
      (candidate) =>
        candidate.startsWith(prefix) && candidate.endsWith(budget.suffix)
    )
  );
  if (matched.some((group) => group.length === 0)) {
    if (budget.optional) {
      process.stdout.write(`SKIP ${budget.label}: not built
`);
      continue;
    }
    const missing = prefixes.filter((_, at) => matched[at].length === 0);
    throw new Error(
      `[${look}] Could not find ${budget.label} in ${outDirectories[look]}/assets (${missing.join(", ")}).`
    );
  }
  // Each retry duplicate is a separate download, so it faces the row limit alone.
  // Prefixes of one row sum (total wait); duplicates under one prefix do not.
  let gzipKb = 0;
  for (const group of matched) {
    let largest = 0;
    for (const file of group) {
      const bytes = await readFile(new URL(file, assetsDirectory));
      largest = Math.max(largest, gzipSync(bytes).byteLength / 1024);
    }
    gzipKb += largest;
  }
  const result = `[${look}] ${budget.label}: ${gzipKb.toFixed(2)} KB gzip / ${budget.maxKb} KB`;
  if (gzipKb > budget.maxKb) {
    failed = true;
    process.stderr.write(`OVER ${result}\n`);
  } else {
    process.stdout.write(`PASS ${result}\n`);
  }
}

// index.html loads the entry chunk. A dynamic-import preload map that names
// it again adds a <link rel="modulepreload"> that is never used.
for (const file of files.filter((name) => name.endsWith(".js"))) {
  const source = await readFile(new URL(file, assetsDirectory), "utf8");
  if (/"assets\/index-[^"]*\.js"/.test(source)) {
    failed = true;
    process.stderr.write(`PRELOAD [${look}] ${file} lists the entry chunk in its preload map\n`);
  }
}

if (failed) {
  process.exitCode = 1;
}
