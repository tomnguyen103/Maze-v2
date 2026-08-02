import { createEchoFossil } from "./quest-fossils.js";

/** @typedef {"personal" | "first-light" | "daily" | "classroom"} TerminalPlayMode */

/**
 * Create the one personal fossil produced by a terminal Labyrinth.
 *
 * @param {{
 *   playMode: TerminalPlayMode,
 *   questId: string,
 *   labyrinthNumber: number,
 *   atlasRegionId: string,
 *   outcome: "escaped" | "defeated",
 *   fossilId?: string
 * }} input
 * @returns {import("./quest-fossils.js").EchoFossil | null}
 */
export function createTerminalFossil(input) {
  if (input.playMode !== "personal") {
    return null;
  }
  return createEchoFossil(input);
}
