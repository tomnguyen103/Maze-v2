// The `@look` alias resolves to the active look folder at build time (see vite.config.mjs).
declare module "@look/fonts.js";
declare module "@look/board-art.js" {
  /** The look's board figures, or null when the look keeps the shape marks. */
  const art: {
    drawFigure: (
      context: CanvasRenderingContext2D,
      key: "clover" | "fangmoor",
      mode: string,
      size: number,
      flat: boolean
    ) => void;
  } | null;
  export default art;
}
