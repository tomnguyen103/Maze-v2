import {
  OFFLINE_UNVERIFIED_LABEL,
  PENDING_VERIFICATION_LABEL
} from "./offline-continuity.js";

/**
 * The Continue Offline control and the verification label beside a local Run
 * Record.
 *
 * The label is the honest state and nothing else. There is no "probably fine"
 * in between: a Run is Pending verification until the server has replayed it,
 * then either the label goes away or it reads Offline—unverified. An Explorer
 * is never shown a result as confirmed that the server has not confirmed.
 *
 * @typedef {import("./offline-continuity.js").VerificationState} VerificationState
 */

const REASONS = Object.freeze({
  "class-run":
    "Class Runs stay online so your Teacher's Classroom stays up to date.",
  receipt: "Reconnect once to make this Run available offline.",
  binding: "Reconnect once to make this Run available offline.",
  unrecordable:
    "This Run cannot be verified offline. Reconnect to continue safely.",
  package: "The offline package is unavailable. Reconnect to prepare this Run.",
  quota: "This device could not save the offline package. Reconnect to continue.",
  storage: "Offline storage is unavailable. Reconnect to continue safely.",
  worker: "Offline pinning is unavailable. Reconnect to continue safely.",
  expired: "Offline play for this Run has ended. Reconnect to continue."
});

/**
 * @param {{
 *   section: HTMLElement,
 *   button: HTMLButtonElement,
 *   label: HTMLElement,
 *   note: HTMLElement
 * }} elements
 */
export function createOfflineContinuityView({ section, button, label, note }) {
  return { renderOffer, renderVerification };

  /** @param {{ offered: boolean, reason?: string }} offer */
  function renderOffer(offer) {
    section.hidden = false;
    button.hidden = !offer.offered;
    note.textContent = offer.offered
      ? "This Run can keep going without a connection."
      : REASONS[/** @type {keyof typeof REASONS} */ (offer.reason ?? "")] ?? "";
  }

  /** @param {VerificationState} state */
  function renderVerification(state) {
    section.hidden = false;
    label.dataset.state = state;
    label.textContent =
      state === "pending"
        ? PENDING_VERIFICATION_LABEL
        : state === "unverified"
          ? OFFLINE_UNVERIFIED_LABEL
          : "";
    label.hidden = label.textContent === "";
    if (state === "unverified") {
      note.textContent =
        "This result stayed on this device. Your Quest, score, and Journal did not change.";
    } else if (state === "pending") {
      note.textContent = "Reconnect to have this result checked.";
    }
  }
}
