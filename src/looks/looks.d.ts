// The `@look` alias resolves to the active look folder at build time (see vite.config.mjs).
declare module "@look/fonts.js";
declare module "@look/board-art.js" {
  /** The look's board figures, or null when the look keeps the shape marks. */
  const art: {
    drawFigure: (
      context: CanvasRenderingContext2D,
      key: "fangmoor" | "explorer" | "clover" | "pip" | "lumi" | "fen" | "tuck",
      mode: string,
      size: number,
      flat: boolean,
      soft?: boolean
    ) => void;
  } | null;
  export default art;
}
declare module "@look/motion.js" {
  /** The look's board and ceremony motions, or null when the look plays none. */
  const motion: Record<string, (...args: any[]) => void> | null;
  export default motion;
}
