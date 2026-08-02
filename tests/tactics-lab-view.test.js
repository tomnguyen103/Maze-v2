// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTacticsLabView } from "../src/learning/tactics-lab-view.js";

function renderFixture() {
  document.body.innerHTML = `
    <h2 id="practice-tactics-title" tabindex="-1">Warden Tactics Lab</h2>
    <section id="practice-tactics">
      <p id="practice-tactics-intro"></p>
      <div id="practice-tactics-catalog"></div>
      <section id="practice-tactics-twists" hidden>
        <div id="practice-tactics-twist-list"></div>
      </section>
      <section id="practice-tactics-session" hidden>
        <p id="practice-tactics-progress"></p>
        <h3 id="practice-tactics-drill-title" tabindex="-1"></h3>
        <p id="practice-tactics-objective"></p>
        <p id="practice-tactics-rule"></p>
        <p id="practice-tactics-status"></p>
        <div id="practice-tactics-report"></div>
        <div>
          <button data-tactics-move="up" type="button">Move up</button>
          <button data-tactics-move="left" type="button">Move left</button>
          <button data-tactics-move="down" type="button">Move down</button>
          <button data-tactics-move="right" type="button">Move right</button>
          <button id="practice-tactics-pulse" type="button">Use Pulse</button>
        </div>
        <section id="practice-tactics-challenge" hidden>
          <p id="practice-tactics-question"></p>
          <div id="practice-tactics-choices"></div>
          <button id="practice-tactics-hint" type="button">Show Hint</button>
          <p id="practice-tactics-hint-copy"></p>
          <button id="practice-tactics-skip" type="button">Skip Question</button>
        </section>
        <button id="practice-tactics-restart" type="button">Restart Drill</button>
        <button id="practice-tactics-back" type="button">Back to Drills</button>
      </section>
      <button id="practice-tactics-exit" type="button">Back to Workshop</button>
    </section>
  `;
}

describe("Warden Tactics Lab view", () => {
  beforeEach(renderFixture);

  it("renders fixed drills, keeps engine state readable, and restarts deterministically", () => {
    const onExit = vi.fn();
    const view = createTacticsLabView({ onExit });
    view.show();

    expect(document.querySelectorAll("[data-tactics-drill]")).toHaveLength(4);
    document.querySelector("[data-tactics-drill='patrol']")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    expect(document.getElementById("practice-tactics-session")?.hidden).toBe(
      false
    );
    expect(document.getElementById("practice-tactics-status")?.textContent)
      .toContain("unscored");
    expect(document.getElementById("practice-tactics-report")?.textContent)
      .toContain("Patrol");
    expect(document.getElementById("practice-tactics-report")?.textContent)
      .not.toMatch(/row|col|answer/i);

    document.getElementById("practice-tactics-pulse")?.click();
    expect(document.getElementById("practice-tactics-progress")?.textContent)
      .toContain("1 moves");
    document.getElementById("practice-tactics-restart")?.click();
    expect(document.getElementById("practice-tactics-progress")?.textContent)
      .toContain("0 moves");

    document.getElementById("practice-tactics-exit")?.click();
    expect(onExit).toHaveBeenCalledOnce();
    expect(document.getElementById("practice-tactics")?.hidden).toBe(true);
  });

  it("offers all five accepted Trail Twist revisions", () => {
    const view = createTacticsLabView();
    view.show();
    document.querySelector("[data-tactics-drill='trail-twists']")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );

    expect(document.querySelectorAll("[data-tactics-twist]")).toHaveLength(5);
    expect(document.getElementById("practice-tactics-twist-list")?.textContent)
      .toContain("Echo Hush");
    expect(document.getElementById("practice-tactics-twist-list")?.textContent)
      .toContain("Warden Bells");
  });
});
