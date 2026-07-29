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
    await audio.toggle();
    expect(regionFourAmbient?.stop).toHaveBeenCalledOnce();
  });
});
