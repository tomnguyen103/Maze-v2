// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLifetimeView } from "../src/player/lifetime-view.js";

describe("Lifetime Membership dialog", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <dialog id="lifetime-dialog">
        <span id="lifetime-kicker"></span>
        <h2 id="lifetime-title"></h2>
        <p id="lifetime-intro"></p>
        <div id="lifetime-offer">
          <strong id="lifetime-price"></strong>
          <span id="lifetime-price-note"></span>
        </div>
        <p id="lifetime-details"></p>
        <p id="lifetime-storage-note"></p>
        <p id="lifetime-status"></p>
        <button id="lifetime-primary"></button>
        <button id="lifetime-close"></button>
      </dialog>
    `;
  });

  it("requires a clear confirmation before the last free Run starts", async () => {
    const view = createLifetimeView();
    const choice = view.confirmLastFreeRun();

    expect(document.getElementById("lifetime-title")?.textContent).toBe(
      "Last free Run."
    );
    expect(document.getElementById("lifetime-intro")?.textContent).toBe(
      "Escape, defeat, or retry will use this Run once it starts."
    );
    document.getElementById("lifetime-primary")?.click();

    await expect(choice).resolves.toBe(true);
  });

  it("shows transparent one-time pricing and local-progress disclosure", () => {
    createLifetimeView().showMembership();

    expect(document.getElementById("lifetime-title")?.textContent).toBe(
      "Unlock every future Run"
    );
    expect(document.getElementById("lifetime-price")?.textContent).toBe(
      "$5.99 once"
    );
    expect(document.getElementById("lifetime-details")?.textContent).toContain(
      "No subscription. No renewal."
    );
    expect(
      document.getElementById("lifetime-storage-note")?.textContent
    ).toContain("this device");
    expect(
      document.getElementById("lifetime-primary")?.getAttribute("aria-label")
    ).toBe("Unlock lifetime access - $5.99");
    expect(document.getElementById("lifetime-close")?.textContent).toBe(
      "Not now"
    );
  });

  it("locks the purchase action while Checkout opens and recovers on error", async () => {
    const unlock = vi.fn(async () => {
      throw new Error("Checkout unavailable.");
    });
    createLifetimeView({ onUnlock: unlock }).showMembership();
    const primary = /** @type {HTMLButtonElement} */ (
      document.getElementById("lifetime-primary")
    );

    primary.click();
    expect(primary.disabled).toBe(true);
    expect(document.getElementById("lifetime-status")?.textContent).toBe(
      "Opening secure checkout…"
    );
    await vi.waitFor(() => expect(primary.disabled).toBe(false));
    expect(document.getElementById("lifetime-status")?.textContent).toBe(
      "Checkout unavailable. Try again."
    );
  });
});
