import { loadAccessSettings } from "../player/access-settings.js";

const VOICE_STORAGE_KEY = "echo-maze:narration-voice:v1";
const RATES = Object.freeze({ standard: 1, slower: 0.8, faster: 1.25 });
const UNAVAILABLE_COPY =
  "Read Aloud needs a voice stored on this device. The written Question always stays.";

/**
 * Question Narration (player control: Read Aloud), per ADR 0032: reviewed
 * child-facing text may only reach a browser voice reporting
 * localService: true. Nothing speaks automatically; closing or changing the
 * source content cancels speech immediately; a missing local voice is an
 * honest, visible unavailable state, never a remote fallback.
 *
 * The three surfaces are the Warden Question dialog, the Workshop practice
 * dialog, and the Echo Lens panel. Controls are injected here so the game
 * bundle carries only this module's dynamic import.
 */
const SURFACES = Object.freeze([
  Object.freeze({
    id: "challenge",
    dialogId: "challenge-dialog",
    mountSelector: ".challenge-support",
    partIds: Object.freeze([
      "challenge-notice",
      "challenge-question",
      "challenge-choices",
      "question-hint",
      "challenge-feedback",
      "challenge-echo-lens-content"
    ])
  }),
  Object.freeze({
    id: "practice",
    dialogId: "practice-dialog",
    mountSelector: ".practice-support",
    partIds: Object.freeze([
      "practice-question",
      "practice-choices",
      "practice-hint",
      "practice-feedback"
    ])
  }),
  Object.freeze({
    id: "lens",
    dialogId: "echo-lens",
    mountSelector: "#echo-lens",
    partIds: Object.freeze(["echo-lens-content"])
  })
]);

/** @type {ReturnType<typeof createQuestionNarration> | null} */
let singleton = null;

/**
 * App entry point: one narration instance owns every surface, however many
 * lazy views ask for it.
 */
export function ensureQuestionNarration() {
  singleton ??= createQuestionNarration();
  return singleton;
}

/**
 * @param {{
 *   synthesis?: {
 *     getVoices: () => { name: string, lang: string, localService: boolean, voiceURI: string }[],
 *     speak: (utterance: Record<string, unknown>) => void,
 *     cancel: () => void,
 *     pause: () => void,
 *     resume: () => void,
 *     addEventListener?: (type: string, listener: () => void) => void
 *   } | null,
 *   utteranceFactory?: (text: string) => Record<string, unknown>,
 *   storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
 *   getPace?: () => string,
 *   language?: string,
 *   root?: Document
 * }} [options]
 */
