import { campaignCodeFor } from "../../shared/campaign-codes.js";

const SENT_KEY = "echo-maze-visit-sent";

/**
 * Counts one adult offer visit per tab session. The beacon sends only an
 * allowlisted Campaign Code from `?c=`, so the raw link value stays in the
 * browser. Every failure is silent: the landing page never waits on it.
 *
 * @param {{
 *   location?: { search: string },
 *   navigator?: { webdriver?: boolean },
 *   sessionStorage?: Storage,
 *   fetch?: typeof globalThis.fetch
 * }} [environment]
 */
export function sendVisitBeacon(environment = globalThis) {
  try {
    // An automated browser is not a visitor.
    if (environment.navigator?.webdriver) return;
    const storage = environment.sessionStorage;
    if (!storage || storage.getItem(SENT_KEY)) return;
    storage.setItem(SENT_KEY, "1");
    const campaign = campaignCodeFor(
      new URLSearchParams(environment.location?.search ?? "").get("c")
    );
    void environment
      .fetch?.("/api/access/visit", {
        body: JSON.stringify({ campaign }),
        headers: { "content-type": "application/json" },
        keepalive: true,
        method: "POST"
      })
      .catch(() => {});
  } catch {
    // Blocked storage means no count, never a broken page.
  }
}
