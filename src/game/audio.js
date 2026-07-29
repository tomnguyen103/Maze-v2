/**
 * Small opt-in Web Audio soundscape. No audio context exists before the user
 * explicitly enables sound.
 */
/** @type {Readonly<Record<string, number>>} */
const AMBIENT_FREQUENCIES = Object.freeze({
  foundation: 82,
  developing: 110
});

export class EchoAudio {
  /** @type {AudioContext | null} */
  #context = null;
  #enabled = false;
  /** @type {OscillatorNode | null} */
  #ambientOscillator = null;
  /** @type {GainNode | null} */
  #ambientGain = null;
  #ambientRegionId = "";
  #ambientActive = false;

  get enabled() {
    return this.#enabled;
  }

  async toggle() {
    if (!this.#context) {
      this.#context = new AudioContext();
    }
    if (this.#context.state === "suspended") {
      await this.#context.resume();
    }
    this.#enabled = !this.#enabled;
    if (this.#enabled) {
      this.play("enabled");
      this.#syncAmbient();
    } else {
      this.#stopAmbient();
    }
    return this.#enabled;
  }

  /** @param {string} regionId @param {boolean} active */
  setAmbient(regionId, active) {
    const changed = this.#ambientRegionId !== regionId;
    this.#ambientRegionId = regionId;
    this.#ambientActive = active;
    if (changed) {
      this.#stopAmbient();
    }
    this.#syncAmbient();
  }

  /**
   * @param {"move" | "blocked" | "echo" | "pulse" | "challenge" | "correct" | "wrong" | "won" | "lost" | "enabled"} cue
   */
  play(cue) {
    if (!this.#enabled || !this.#context) {
      return;
    }

    /** @type {Record<typeof cue, [number, number, OscillatorType]>} */
    const palette = {
      move: [130, 0.035, "sine"],
      blocked: [78, 0.07, "square"],
      echo: [440, 0.24, "sine"],
      pulse: [220, 0.34, "sine"],
      challenge: [185, 0.22, "triangle"],
      correct: [610, 0.3, "sine"],
      wrong: [96, 0.2, "sawtooth"],
      won: [520, 0.45, "triangle"],
      lost: [62, 0.5, "sawtooth"],
      enabled: [330, 0.16, "sine"]
    };
    const [frequency, duration, wave] = palette[cue];
    const now = this.#context.currentTime;
    const oscillator = this.#context.createOscillator();
    const gain = this.#context.createGain();

    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (cue === "echo" || cue === "correct" || cue === "won") {
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.5, now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.#context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  #syncAmbient() {
    const ambientFrequency = AMBIENT_FREQUENCIES[this.#ambientRegionId];
    if (
      !this.#enabled ||
      !this.#context ||
      !this.#ambientActive ||
      !ambientFrequency
    ) {
      this.#stopAmbient();
      return;
    }
    if (this.#ambientOscillator) {
      return;
    }
    const oscillator = this.#context.createOscillator();
    const gain = this.#context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(
      ambientFrequency,
      this.#context.currentTime
    );
    gain.gain.setValueAtTime(0.012, this.#context.currentTime);
    oscillator.connect(gain);
    gain.connect(this.#context.destination);
    oscillator.start();
    this.#ambientOscillator = oscillator;
    this.#ambientGain = gain;
  }

  #stopAmbient() {
    try {
      this.#ambientOscillator?.stop();
    } catch {
      // A stopped oscillator cannot be restarted; cleanup is still complete.
    }
    this.#ambientOscillator?.disconnect();
    this.#ambientGain?.disconnect();
    this.#ambientOscillator = null;
    this.#ambientGain = null;
  }
}