export function createQuestionNarration({
  synthesis = /** @type {any} */ (globalThis).speechSynthesis ?? null,
  utteranceFactory = (text) =>
    /** @type {Record<string, unknown>} */ (
      new (/** @type {any} */ (globalThis).SpeechSynthesisUtterance)(text)
    ),
  storage = globalThis.localStorage,
  getPace = () => loadAccessSettings().narrationPace,
  language = "en",
  root = document
} = {}) {
  /** @type {ReturnType<NonNullable<typeof synthesis>["getVoices"]> } */
  let localVoices = [];
  /** @type {{ setAvailable: (available: boolean) => void }[]} */
  const mounted = [];
  let speaking = false;
  let paused = false;

  function refreshVoices() {
    // ADR 0032: only localService voices for the content language are ever
    // eligible. A remote-only inventory reads exactly like no voice at all.
    localVoices = (synthesis?.getVoices() ?? []).filter(
      (voice) =>
        voice.localService === true &&
        String(voice.lang ?? "").toLowerCase().startsWith(language)
    );
    for (const surface of mounted) {
      surface.setAvailable(localVoices.length > 0);
    }
  }

  function chooseVoice() {
    let storedUri = null;
    try {
      storedUri = storage?.getItem(VOICE_STORAGE_KEY) ?? null;
    } catch {
      storedUri = null;
    }
    const voice =
      localVoices.find((candidate) => candidate.voiceURI === storedUri) ??
      localVoices[0] ??
      null;
    if (voice) {
      try {
        storage?.setItem(VOICE_STORAGE_KEY, voice.voiceURI);
      } catch {
        // Voice memory is a convenience, never a requirement.
      }
    }
    return voice;
  }

  function stop() {
    if (speaking || paused) {
      synthesis?.cancel();
    }
    speaking = false;
    paused = false;
  }

  /** @param {readonly string[]} partIds */
  function visibleText(partIds) {
    const parts = [];
    for (const id of partIds) {
      const element = root.getElementById(id);
      if (!element || element.hidden || element.closest("[hidden]")) {
        continue;
      }
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) {
        parts.push(text);
      }
    }
    return parts.join(". ");
  }

  /** @param {(typeof SURFACES)[number]} config */
  function mountSurface(config) {
    const mount = root.querySelector(config.mountSelector);
    if (!mount || mount.querySelector("[data-narration]")) {
      return;
    }
    const row = root.createElement("div");
    row.className = "narration-controls";
    const read = root.createElement("button");
    read.type = "button";
    read.className = "control-button";
    read.dataset.narration = "read";
    read.textContent = "Read Aloud";
    const pause = root.createElement("button");
    pause.type = "button";
    pause.className = "control-button";
    pause.dataset.narration = "pause";
    pause.textContent = "Pause";
    const stopButton = root.createElement("button");
    stopButton.type = "button";
    stopButton.className = "control-button";
    stopButton.dataset.narration = "stop";
    stopButton.textContent = "Stop";
    const status = root.createElement("span");
    status.className = "narration-status";
    status.setAttribute("role", "status");
    row.append(read, pause, stopButton, status);
    mount.append(row);

    read.addEventListener("click", () => {
      // Read Aloud on demand; pressing it again repeats from the start.
      stop();
      const voice = chooseVoice();
      if (!voice) {
        return;
      }
      const text = visibleText(config.partIds);
      if (!text) {
        status.textContent = "Nothing to read here yet.";
        return;
      }
      const utterance = utteranceFactory(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate =
        RATES[/** @type {keyof typeof RATES} */ (getPace())] ?? 1;
      speaking = true;
      paused = false;
      pause.textContent = "Pause";
      utterance.onend = () => {
        speaking = false;
        paused = false;
      };
      synthesis?.speak(utterance);
    });
    pause.addEventListener("click", () => {
      if (!speaking) {
        return;
      }
      if (paused) {
        synthesis?.resume();
        paused = false;
        pause.textContent = "Pause";
      } else {
        synthesis?.pause();
        paused = true;
        pause.textContent = "Resume";
      }
    });
    stopButton.addEventListener("click", stop);

    const dialog = root.getElementById(config.dialogId);
    if (dialog) {
      dialog.addEventListener("close", stop);
      // The Echo Lens surface is a <details> element: collapsing it fires
      // toggle, not close, and must cancel speech just the same.
      dialog.addEventListener("toggle", () => {
        if (!(/** @type {{ open?: boolean }} */ (dialog).open)) {
          stop();
        }
      });
      // Replaced or re-rendered content cancels speech immediately: the
      // spoken words must never outlive the exact visible revision. The
      // controls row itself is exempt — Pause flipping its own label must
      // not read as a content change and self-cancel the narration.
      const observer = new MutationObserver((records) => {
        if (!speaking) {
          return;
        }
        const external = records.some((record) => {
          const node =
            record.target instanceof Element
              ? record.target
              : record.target.parentElement;
          return !node?.closest(".narration-controls");
        });
        if (external) {
          stop();
        }
      });
      observer.observe(dialog, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden", "open"]
      });
    }

    /** @param {boolean} available */
    function setAvailable(available) {
      read.disabled = !available;
      pause.disabled = !available;
      stopButton.disabled = !available;
      status.textContent = available ? "" : UNAVAILABLE_COPY;
    }
    mounted.push({ setAvailable });
  }

  for (const surface of SURFACES) {
    mountSurface(surface);
  }
  if (synthesis) {
    synthesis.addEventListener?.("voiceschanged", refreshVoices);
  }
  refreshVoices();

  return { refreshVoices, stop };
}
