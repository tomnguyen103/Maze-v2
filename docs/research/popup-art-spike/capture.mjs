// Capture for the art spike: each canvas at its own device pixel ratio, plus one sheet for each DPR.
// Start the page first (npx vite docs/research/popup-art-spike --port 5199), then run this file with node.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = "docs/research/popup-art-spike/crops";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const dpr of [1, 2, 3]) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  // One sheet per DPR: the column of cells drawn for this DPR, at both sizes.
  for (const size of [24, 32]) {
    const cells = await page.locator(`[data-cell$="-${size}-${dpr}"]`).all();
    const boxes = [];
    for (const c of cells) boxes.push(await c.boundingBox());
    const x = Math.min(...boxes.map((b) => b.x)) - 4, y = Math.min(...boxes.map((b) => b.y)) - 4;
    const x2 = Math.max(...boxes.map((b) => b.x + b.width)) + 4, y2 = Math.max(...boxes.map((b) => b.y + b.height)) + 4;
    await page.screenshot({ path: `${out}/column-${size}px-dpr${dpr}.png`, clip: { x, y, width: x2 - x, height: y2 - y } });
  }
  for (const key of ["clover", "fangmoor-hunt", "fangmoor-patrol", "fangmoor-intercept", "fangmoor-lured", "fangmoor-down"]) {
    const sel = key === "clover" ? "clover-idle" : key;
    await page.locator(`[data-cell="${sel}-24-${dpr}"]`).screenshot({ path: `${out}/${sel}-24px-dpr${dpr}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log("done");
