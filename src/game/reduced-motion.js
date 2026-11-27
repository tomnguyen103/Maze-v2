/** Returns true when the system or the Explorer asks for reduced motion. Safe without matchMedia. */
export function motionReduced() {
  return (
    (typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches) ||
    document.documentElement.dataset.accessEffects === "reduced"
  );
}
