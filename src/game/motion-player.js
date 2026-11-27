import { motionReduced } from "./reduced-motion.js";

/**
 * Builds the gated motion player. Reduced motion never calls `load`.
 * @param {() => Promise<{ default: Record<string, (...args: any[]) => void> | null }>} load
 */
export function createMotionPlayer(load) {
  /** @type {Promise<Record<string, (...args: any[]) => void> | null> | null} */
  let pending = null;
  let failures = 0;
  return (/** @type {string} */ name, /** @type {any[]} */ ...args) => {
    if (motionReduced() || failures >= 2) {
      return;
    }
    pending ??= load().then(
      (module) => module.default,
      (error) => {
        pending = null;
        failures += 1;
        throw error;
      }
    );
    pending
      .then((motion) => motion?.[name]?.(...args))
      .catch(() => {});
  };
}
