// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQuestionNarration } from "../src/learning/question-narration.js";

/** @param {string} name @param {string} lang @param {boolean} localService */
function fakeVoice(name, lang, localService) {
  return { name, lang, localService, voiceURI: `uri:${name}` };
}

/** @param {{ voices?: ReturnType<typeof fakeVoice>[] }} [options] */
function fakeSynthesis({ voices = [] } = {}) {
  /** @type {Record<string, unknown>[]} */
  const spoken = [];
  return {
    voices,
    spoken,
    getVoices: () => voices,
    /** @param {Record<string, unknown>} utterance */
    speak: (utterance) => {
      spoken.push(utterance);
    },
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    addEventListener: vi.fn()
  };
}

function fakeStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => map.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => void map.set(key, String(value)),
    /** @param {string} key */
    removeItem: (key) => void map.delete(key)
  };
}

/** @param {string} text */
function utteranceFactory(text) {
  return { text, rate: 1, voice: null, lang: "" };
}

function mountChallengeDom() {
  document.body.innerHTML = `
    <dialog id="challenge-dialog" open>
      <p id="challenge-notice" hidden></p>
      <p id="challenge-question">What is 4 + 3?</p>
      <div class="challenge-support"></div>
      <p id="question-hint" hidden>Count up from four.</p>
      <div id="challenge-choices">
        <button class="challenge-choice">6</button>
        <button class="challenge-choice">7</button>
      </div>
      <p id="challenge-feedback"></p>
    </dialog>
    <dialog id="practice-dialog">
      <p id="practice-question"></p>
      <div class="practice-support"></div>
      <p id="practice-hint" hidden></p>
      <div id="practice-choices"></div>
      <p id="practice-feedback"></p>
    </dialog>
    <aside id="echo-lens" hidden>
      <div id="echo-lens-content"></div>
    </aside>
  `;
}

/** @param {Record<string, unknown>} [overrides] */
function narration(overrides = {}) {
  const synthesis = fakeSynthesis({
    voices: [
      fakeVoice("Remote English", "en-US", false),
      fakeVoice("Local English", "en-US", true)
    ]
  });
  const storage = fakeStorage();
  const controller = createQuestionNarration({
    synthesis,
    utteranceFactory,
    storage,
    getPace: () => "standard",
    ...overrides
  });
  return { synthesis, storage, controller };
}

