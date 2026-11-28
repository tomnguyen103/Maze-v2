import { afterEach, describe, expect, it, vi } from "vitest";
import { EchoAudio } from "../src/game/audio.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EchoAudio ambient Region layer", () => {
  it("starts only after opt-in and stops for pause, tab hiding, or Sound Off", async () => {
    /** @type {any[]} */
    const oscillators = [];
    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator() {
        const oscillator = {
          type: "sine",
          frequency: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn()
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn()
        };
        oscillators.push(oscillator);
        return oscillator;
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn()
          },
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      }
      resume = vi.fn();
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = new EchoAudio();

    audio.setAmbient("foundation", true);
    expect(oscillators).toHaveLength(0);

    await audio.toggle();
    expect(oscillators).toHaveLength(2);
    const firstAmbient = oscillators[1];
    expect(firstAmbient.stop).not.toHaveBeenCalled();

    audio.setAmbient("foundation", false);
    expect(firstAmbient.stop).toHaveBeenCalledOnce();

    audio.setAmbient("foundation", true);
    const secondAmbient = oscillators.at(-1);
    expect(secondAmbient.stop).not.toHaveBeenCalled();

    audio.setAmbient("developing", true);
    expect(secondAmbient.stop).toHaveBeenCalledOnce();
    const regionTwoAmbient = oscillators.at(-1);
    expect(regionTwoAmbient.frequency.setValueAtTime).toHaveBeenCalledWith(
      110,
      0
    );
    expect(regionTwoAmbient.stop).not.toHaveBeenCalled();

    audio.setAmbient("capable", true);
    expect(regionTwoAmbient.stop).toHaveBeenCalledOnce();
    const regionThreeAmbient = oscillators.at(-1);
    expect(regionThreeAmbient.frequency.setValueAtTime).toHaveBeenCalledWith(
      147,
      0
    );

    audio.setAmbient("advanced", true);
    expect(regionThreeAmbient.stop).toHaveBeenCalledOnce();
    const regionFourAmbient = oscillators.at(-1);
    expect(regionFourAmbient?.frequency.setValueAtTime).toHaveBeenCalledWith(
      196,
      expect.any(Number)
    );
    expect(regionFourAmbient?.stop).not.toHaveBeenCalled();
    audio.setAmbient("mastery", true);
    expect(regionFourAmbient?.stop).toHaveBeenCalledOnce();
    const regionFiveAmbient = oscillators.at(-1);
    expect(regionFiveAmbient?.frequency.setValueAtTime).toHaveBeenCalledWith(
      247,
      expect.any(Number)
    );
    expect(regionFiveAmbient?.stop).not.toHaveBeenCalled();
    await audio.toggle();
    expect(regionFiveAmbient?.stop).toHaveBeenCalledOnce();
  });
});

describe("EchoAudio directional Cue voice", () => {
  it("pans and detunes a voiced Cue, and leaves a plain Cue unpanned (A-15)", async () => {
    /** @type {any[]} */
    const oscillators = [];
    /** @type {any[]} */
    const panners = [];
    class FakeAudioContext {
      state = "running";
      currentTime = 1;
      destination = {};
      createOscillator() {
        const oscillator = {
          type: "sine",
          frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          detune: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn()
        };
        oscillators.push(oscillator);
        return oscillator;
      }
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn()
        };
      }
      createStereoPanner() {
        const panner = { pan: { setValueAtTime: vi.fn() }, connect: vi.fn() };
        panners.push(panner);
        return panner;
      }
      resume = vi.fn();
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = new EchoAudio();
    await audio.toggle();
    panners.length = 0;

    audio.play("move");
    expect(panners).toHaveLength(0);

    audio.play("compass-gate", { pan: 0.5, detune: 200 });
    expect(panners).toHaveLength(1);
    expect(panners[0].pan.setValueAtTime).toHaveBeenCalledWith(0.5, 1);
    expect(panners[0].connect).toHaveBeenCalled();
    expect(oscillators.at(-1).detune.setValueAtTime).toHaveBeenCalledWith(200, 1);
  });
});
