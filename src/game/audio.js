/**
 * Small opt-in Web Audio soundscape. No audio context exists before the user
 * explicitly enables sound.
 */
export class EchoAudio {
  /** @type {AudioContext | null} */
  #context = null;
  #enabled = false;

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
    }
    return this.#enabled;
  }

  /**
   * @param {"move" | "blocked" | "echo" | "pulse" | "hurt" | "won" | "lost" | "enabled"} cue
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
      hurt: [96, 0.2, "sawtooth"],
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
    if (cue === "echo" || cue === "won") {
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
}
