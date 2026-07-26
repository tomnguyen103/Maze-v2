import {
  LIFETIME_PRICE_LABEL,
  LIFETIME_PRICE_ONCE
} from "../../shared/lifetime-product.js";

/**
 * @param {{
 *   onUnlock?: () => Promise<void>
 * }} options
 */
export function createLifetimeView({ onUnlock = async () => {} } = {}) {
  const elements = {
    close: requiredElement("lifetime-close", HTMLButtonElement),
    details: requiredElement("lifetime-details", HTMLElement),
    dialog: requiredElement("lifetime-dialog", HTMLDialogElement),
    intro: requiredElement("lifetime-intro", HTMLElement),
    kicker: requiredElement("lifetime-kicker", HTMLElement),
    offer: requiredElement("lifetime-offer", HTMLElement),
    price: requiredElement("lifetime-price", HTMLElement),
    priceNote: requiredElement("lifetime-price-note", HTMLElement),
    primary: requiredElement("lifetime-primary", HTMLButtonElement),
    status: requiredElement("lifetime-status", HTMLElement),
    storageNote: requiredElement("lifetime-storage-note", HTMLElement),
    title: requiredElement("lifetime-title", HTMLElement)
  };
  /** @type {((confirmed: boolean) => void) | null} */
  let resolveLastFreeRun = null;
  let mode = "membership";

  elements.primary.addEventListener("click", () => {
    if (mode === "last-free") {
      settleLastFreeRun(true);
      return;
    }
    void openCheckout();
  });
  elements.close.addEventListener("click", () => {
    if (mode === "last-free") {
      settleLastFreeRun(false);
      return;
    }
    elements.dialog.close();
  });
  elements.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (mode === "last-free") {
      settleLastFreeRun(false);
      return;
    }
    elements.dialog.close();
  });
  renderMembershipCopy();

  return {
    close() {
      if (resolveLastFreeRun) {
        settleLastFreeRun(false);
        return;
      }
      if (elements.dialog.open) {
        elements.dialog.close();
      }
    },
    confirmLastFreeRun,
    showMembership,
    setStatus
  };

  function confirmLastFreeRun() {
    if (resolveLastFreeRun) {
      settleLastFreeRun(false);
    }
    mode = "last-free";
    elements.kicker.textContent = "Explorer access";
    elements.title.textContent = "Last free Run.";
    elements.intro.textContent =
      "Escape, defeat, or retry will use this Run once it starts.";
    elements.offer.hidden = true;
    elements.details.textContent =
      "Your Run begins only after you choose Start last free Run.";
    elements.storageNote.textContent = "";
    setStatus("");
    elements.primary.disabled = false;
    elements.primary.textContent = "Start Run";
    elements.primary.setAttribute("aria-label", "Start last free Run");
    elements.close.textContent = "Not now";
    openDialog();
    return new Promise((resolve) => {
      resolveLastFreeRun = resolve;
    });
  }

  /**
   * @param {string} [message]
   * @param {"idle" | "success" | "error"} [state]
   */
  function showMembership(message = "", state = "idle") {
    if (resolveLastFreeRun) {
      settleLastFreeRun(false);
    }
    mode = "membership";
    renderMembershipCopy();
    setStatus(message, state);
    openDialog();
  }

  function renderMembershipCopy() {
    elements.kicker.textContent = "Lifetime Membership";
    elements.title.textContent = "Unlock every future Run";
    elements.intro.textContent =
      "Ask a parent or grown-up for help before opening secure Stripe Checkout.";
    elements.offer.hidden = false;
    elements.price.textContent = LIFETIME_PRICE_ONCE;
    elements.priceNote.textContent = "Lifetime access for this account";
    elements.details.textContent =
      "No subscription. No renewal. Every Run keeps the same fair Warden rules.";
    elements.storageNote.textContent =
      "Quest Progress follows your signed-in account at Labyrinth boundaries. Run Records stay on this device.";
    elements.primary.disabled = false;
    elements.primary.textContent = "Unlock";
    elements.primary.setAttribute(
      "aria-label",
      `Unlock lifetime access - ${LIFETIME_PRICE_LABEL}`
    );
    elements.close.textContent = "Not now";
  }

  /**
   * @param {string} message
   * @param {"idle" | "loading" | "success" | "error"} [state]
   */
  function setStatus(message, state = "idle") {
    elements.status.textContent = message;
    elements.status.dataset.state = state;
  }

  async function openCheckout() {
    elements.primary.disabled = true;
    elements.primary.textContent = "Opening…";
    setStatus("Opening secure checkout…", "loading");
    try {
      await onUnlock();
    } catch {
      elements.primary.disabled = false;
      elements.primary.textContent = "Try again";
      setStatus("Checkout unavailable. Try again.", "error");
      elements.primary.focus();
    }
  }

  /** @param {boolean} confirmed */
  function settleLastFreeRun(confirmed) {
    const resolve = resolveLastFreeRun;
    resolveLastFreeRun = null;
    if (elements.dialog.open) {
      elements.dialog.close();
    }
    resolve?.(confirmed);
  }

  function openDialog() {
    if (!elements.dialog.open) {
      elements.dialog.showModal();
    }
    requestAnimationFrame(() => elements.primary.focus());
  }
}

/**
 * @template {Element} T
 * @param {string} id
 * @param {{ new(): T }} type
 */
function requiredElement(id, type) {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Missing #${id}.`);
  }
  return element;
}
