import { createDailyContract } from "../../src/game/daily-labyrinth.js";
import { getLabyrinthConfig } from "../../src/questions/quest-levels.js";

export const DAILY_REPLAY_FIXTURE = createDailyContract("2026-07-26");
export const DAILY_REPLAY_CONFIG = getLabyrinthConfig(
  DAILY_REPLAY_FIXTURE.levelId,
  DAILY_REPLAY_FIXTURE.labyrinthNumber
);
export const DAILY_REPLAY_RESULT = Object.freeze({
  status: "won",
  seed: "DAILY-20260726",
  score: 900,
  wardensDefeated: 2,
  echoesCollected: 4,
  moves: 76,
  elapsedMs: 7600
});
export const DAILY_FIRST_CHALLENGE_MOVES = 33;

const DAILY_SCRIPT = [
  ..."right right right right right right down down right right right right right right down down down down left left up up left left left left down down down down down down left".split(
    " "
  ),
  "answer:a",
  ..."left down down right right right right right right right left".split(" "),
  "answer:b",
  ..."left left left left left left up up up up left left left left up up up up right right down down right right up up up up left left left left".split(
    " "
  )
];

/** @returns {import("../../src/game/run-action-log.js").RunActionLog} */
export function dailyWinningLog() {
  let elapsedMs = 0;
  return {
    version: 1,
    actions: DAILY_SCRIPT.map((step) => {
      if (step.startsWith("answer:")) {
        return {
          type: "answer-question",
          answerId: step.slice("answer:".length),
          elapsedMs
        };
      }
      elapsedMs += 100;
      return {
        type: "move",
        direction: /** @type {"up" | "right" | "down" | "left"} */ (step),
        elapsedMs
      };
    })
  };
}
