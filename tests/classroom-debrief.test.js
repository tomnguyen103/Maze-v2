import { describe, expect, it } from "vitest";
import {
  buildPrivateReflectionPrompts,
  buildReviewedNextStepCards,
  MIN_OBJECTIVE_RESPONSES
} from "../src/classroom/classroom-debrief.js";

describe("Classroom Expedition debrief", () => {
  it("hides objective signals below the privacy threshold", () => {
    expect(MIN_OBJECTIVE_RESPONSES).toBe(3);
    expect(
      buildReviewedNextStepCards([
        {
          objectiveId: "bright-combine-groups",
          total: 2,
          correct: 2
        },
        {
          objectiveId: "bright-take-away",
          total: 3,
          correct: 2
        }
      ])
    ).toEqual([
      expect.objectContaining({
        objectiveId: "bright-take-away",
        title: "Try next: Take away from a group"
      })
    ]);
  });

  it("returns reviewed supportive next steps without response facts", () => {
    const cards = buildReviewedNextStepCards([
      {
        objectiveId: "bright-combine-groups",
        total: 4,
        correct: 3,
        wrong: 1,
        studentName: "Should never render"
      }
    ]);
    expect(cards).toEqual([
      {
        objectiveId: "bright-combine-groups",
        topicLabel: "Number paths",
        label: "Combine groups",
        title: "Try next: Combine groups",
        activity: expect.any(String)
      }
    ]);
    expect(JSON.stringify(cards)).not.toMatch(
      /studentName|correct|wrong|prompt|answer|timestamp/i
    );
  });

  it("keeps Student reflection prompts local and read-only", () => {
    expect(buildPrivateReflectionPrompts()).toEqual([]);
    expect(buildPrivateReflectionPrompts({ escapedCount: 0 })).toEqual([]);
    expect(buildPrivateReflectionPrompts({ escapedCount: 1 })).toHaveLength(2);
    expect(
      buildPrivateReflectionPrompts({ escapedCount: 4, regionComplete: true })
    ).toEqual([
      "Which clue or choice helped you most during this Expedition?",
      "What will you try first when a new Labyrinth feels tricky?"
    ]);
  });
});
