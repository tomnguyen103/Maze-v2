// Captures each mockup direction in Light and Night at 375, 1280, and 1920 px.
// Run: node docs/design/mockups/2026-11-26/capture.mjs [direction ...]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const DIRECTIONS = process.argv.length > 2 ? process.argv.slice(2) : ["pilot-chart", "sounding", "cut-paper"];
const SIZES = [[375, 812, 2], [1280, 800, 1], [1920, 1080, 1]];
const browser = await chromium.launch();
let failed = false;
for (const direction of DIRECTIONS) {
  mkdirSync(new URL(`./${direction}/captures/`, import.meta.url), { recursive: true });
  for (const theme of ["light", "night"]) {
    for (const [width, height, deviceScaleFactor] of SIZES) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
      page.on("pageerror", (error) => { failed = true; console.error(direction, theme, width, error.message); });
      await page.goto(new URL(`./${direction}/index.html?theme=${theme}`, import.meta.url).href);
      await page.evaluate(() => document.fonts.ready);
      const shot = (name, fullPage) => page.screenshot({ path: new URL(`./${direction}/captures/${name}.png`, import.meta.url).pathname.slice(1), fullPage });
      await shot(`${theme}-${width}`, false);
      if (width !== 1920) await shot(`${theme}-${width}-full`, true);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const board = await page.evaluate(() => Math.round(document.getElementById("board").getBoundingClientRect().width));
      if (overflow > 0) failed = true;
      console.log(direction, theme, width, `board ${board}px`, `overflow ${overflow}px`);
      await page.close();
    }
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
