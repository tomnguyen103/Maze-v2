// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLifetimeView } from "../src/player/lifetime-view.js";
import { PlayerApiError } from "../src/player/player-client.js";

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

  it.each(["close", "membership"])(
    "settles a pending last-free confirmation when switching via %s",
    async (action) => {
      const view = createLifetimeView();
      const choice = view.confirmLastFreeRun();

      if (action === "close") {
        view.close();
      } else {
        view.showMembership();
      }

      await expect(choice).resolves.toBe(false);
    }
  );

  it("shows transparent one-time pricing and signed-in continuity disclosure", () => {
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
    ).toBe(
      "Quest Progress follows your signed-in account at Labyrinth boundaries. Run Records stay on this device."
    );
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

  it("ignores Not now and Escape while the Unlock answer is pending", async () => {
    /** @type {() => void} */
    let answer = () => {};
    const unlock = vi.fn(() => new Promise((resolve) => { answer = () => resolve(undefined); }));
    createLifetimeView({ onUnlock: unlock }).showMembership();
    const dialog = /** @type {HTMLDialogElement} */ (document.getElementById("lifetime-dialog"));
    const close = /** @type {HTMLButtonElement} */ (document.getElementById("lifetime-close"));
    const closed = vi.fn();
    dialog.addEventListener("close", closed);

    document.getElementById("lifetime-primary")?.click();
    expect(close.disabled).toBe(true);
    close.click();
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));

    expect(dialog.open).toBe(true);
    answer();
    await vi.waitFor(() => expect(close.disabled).toBe(false));
    expect(closed).not.toHaveBeenCalled();
  });

  it.each([
    [403, "Lifetime Membership is not on sale yet."],
    [401, "Sign in to continue."]
  ])("US-03.3 shows the server message for a %i Checkout answer", async (status, message) => {
    const unlock = vi.fn(async () => {
      throw new PlayerApiError(message, status, { error: message });
    });
    createLifetimeView({ onUnlock: unlock }).showMembership();
    const primary = /** @type {HTMLButtonElement} */ (
      document.getElementById("lifetime-primary")
    );

    primary.click();

    await vi.waitFor(() => expect(primary.disabled).toBe(false));
    expect(document.getElementById("lifetime-status")?.textContent).toBe(message);
  });

  it.each([
    ["a server error", new PlayerApiError("Internal detail.", 500, { error: "Internal detail." })],
    ["a 403 without a server message", new PlayerApiError("Player services are unavailable. Guest play still works.", 403, {})],
    ["a network failure", new TypeError("Failed to fetch")]
  ])("US-03.5 keeps the generic message for %s", async (_name, failure) => {
    const unlock = vi.fn(async () => {
      throw failure;
    });
    createLifetimeView({ onUnlock: unlock }).showMembership();
    const primary = /** @type {HTMLButtonElement} */ (
      document.getElementById("lifetime-primary")
    );

    primary.click();

    await vi.waitFor(() => expect(primary.disabled).toBe(false));
    expect(document.getElementById("lifetime-status")?.textContent).toBe(
      "Checkout unavailable. Try again."
    );
  });
});