describe("Question Narration", () => {
  beforeEach(() => {
    mountChallengeDom();
  });

  it("mounts Read Aloud controls without speaking automatically", () => {
    const { synthesis } = narration();
    const button = document.querySelector(
      ".challenge-support [data-narration='read']"
    );
    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(synthesis.spoken).toHaveLength(0);
  });

  it("speaks only currently visible reviewed content through a local voice", () => {
    const { synthesis } = narration();
    const read = /** @type {HTMLButtonElement} */ (
      document.querySelector(".challenge-support [data-narration='read']")
    );
    read.click();
    expect(synthesis.spoken).toHaveLength(1);
    const utterance = /** @type {{ text: string, voice: { name: string, localService: boolean } }} */ (
      synthesis.spoken[0]
    );
    expect(utterance.text).toContain("What is 4 + 3?");
    expect(utterance.text).toContain("7");
    expect(utterance.text).not.toContain("Count up from four.");
    expect(utterance.voice.localService).toBe(true);
    expect(utterance.voice.name).toBe("Local English");

    document.getElementById("question-hint")?.removeAttribute("hidden");
    read.click();
    const second = /** @type {{ text: string }} */ (synthesis.spoken[1]);
    expect(second.text).toContain("Count up from four.");
  });

  it("maps the synced pace to bounded speech rates", () => {
    for (const [pace, rate] of [
      ["standard", 1],
      ["slower", 0.8],
      ["faster", 1.25]
    ]) {
      mountChallengeDom();
      const { synthesis } = narration({ getPace: () => pace });
      /** @type {HTMLButtonElement} */ (
        document.querySelector(".challenge-support [data-narration='read']")
      ).click();
      expect(
        /** @type {{ rate: number }} */ (synthesis.spoken[0]).rate
      ).toBe(rate);
    }
  });

  it("pauses, resumes, and stops on demand", () => {
    const { synthesis } = narration();
    /** @type {HTMLButtonElement} */ (
      document.querySelector(".challenge-support [data-narration='read']")
    ).click();
    const pause = /** @type {HTMLButtonElement} */ (
      document.querySelector(".challenge-support [data-narration='pause']")
    );
    pause.click();
    expect(synthesis.pause).toHaveBeenCalled();
    pause.click();
    expect(synthesis.resume).toHaveBeenCalled();
    /** @type {HTMLButtonElement} */ (
      document.querySelector(".challenge-support [data-narration='stop']")
    ).click();
    expect(synthesis.cancel).toHaveBeenCalled();
  });

  it("cancels immediately when the source dialog closes or its content changes", async () => {
    const { synthesis } = narration();
    /** @type {HTMLButtonElement} */ (
      document.querySelector(".challenge-support [data-narration='read']")
    ).click();
    const question = /** @type {HTMLElement} */ (
      document.getElementById("challenge-question")
    );
    question.textContent = "What is 9 - 2?";
    await vi.waitFor(() => expect(synthesis.cancel).toHaveBeenCalled());

    synthesis.cancel.mockClear();
    /** @type {HTMLButtonElement} */ (
      document.querySelector(".challenge-support [data-narration='read']")
    ).click();
    const dialog = /** @type {HTMLDialogElement} */ (
      document.getElementById("challenge-dialog")
    );
    dialog.dispatchEvent(new Event("close"));
    expect(synthesis.cancel).toHaveBeenCalled();
  });

  it("is visibly unavailable with truthful copy when only remote voices exist", () => {
    const { synthesis } = narration({
      synthesis: fakeSynthesis({
        voices: [fakeVoice("Remote Only", "en-US", false)]
      })
    });
    const read = /** @type {HTMLButtonElement} */ (
      document.querySelector(".challenge-support [data-narration='read']")
    );
    expect(read.disabled).toBe(true);
    expect(
      document.querySelector(".challenge-support .narration-status")
        ?.textContent
    ).toContain("voice stored on this device");
    expect(synthesis.spoken).toHaveLength(0);
  });

  it("is unavailable when the speech API is missing or languages mismatch", () => {
    createQuestionNarration({
      synthesis: null,
      utteranceFactory,
      storage: fakeStorage(),
      getPace: () => "standard"
    });
    const read = /** @type {HTMLButtonElement} */ (
      document.querySelector(".challenge-support [data-narration='read']")
    );
    expect(read.disabled).toBe(true);

    mountChallengeDom();
    narration({
      synthesis: fakeSynthesis({
        voices: [fakeVoice("Local French", "fr-FR", true)]
      })
    });
    expect(
      /** @type {HTMLButtonElement} */ (
        document.querySelector(".challenge-support [data-narration='read']")
      ).disabled
    ).toBe(true);
  });

  it("remembers the device voice and falls back local-only when it disappears", () => {
    const storage = fakeStorage();
    storage.setItem("echo-maze:narration-voice:v1", "uri:Gone Voice");
    const synthesis = fakeSynthesis({
      voices: [
        fakeVoice("Remote English", "en-US", false),
        fakeVoice("Local English", "en-US", true)
      ]
    });
    createQuestionNarration({
      synthesis,
      utteranceFactory,
      storage,
      getPace: () => "standard"
    });
    /** @type {HTMLButtonElement} */ (
      document.querySelector(".challenge-support [data-narration='read']")
    ).click();
    const utterance = /** @type {{ voice: { name: string } }} */ (
      synthesis.spoken[0]
    );
    expect(utterance.voice.name).toBe("Local English");
    expect(storage.getItem("echo-maze:narration-voice:v1")).toBe(
      "uri:Local English"
    );
  });
});
