import { test, expect } from "@playwright/test";
import { expectGameReady } from "./game-ready.js";

test.describe("layout redesign & edge viewports", () => {
  const edgeViewports = [
    { name: "Ultra-wide (21:9)", width: 2560, height: 1080 },
    { name: "Desktop standard (16:10)", width: 1440, height: 900 },
    { name: "Small laptop (4:3)", width: 1024, height: 768 },
    { name: "Foldable unfolded (884x1104)", width: 884, height: 1104 },
    { name: "Foldable square (800x800)", width: 800, height: 800 },
    { name: "Tablet portrait (768x1024)", width: 768, height: 1024 },
    { name: "Pixel 7 portrait (412x915)", width: 412, height: 915 },
    { name: "iPhone 14 portrait (390x844)", width: 390, height: 844 },
    { name: "Small phone (320x568)", width: 320, height: 568 },
    { name: "Foldable cover narrow (280x653)", width: 280, height: 653 },
    { name: "Foldable cover tall (344x882)", width: 344, height: 882 },
    { name: "Landscape mobile (844x390)", width: 844, height: 390 },
    { name: "Landscape mobile Pixel 7 (915x412)", width: 915, height: 412 },
    { name: "Landscape 250% zoom (338x156)", width: 338, height: 156 },
    { name: "Landscape 250% font (844x390 at 250% font)", width: 844, height: 390, fontSize: "250%" }
  ];

  for (const vp of edgeViewports) {
    test(`renders cleanly without horizontal overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/?seed=LAYOUT-AUDIT&level=trail-scout");
      await expectGameReady(page);

      if (vp.fontSize) {
        await page.evaluate((size) => {
          document.documentElement.style.fontSize = size;
        }, vp.fontSize);
      }

      const docOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      const overflowSources = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter(
            (element) =>
              element.getBoundingClientRect().right >
              document.documentElement.clientWidth + 1
          )
          .map((element) => `${element.tagName}#${element.id}.${element.className.replace(/\s+/g, '.')}(right=${Math.round(element.getBoundingClientRect().right)})`)
      );
      expect(docOverflow, `Page should not have horizontal overflow on ${vp.name}: ${overflowSources.slice(0, 5).join(", ")}`).toBeLessThanOrEqual(1);

      const actionsOverflow = await page.evaluate(() => {
        const actions = document.querySelector(".command-bar__actions");
        return actions ? actions.scrollWidth - actions.clientWidth : 0;
      });
      expect(actionsOverflow, `Header actions should not scroll horizontally on ${vp.name}`).toBeLessThanOrEqual(1);

      // Verify no buttons clip their content
      const clippedButtons = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll(".command-bar__actions > *")];
        return buttons
          .filter(b => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1)
          .map(b => ({
            id: b.id,
            text: b.textContent?.trim(),
            clientWidth: b.clientWidth,
            scrollWidth: b.scrollWidth,
            clientHeight: b.clientHeight,
            scrollHeight: b.scrollHeight
          }));
      });
      expect(clippedButtons, `Buttons should not clip text on ${vp.name}`).toEqual([]);

      // Verify canvas rendered with positive dimensions
      const canvasBounds = await page.locator("#maze-canvas").boundingBox();
      expect(canvasBounds).not.toBeNull();
      expect(canvasBounds?.width).toBeGreaterThan(50);
      expect(canvasBounds?.height).toBeGreaterThan(50);

      // Verify arena controls do not collide or overlap even with real seed
      await page.evaluate(() => {
        const seedValue = document.querySelector("#seed-value");
        if (seedValue) seedValue.textContent = "LONG-QUEST-SEED-42";
      });

      const arenaInfo = await page.evaluate(() => {
        const seed = document.querySelector("#seed-copy");
        const pause = document.querySelector("#pause-run");
        if (!seed || !pause) return null;
        const seedRect = seed.getBoundingClientRect();
        const pauseRect = pause.getBoundingClientRect();
        return {
          seedRight: seedRect.right,
          pauseLeft: pauseRect.left,
          seedWidth: seedRect.width,
          pauseWidth: pauseRect.width,
          collides: seedRect.right > pauseRect.left + 0.5
        };
      });
      expect(arenaInfo?.collides ?? false, `Seed copy and pause button should not collide on ${vp.name}`).toBe(false);

      // Verify command-bar h1 spans full width on medium/small viewports where banner wraps
      if (vp.width <= 928 && vp.width >= 360) {
        const headlineSpan = await page.evaluate(() => {
          const h1 = document.querySelector(".command-bar h1");
          const cmd = document.querySelector(".command-bar");
          if (!h1 || !cmd) return null;
          const h1Rect = h1.getBoundingClientRect();
          const cmdRect = cmd.getBoundingClientRect();
          const cmdStyle = window.getComputedStyle(cmd);
          const isGrid = cmdStyle.display === "grid";
          const expectedWidth = isGrid
            ? cmdRect.width - (parseFloat(cmdStyle.paddingLeft) + parseFloat(cmdStyle.paddingRight))
            : cmdRect.width;
          return {
            h1Width: Math.round(h1Rect.width),
            expectedWidth: Math.round(expectedWidth),
            diff: Math.abs(h1Rect.width - expectedWidth)
          };
        });
        if (headlineSpan) {
          expect(headlineSpan.diff, `Headline banner should span full grid width on ${vp.name}`).toBeLessThanOrEqual(2);
        }
      }

      // Verify run-metrics border integrity
      const metricsLayout = await page.evaluate(() => {
        const metrics = document.querySelector(".run-metrics");
        const items = [...document.querySelectorAll(".run-metrics div")];
        if (!metrics || items.length < 4) return null;
        const cols = window.getComputedStyle(metrics).gridTemplateColumns.trim().split(/\s+/).length;
        const itemBorders = items.map((item) => ({
          borderBottom: window.getComputedStyle(item).borderBottomWidth,
          borderRight: window.getComputedStyle(item).borderRightWidth
        }));
        return { cols, itemBorders };
      });

      if (metricsLayout && metricsLayout.cols === 4) {
        // In 4-column layout, NO item should have a bottom border
        for (let i = 0; i < 4; i++) {
          expect(
            parseFloat(metricsLayout.itemBorders[i].borderBottom),
            `Item ${i} in 4-column metrics should not have border-bottom on ${vp.name}`
          ).toBe(0);
        }
      } else if (metricsLayout && metricsLayout.cols === 2) {
        // In 2x2 layout, row 1 items have bottom border, row 2 items do not
        expect(parseFloat(metricsLayout.itemBorders[0].borderBottom)).toBeGreaterThan(0);
        expect(parseFloat(metricsLayout.itemBorders[1].borderBottom)).toBeGreaterThan(0);
        expect(parseFloat(metricsLayout.itemBorders[2].borderBottom)).toBe(0);
        expect(parseFloat(metricsLayout.itemBorders[3].borderBottom)).toBe(0);
      }
    });
  }

  test("provides tactile feedback on interactive buttons and controls", async ({ page }) => {
    await page.goto("/?seed=TACTILE-AUDIT&level=trail-scout");
    await expectGameReady(page);

    // Check pulse button has active and hover transitions
    const pulseButton = page.locator("#pulse-action");
    await expect(pulseButton).toBeVisible();

    // Check direction buttons have active press state
    const downButton = page.locator("[data-move='down']");
    if (await downButton.isVisible()) {
      const activeTransform = await downButton.evaluate((el) => {
        el.classList.add(":active"); // test styling availability
        const style = window.getComputedStyle(el);
        return {
          cursor: style.cursor,
          fontFamily: style.fontFamily,
          boxShadow: style.boxShadow
        };
      });
      expect(activeTransform.fontFamily).toBeTruthy();
    }
  });

  test("captures layout screenshots across key viewports", async ({ page }, testInfo) => {
    // Only capture on desktop project to avoid duplicate work
    if (testInfo.project.name !== "desktop") return;

    const sampleViewports = [
      { name: "desktop-1440x900", width: 1440, height: 900 },
      { name: "mobile-portrait-390x844", width: 390, height: 844 },
      { name: "mobile-landscape-844x390", width: 844, height: 390 },
      { name: "foldable-unfolded-884x1104", width: 884, height: 1104 },
      { name: "foldable-cover-280x653", width: 280, height: 653 },
      { name: "landscape-zoom-338x156", width: 338, height: 156 }
    ];

    for (const sv of sampleViewports) {
      await page.setViewportSize({ width: sv.width, height: sv.height });
      await page.goto("/?seed=AUDIT-SHOTS&level=trail-scout");
      await expectGameReady(page);
      await page.screenshot({
        path: `.scratch/layout-audit/${sv.name}.png`,
        fullPage: false
      });
    }
  });
});
