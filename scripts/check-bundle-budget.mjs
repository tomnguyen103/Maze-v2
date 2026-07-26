import { readFile, readdir } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";
import { gzipSync } from "node:zlib";

const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const files = await readdir(assetsDirectory);
const budgets = [
  { label: "landing JavaScript", prefix: "index-", suffix: ".js", maxKb: 8 },
  { label: "game JavaScript", prefix: "main-", suffix: ".js", maxKb: 30 },
  { label: "shared styles", prefix: "index-", suffix: ".css", maxKb: 12 },
  { label: "optional Clerk", prefix: "clerk-", suffix: ".js", maxKb: 600 }
];

let failed = false;
for (const budget of budgets) {
  const file = files.find(
    (candidate) =>
      candidate.startsWith(budget.prefix) &&
      candidate.endsWith(budget.suffix)
  );
  if (!file) {
    throw new Error(`Could not find ${budget.label} in dist/assets.`);
  }
  const bytes = await readFile(new URL(file, assetsDirectory));
  const gzipKb = gzipSync(bytes).byteLength / 1024;
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
