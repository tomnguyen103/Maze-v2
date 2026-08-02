import { scrubOfflineState } from "./offline-local-scrub.js";
import { scrubActiveRunRecovery } from "./local-recovery-scrub.js";

/**
 * Clear account-scoped local recovery before an identity changes. The module
 * is loaded only on sign-out or an authenticated identity transition so the
 * game entry chunk does not carry the cleanup path.
 *
 * @param {{
 *   signOut: () => Promise<unknown>,
 *   scrub: () => boolean,
 *   refresh: () => void,
 *   recovery: { clear: () => { status?: string } } | null,
 *   report: () => void,
 *   setActive: (active: boolean) => void,
 *   announce: (message: string) => void,
 *   showEvent: (message: string) => void
 * }} dependencies
 */
export async function clearOfflineAccountState({
  signOut,
  scrub,
  refresh,
  recovery,
  report,
  setActive,
  announce,
  showEvent
}) {
  setActive(false);
  const offlineScrubbed = scrubOfflineState();
  if (!offlineScrubbed) {
    const message =
      "This device could not erase Offline Continuity data. Clear this site's data before another player uses this device.";
    announce(message);
    showEvent(message);
  }
  try {
    await signOut();
  } catch {
    const message =
      "Offline Continuity could not clear its worker cache. Clear this site's data before another player uses this device.";
    announce(message);
    showEvent(message);
  }
  if (scrub()) {
    refresh();
  } else {
    const message =
      "This device could not erase account-context Run Replay details. Clear this site's data before another player uses this device.";
    announce(message);
    showEvent(message);
  }
  if (!recovery) {
    if (!scrubActiveRunRecovery()) {
      report();
    }
  } else if (recovery.clear().status === "unavailable") {
    report();
  }
  if (!offlineScrubbed) {
    throw new Error("Offline account cleanup did not complete.");
  }
}
