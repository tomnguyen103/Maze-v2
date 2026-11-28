import { test, expect } from "@playwright/test";
import { expectGameReady } from "./game-ready.js";
import { applyAction, createRun } from "../../src/game/game-session.js";
import { getQuestRunRuleset } from "../../src/game/run-ruleset.js";
import { getLabyrinthConfig } from "../../src/questions/quest-levels.js";

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

      // Overflow past the left edge cannot scroll, so scrollWidth never shows it.
      const clippedLeft = await page.evaluate(() =>
        [...document.querySelectorAll(".play-grid, .play-grid > *")]
          .filter((element) => element.getBoundingClientRect().left < -1)
          .map((element) => element.className)
      );
      expect(clippedLeft, `Play layout should not clip past the left edge on ${vp.name}`).toEqual([]);

      // The tab row scrolls sideways when it cannot fit. Every tab must stay reachable:
      // at scroll 0 the first tab starts inside the row, and the scroll range reaches the last tab.
      // An end-aligned row without `safe` pushed the first tabs past the left edge, where no scroll reaches.
      const unreachableTabs = await page.evaluate(() => {
        const actions = document.querySelector(".command-bar__actions");
        if (!(actions instanceof HTMLElement)) return [];
        actions.scrollLeft = 0;
        const row = actions.getBoundingClientRect();
        const tabs = [...actions.children];
        return tabs
          .filter((tab) => {
            const box = tab.getBoundingClientRect();
            if (box.width === 0) return false;
            return box.left < row.left - 1 || box.right - row.left > actions.scrollWidth + 1;
          })
          .map((tab) => tab.textContent?.trim());
      });
      expect(unreachableTabs, `Header tabs must stay reachable on ${vp.name}`).toEqual([]);

      // Under 48rem the tab row scrolls sideways by design; wider shells fit it whole.
      // At scaled text the 48rem query still reads the shell as wide, so the row
      // scrolls there too, and the reachability check above covers it.
      if (!vp.fontSize) {
        const actionsOverflow = await page.evaluate(() => {
          const actions = document.querySelector(".command-bar__actions");
          return actions && window.innerWidth > 768 ? actions.scrollWidth - actions.clientWidth : 0;
        });
        expect(actionsOverflow, `Header tabs should fit without scrolling on ${vp.name}`).toBeLessThanOrEqual(1);
      }

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

      await expect(page.locator("#seed-copy")).toBeVisible();
      await expect(page.locator("#pause-run")).toBeVisible();

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
          collides:
            seedRect.right > pauseRect.left + 0.5 &&
            seedRect.left < pauseRect.right - 0.5 &&
            seedRect.bottom > pauseRect.top + 0.5 &&
            seedRect.top < pauseRect.bottom - 0.5
        };
      });
      expect(arenaInfo?.collides ?? false, `Seed copy and pause button should not collide on ${vp.name}`).toBe(false);

      // Popup Readout: four bookmarks hang from the top edge. Each has a ruled bottom and no top edge, and none overlap.
      const metricsLayout = await page.evaluate(() => {
        const metrics = document.querySelector(".run-metrics");
        const items = [...document.querySelectorAll(".run-metrics div")];
        if (!metrics || items.length < 4) return null;
        const cols = window.getComputedStyle(metrics).gridTemplateColumns.trim().split(/\s+/).length;
        return {
          cols,
          items: items.map((item) => {
            const style = window.getComputedStyle(item);
            const rect = item.getBoundingClientRect();
            return {
              borderBottom: style.borderBottomWidth,
              borderTop: style.borderTopWidth,
              left: rect.left,
              right: rect.right
            };
          })
        };
      });

      expect(metricsLayout?.cols, `Metrics stay in 4 columns on ${vp.name}`).toBe(4);
      for (let i = 0; i < 4; i++) {
        const item = metricsLayout?.items[i];
        expect(parseFloat(item?.borderBottom ?? "0"), `Item ${i} has a bottom border on ${vp.name}`).toBeGreaterThan(0);
        expect(parseFloat(item?.borderTop ?? "1"), `Item ${i} has no top border on ${vp.name}`).toBe(0);
        if (i > 0 && metricsLayout) {
          expect(
            metricsLayout.items[i].left,
            `Item ${i} does not overlap item ${i - 1} on ${vp.name}`
          ).toBeGreaterThanOrEqual(metricsLayout.items[i - 1].right - 0.5);
        }
      }
    });
  }

  // B-10: a size 15 board keeps tiles at 48 device px and 24 px or more, and scrolls inside its frame at 375 px.
  test("scrolls a size 15 board inside its frame and follows the Explorer at 375x812", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/?seed=FOLLOW-D&level=maze-master&labyrinth=1");
    await expectGameReady(page);
    const size = getLabyrinthConfig("maze-master", 1).size;
    expect(size).toBe(15);
    const canvas = page.locator("#maze-canvas");
    const frame = page.locator("#canvas-frame");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    // Spike decision 3: each tile keeps 48 device px and 24 CSS px or more.
    const ratio = await page.evaluate(() => window.devicePixelRatio);
    expect(((await canvas.boundingBox())?.width ?? 0) / size).toBeGreaterThanOrEqual(Math.max(24, Math.ceil(48 / ratio)));
    expect(await canvas.evaluate((element) => getComputedStyle(element).touchAction)).toBe("none");
    expect(await frame.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

    // The same seed and config give the same Run, so a local copy tells where the Explorer stands after each key.
    let run = createRun("FOLLOW-D", { ...getLabyrinthConfig("maze-master", 1), ruleset: getQuestRunRuleset(1) });
    /** @type {Record<string, string>} */
    const keys = { up: "ArrowUp", right: "ArrowRight", down: "ArrowDown", left: "ArrowLeft" };
    const visits = new Map([["1,1", 1]]);
    let scrolled = false;
    let checked = 0;
    await canvas.focus();
    for (let step = 0; step < 400 && run.status === "active"; step += 1) {
      // Take the least visited passage, so the walk reaches the far side.
      const tries = /** @type {const} */ (["right", "down", "up", "left"]).map((direction) => ({
        direction,
        next: applyAction(run, { type: "move", direction })
      }));
      const moved = tries.filter(({ next }) => next.status === "active" && (next.explorer.row !== run.explorer.row || next.explorer.col !== run.explorer.col));
      const count = (/** @type {{ next: typeof run }} */ { next }) => visits.get(`${next.explorer.row},${next.explorer.col}`) ?? 0;
      const pick = moved.reduce((best, entry) => (count(entry) < count(best) ? entry : best), moved[0]);
      if (!pick) break;
      run = pick.next;
      const here = `${run.explorer.row},${run.explorer.col}`;
      visits.set(here, (visits.get(here) ?? 0) + 1);
      await page.keyboard.press(keys[pick.direction]);
      const { col, row } = run.explorer;
      // The walk takes only steps that keep the run active, so no Warden Question opens.
      await expect(page.locator("#challenge-dialog[open]"), "no Warden Question opens during the walk").toHaveCount(0);
      // The board repaints on the next animation frame, so the follow scroll can land after the key press.
      await expect(async () => {
        const box = await canvas.boundingBox();
        const view = await frame.boundingBox();
        if (!box || !view) throw new Error("board has no bounding box");
        const tile = box.width / size;
        const left = box.x + col * tile;
        const top = box.y + row * tile;
        expect(left, `column ${col} left edge`).toBeGreaterThanOrEqual(view.x - 1);
        expect(left + tile, `column ${col} right edge`).toBeLessThanOrEqual(view.x + view.width + 1);
        expect(top, `row ${row} top edge`).toBeGreaterThanOrEqual(view.y - 1);
        expect(top + tile, `row ${row} bottom edge`).toBeLessThanOrEqual(view.y + view.height + 1);
      }).toPass({ timeout: 2000 });
      checked += 1;
      scrolled ||= (await frame.evaluate((element) => element.scrollLeft + element.scrollTop)) > 0;
    }
    expect(checked, "the walk checked the Explorer in frame on many steps").toBeGreaterThanOrEqual(30);
    expect(scrolled, "the frame scrolled to follow the Explorer").toBe(true);
    // The Neatline stays at frame size while the board scrolls under it.
    const offsets = await frame.evaluate((element) => {
      const frameBox = element.getBoundingClientRect();
      const neatBox = element.querySelector(".neatline-canvas")?.getBoundingClientRect();
      return [neatBox?.x, neatBox?.y, neatBox?.width].map((value, index) => (value ?? NaN) - [frameBox.x, frameBox.y, frameBox.width][index]);
    });
    for (const offset of offsets) expect(Math.abs(offset)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  });

  test("cancels the native scroll of held game keys", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/?seed=FOLLOW-D&level=maze-master&labyrinth=1");
    await expectGameReady(page);
    const moves = await page.locator("#moves-value").textContent();
    const pulses = await page.locator("#pulse-count").textContent();
    const keys = [
      { key: "ArrowRight", code: "ArrowRight" },
      { key: "d", code: "KeyD" },
      { key: "W", code: "KeyW" },
      { key: " ", code: "Space" }
    ];
    for (const { key, code } of keys) {
      const prevented = await page.locator("#maze-canvas").evaluate((element, init) => {
        const event = new KeyboardEvent("keydown", { ...init, repeat: true, cancelable: true, bubbles: true });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      }, { key, code });
      expect(prevented, `repeat of ${code} is prevented`).toBe(true);
      // A repeat is not a second press: the Explorer does not move and Pulse is not spent.
      await expect(page.locator("#moves-value")).toHaveText(moves ?? "");
      await expect(page.locator("#pulse-count")).toHaveText(pulses ?? "");
    }
    // The same keys without repeat change the run, so the checks above are not vacuous.
    for (const { key, code } of keys) {
      await page.locator("#maze-canvas").evaluate((element, init) => {
        element.dispatchEvent(new KeyboardEvent("keydown", { ...init, cancelable: true, bubbles: true }));
      }, { key, code });
    }
    const after = [await page.locator("#moves-value").textContent(), await page.locator("#pulse-count").textContent()];
    expect(after, "a first press moves the Explorer or spends a Pulse").not.toEqual([moves, pulses]);
  });

  test("ignores a second Pulse while a Pulse is active (A-29)", async ({ page }) => {
    await page.goto("/?seed=FOLLOW-D&level=maze-master&labyrinth=1");
    await expectGameReady(page);
    const canvas = page.locator("#maze-canvas");
    const count = page.locator("#pulse-count");
    const startCount = Number(await count.textContent());
    expect(startCount).toBeGreaterThanOrEqual(2);
    await canvas.focus();
    await page.keyboard.press("q");
    await expect(count).toHaveText(String(startCount - 1));
    await expect(page.locator("#pulse-action")).toBeDisabled();
    const moves = await page.locator("#moves-value").textContent();
    await page.keyboard.press("Space");
    await expect(page.locator("#live-region")).toHaveText("The Pulse is still active.");
    await expect(count).toHaveText(String(startCount - 1));
    await expect(page.locator("#moves-value")).toHaveText(moves ?? "");
  });

  // The tile floor reads devicePixelRatio at render time, so a ratio change must repaint the board.
  test("repaints the board when the pixel ratio changes", async ({ page }) => {
    await page.addInitScript(() => {
      // The page loads at ratio 2, so each later floor value can only come from a repaint.
      let ratio = 2;
      /** @type {Array<{ query: string, listener: () => void }>} */
      const listeners = [];
      Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => ratio });
      const realMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        const list = realMatchMedia(query);
        if (/resolution:.*dppx/.test(query)) {
          const add = list.addEventListener.bind(list);
          list.addEventListener = (/** @type {string} */ type, /** @type {EventListenerOrEventListenerObject} */ listener, /** @type {AddEventListenerOptions} */ options) => {
            if (type === "change") listeners.push({ query, listener: /** @type {() => void} */ (listener) });
            return add(type, listener, options);
          };
        }
        return list;
      };
      Object.assign(window, {
        __setRatio: (/** @type {number} */ value) => { ratio = value; },
        // The app listens with `once`, so a fired listener is gone. The newest query shows the re-arm.
        __fireRatio: () => {
          const entry = listeners.pop();
          if (!entry) throw new Error("no armed pixel ratio listener");
          entry.listener();
          return listeners[listeners.length - 1]?.query;
        }
      });
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/?seed=FOLLOW-D&level=maze-master&labyrinth=1");
    await expectGameReady(page);
    const floor = () => page.locator("#maze-canvas").evaluate((element) => element.style.getPropertyValue("--tile-floor"));
    await expect.poll(floor).toBe("24px");
    // No browser event fires here, so the test calls the newest listener. Each call must re-arm a query for the new ratio.
    const fire = (/** @type {number} */ value) => page.evaluate((ratio) => {
      /** @type {any} */ (window).__setRatio(ratio);
      return /** @type {any} */ (window).__fireRatio();
    }, value);
    expect(await fire(1)).toBe("(resolution: 1dppx)");
    await expect.poll(floor).toBe("48px");
    expect(await fire(2)).toBe("(resolution: 2dppx)");
    await expect.poll(floor).toBe("24px");
    // Two calls in one task leave the value correct.
    await page.evaluate(() => { /** @type {any} */ (window).__setRatio(1); /** @type {any} */ (window).__fireRatio(); /** @type {any} */ (window).__fireRatio(); });
    await expect.poll(floor).toBe("48px");
  });

  test("provides tactile feedback on interactive buttons and controls", async ({ page }) => {
    await page.goto("/?seed=TACTILE-AUDIT&level=trail-scout");
    await expectGameReady(page);

    // Check pulse button has active and hover transitions
    const pulseButton = page.locator("#pulse-action");
    await expect(pulseButton).toBeVisible();

    // Check direction buttons have active press state
    const downButton = page.locator("[data-move='down']");
    if (await downButton.isVisible()) {
      // page.mouse presses at viewport coordinates. On a short viewport
      // (iPhone 14: 664 px) the pad starts below the fold.
      await downButton.scrollIntoViewIfNeeded();
      const box = await downButton.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(100);
        const hoverBackground = await downButton.evaluate(
          (el) => window.getComputedStyle(el).backgroundColor
        );
        await page.mouse.down();
        try {
          await expect
            .poll(() =>
              downButton.evaluate((el, hover) => ({
                isActive: el.matches(":active"),
                bgChanged: window.getComputedStyle(el).backgroundColor !== hover
              }), hoverBackground)
            )
            .toEqual({ isActive: true, bgChanged: true });
        } finally {
          await page.mouse.up();
        }
      }
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

  // US-05.1: on a portrait phone the board dominates and the controls sit below it.
  for (const vp of [
    { width: 390, height: 844 },
    { width: 320, height: 568 }
  ]) {
    test(`fills the width with the board and places controls below at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/?seed=BOARD-DOMINANT&level=trail-scout");
      await expectGameReady(page);

      const frame = await page.locator("#canvas-frame").boundingBox();
      const controls = await page.locator(".action-rail").boundingBox();
      if (!frame || !controls) {
        throw new Error("board or controls have no bounding box");
      }
      expect(frame.width, "board width vs viewport").toBeGreaterThanOrEqual(vp.width * 0.9);
      expect(controls.y, "controls start below the board").toBeGreaterThanOrEqual(
        frame.y + frame.height - 1
      );
    });
  }

  // US-03.1 / US-03.3: the shell header is one ruled tab row.
  for (const vp of [
    { width: 375, height: 812 },
    { width: 1280, height: 800 }
  ]) {
    test(`header is a ruled tab row with 40px targets at ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/?seed=HEADER-ROW&level=trail-scout");
      await expectGameReady(page);

      const header = await page.evaluate(() => {
        const bar = /** @type {HTMLElement} */ (document.querySelector(".command-bar"));
        const tabs = /** @type {HTMLElement} */ (document.querySelector(".command-bar__actions"));
        const targets = [...bar.querySelectorAll("button, a[href]")]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => {
            const box = el.getBoundingClientRect();
            return { id: el.id || el.textContent.trim(), width: box.width, height: box.height };
          });
        return {
          barHeight: bar.getBoundingClientRect().height,
          targets,
          scrollbarWidth: getComputedStyle(tabs).scrollbarWidth,
          tabBorder: getComputedStyle(/** @type {HTMLElement} */ (document.querySelector("#daily-button"))).borderBottomWidth,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });
      for (const target of header.targets) {
        expect(target.width, `${target.id} width`).toBeGreaterThanOrEqual(40);
        expect(target.height, `${target.id} height`).toBeGreaterThanOrEqual(40);
      }
      expect(header.scrollbarWidth).toBe("none");
      expect(header.tabBorder, "tabs carry a 2px underline slot").toBe("2px");
      expect(header.pageOverflow).toBeLessThanOrEqual(1);
      if (vp.width >= 768) {
        expect(header.barHeight, "bar height").toBeGreaterThanOrEqual(56);
        expect(header.barHeight, "bar height").toBeLessThanOrEqual(72);
      }

      for (const name of ["Daily", "Atlas", "Workshop", "Journal", "Records", "Settings", "New Quest"]) {
        await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
      }
    });
  }

  // US-03.1: the board column owns 60-70% of the content width and the panel boxes are gone.
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 }
  ]) {
    test(`board column owns 60-70% of the content width at ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/?seed=BOARD-COLUMN&level=trail-scout");
      await expectGameReady(page);

      const layout = await page.evaluate(() => {
        const box = (/** @type {string} */ selector) => document.querySelector(selector)?.getBoundingClientRect();
        const style = (/** @type {string} */ selector) => {
          const element = /** @type {HTMLElement} */ (document.querySelector(selector));
          const computed = getComputedStyle(element);
          return {
            border: computed.borderTopWidth,
            shadow: computed.boxShadow,
            background: computed.backgroundColor
          };
        };
        return {
          grid: box(".play-grid")?.width ?? 0,
          column: box(".labyrinth-panel")?.width ?? 0,
          frame: box("#canvas-frame"),
          panel: style(".labyrinth-panel"),
          notes: style(".chart-notes")
        };
      });
      const ratio = layout.column / layout.grid;
      expect(ratio, "board column share of the content width").toBeGreaterThanOrEqual(0.6);
      expect(ratio, "board column share of the content width").toBeLessThanOrEqual(0.7);
      expect(Math.abs((layout.frame?.width ?? 0) - (layout.frame?.height ?? 0)), "board is square").toBeLessThanOrEqual(1);
      expect(layout.frame?.width, "board size comes from the column, not a fixed 432px").toBeGreaterThan(440);
      // The Popup board panel is a paper card; the notes stay flat.
      expect(layout.panel.border).toBe("3px");
      expect(layout.panel.shadow).not.toBe("none");
      expect(layout.panel.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(layout.notes.border).toBe("0px");
      expect(layout.notes.shadow).toBe("none");
      expect(layout.notes.background).toBe("rgba(0, 0, 0, 0)");
    });
  }

  // US-03.2: under 160px of chrome sit above the board on a phone.
  test("keeps chrome above the board under 160px at 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/?seed=BOARD-CHROME&level=trail-scout");
    await expectGameReady(page);
    const frame = await page.locator("#canvas-frame").boundingBox();
    expect(frame?.y, "chrome above the board").toBeLessThan(160);
    expect(frame?.width, "board width").toBeGreaterThanOrEqual(375 * 0.9);
  });

  // Audit item U5: on a landscape phone the first board tile starts above the fold.
  test("shows the first board tile without a scroll at 667x375", async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto("/?seed=BOARD-FOLD&level=trail-scout");
    await expectGameReady(page);
    const canvas = await page.locator("#maze-canvas").boundingBox();
    if (!canvas) throw new Error("canvas has no bounding box");
    const tile = canvas.width / getLabyrinthConfig("trail-scout", 1).size;
    expect(canvas.y + tile, "first tile bottom edge").toBeLessThanOrEqual(375);
  });

  // The hidden attribute keeps the Classroom tab out of the header for a guest.
  test("hides the Classroom tab for a guest", async ({ page }) => {
    await page.goto("/?seed=BOARD-GUEST&level=trail-scout");
    await expectGameReady(page);
    await expect(page.locator("#classroom-link")).toHaveCount(1);
    await expect(page.locator("#classroom-link")).toBeHidden();
  });

  // US-03.1: the event ribbon overlays the board bottom and shifts nothing.
  for (const vp of [
    { width: 375, height: 812 },
    { width: 1280, height: 800 }
  ]) {
    test(`reserves the event ribbon slot under the board without a layout shift at ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/?seed=RIBBON-SHIFT&level=trail-scout");
      await expectGameReady(page);
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: async () => {} }
        });
      });
      const positions = () =>
        page.evaluate(() =>
          ["#canvas-frame", ".action-rail", ".title-block"].map((selector) => {
            const rect = document.querySelector(selector)?.getBoundingClientRect();
            return rect ? [rect.x, rect.y + window.scrollY, rect.width, rect.height] : null;
          })
        );
      const before = await positions();
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);

      await page.locator("#seed-copy").click();
      const ribbon = page.locator("#event-ribbon");
      await expect(ribbon).toHaveClass(/is-visible/);
      await expect(ribbon).toHaveCSS("opacity", "1");

      // Firefox rounds the same layout to float noise (157.8000031 vs
      // 157.7999878), so compare to 0.005 px instead of exact equality.
      const after = await positions();
      expect(after.map((rect) => rect === null)).toEqual(before.map((rect) => rect === null));
      before.forEach((rect, index) =>
        rect?.forEach((value, axis) =>
          expect(after[index]?.[axis], "board, rail, and Title block stay put").toBeCloseTo(value, 2)
        )
      );
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(pageHeight);

      const maze = await page.locator("#maze-canvas").boundingBox();
      const frame = await page.locator("#canvas-frame").boundingBox();
      const band = await ribbon.boundingBox();
      if (!maze || !frame || !band) throw new Error("Expected the board and the ribbon to render.");
      // A board wider or taller than its frame scrolls inside it (B-10), so the frame edge is the bound.
      expect(band.y, "ribbon sits below the board frame").toBeGreaterThanOrEqual(frame.y + frame.height - 1);
      expect(band.x).toBeGreaterThanOrEqual(frame.x - 1);
      expect(band.x + band.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
      const rule = await ribbon.evaluate((el) => getComputedStyle(el).borderTopWidth);
      expect(parseFloat(rule), "ink top rule").toBeGreaterThan(0);
    });
  }

  // The landing chart follows the Theme Choice; the OS scheme is only the fallback.
  for (const [os, choice] of [
    ["dark", "light"],
    ["light", "dark"],
    ["dark", "dark"],
    ["light", "light"]
  ]) {
    test(`shows the ${choice} chart for a ${choice} Theme Choice on a ${os} OS`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: /** @type {"dark" | "light"} */ (os) });
      await page.addInitScript((value) => {
        window.localStorage.setItem("echo-maze:theme", value);
      }, choice);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", choice);
      const visible = page.locator(".landing-hero__chart:visible");
      await expect(visible).toHaveCount(1);
      await expect(visible).toHaveAttribute("src", `/landing-popup-${choice === "dark" ? "night" : "light"}.webp`);
    });
  }

  for (const os of ["dark", "light"]) {
    test(`falls back to a ${os} OS scheme for the landing chart when no Theme Choice is set`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: /** @type {"dark" | "light"} */ (os) });
      await page.goto("/");
      // The app sends COOP same-origin. Playwright Firefox drops the colour
      // scheme emulation when that header swaps the browsing context group,
      // so apply it again on the loaded page.
      await page.emulateMedia({ colorScheme: /** @type {"dark" | "light"} */ (os) });
      const visible = page.locator(".landing-hero__chart:visible");
      await expect(visible).toHaveCount(1);
      await expect(visible).toHaveAttribute("src", `/landing-popup-${os === "dark" ? "night" : "light"}.webp`);
    });
  }

  // Focus order: the pad comes before Pause and Pulse, as drawn.
  test("keeps the Action rail focus order equal to the visual order", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?seed=RAIL-ORDER&level=trail-scout");
    await expectGameReady(page);
    const order = await page.evaluate(() =>
      ["[data-move='up']", "#pause-run", "#pulse-action"].map((selector) => {
        const element = document.querySelector(selector);
        return element ? element.getBoundingClientRect().x : -1;
      })
    );
    expect(order[0]).toBeLessThan(order[1] ?? 0);
    expect(order[1]).toBeLessThan(order[2] ?? 0);
    const domOrder = await page.evaluate(() => {
      const ids = [".touch-controls", "#pause-run", ".trail-actions"];
      const nodes = ids.map((id) => document.querySelector(id));
      return nodes.every((node, index) => index === 0 || (nodes[index - 1]?.compareDocumentPosition(node ?? document) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(domOrder, "DOM order pad, Pause, Pulse").toBeTruthy();
  });

  // Ticket 12: the Action rail keeps 48px direction buttons and 40px targets.
  for (const vp of [
    { width: 375, height: 812 },
    { width: 1280, height: 800 }
  ]) {
    test(`sizes the Action rail targets at ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/?seed=RAIL-SIZE&level=trail-scout");
      await expectGameReady(page);
      for (const direction of ["up", "left", "down", "right"]) {
        const box = await page.locator(`.touch-controls [data-move='${direction}']`).boundingBox();
        expect(box?.width, `${direction} width`).toBeGreaterThanOrEqual(48);
        expect(box?.height, `${direction} height`).toBeGreaterThanOrEqual(48);
      }
      for (const selector of ["#pause-run", "#pulse-action"]) {
        const box = await page.locator(selector).boundingBox();
        expect(box?.width, `${selector} width`).toBeGreaterThanOrEqual(40);
        expect(box?.height, `${selector} height`).toBeGreaterThanOrEqual(40);
      }
      const pulse = await page
        .locator("#pulse-action")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      const pause = await page
        .locator("#pause-run")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(pulse, "Pulse is a secondary button with the Pause fill").toBe(pause);
    });
  }

  // Ticket 15: the dialog footer is sticky, so the primary action never scrolls out of view.
  test("keeps the Daily primary action in the viewport at 375x812", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/?seed=DIALOG-ANATOMY&level=trail-scout");
    await expectGameReady(page);
    await page.locator("#daily-button").click();
    await expect(page.locator("#daily-dialog")).toBeVisible();
    // The board refresh replaces the list, so the fixture goes in after it settles.
    await expect(page.locator("#daily-board-status")).not.toHaveAttribute("data-state", "loading");
    // A full Verified Daily Board is the long case: the body scrolls and the footer must stay put.
    await page.evaluate(() => {
      const list = /** @type {HTMLElement} */ (document.querySelector("#daily-board-list"));
      list.innerHTML = Array.from(
        { length: 12 },
        (_, i) =>
          `<li><span class="daily-board__rank">${i + 1}</span><span class="daily-board__username">Explorer ${i + 1}</span><span class="daily-board__score">${900 - i * 7}</span><span class="daily-board__moves">${40 + i} moves</span></li>`
      ).join("");
    });
    await expect(page.locator("#daily-board-list > li")).toHaveCount(12);
    const box = await page.locator("#daily-start").boundingBox();
    if (!box) throw new Error("Daily start button renders");
    expect(box.y, "top edge inside the viewport").toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "bottom edge inside the viewport").toBeLessThanOrEqual(812);
  });
});
