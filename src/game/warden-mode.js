/**
 * The one Warden mode a Run shows. Hidden Wardens keep Hunt or Intercept
 * through a Bell ring, so those modes outrank the one-action Lured state.
 *
 * @param {{ wardens: ReadonlyArray<{ mode: string }> }} run
 * @returns {"intercept" | "hunt" | "lured" | "patrol" | "cleared"}
 */
export function summarizeWardenMode(run) {
  if (run.wardens.length === 0) {
    return "cleared";
  }
  for (const mode of /** @type {const} */ (["intercept", "hunt", "lured"])) {
    if (run.wardens.some((warden) => warden.mode === mode)) {
      return mode;
    }
  }
  return "patrol";
}
