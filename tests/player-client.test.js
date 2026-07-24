import {
  createPlayerApiClient,
  createRunIdempotencyKey
} from "../src/player/player-client.js";
import {
  applyPlayerPalettes,
  DEFAULT_PLAYER_PROFILE
} from "../src/player/palettes.js";
import { describe, expect, it, vi } from "vitest";

describe("player client", () => {
  it("adds the Clerk session token to authenticated requests", async () => {
    const fetchImpl = vi.fn(
      /** @param {string | URL | Request} _path @param {RequestInit} [_options] */
      async (_path, _options) => {
        void _path;
        void _options;
        return new Response(
          JSON.stringify({
            profile: {
              username: "Moss Runner",
              explorerPalette: "teal",
              playgroundPalette: "daylight"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken: async () => "session-token"
    });

    await client.getProfile();

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({ credentials: "same-origin" })
    );
    const requestOptions = fetchImpl.mock.calls[0][1];
    expect(requestOptions).toBeDefined();
    if (!requestOptions) {
      throw new Error("Expected request options.");
    }
    expect(new Headers(requestOptions.headers).get("authorization")).toBe(
      "Bearer session-token"
    );
  });

  it("surfaces the API error message", async () => {
    const client = createPlayerApiClient({
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "That username is already in use." }), {
          status: 409,
          headers: { "content-type": "application/json" }
        }),
      getToken: async () => null
    });

    await expect(
      client.saveProfile({
        username: "Moss",
        explorerPalette: "teal",
        playgroundPalette: "daylight"
      })
    ).rejects.toThrow("That username is already in use.");
  });

  it("aborts a player request after its timeout", async () => {
    vi.useFakeTimers();
    try {
      const client = createPlayerApiClient({
        fetchImpl: (_path, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Timed out", "AbortError"));
            });
          }),
        timeoutMs: 10
      });

      const assertion = expect(client.getLeaderboard()).rejects.toMatchObject({
        name: "AbortError"
      });
      await vi.advanceTimersByTimeAsync(10);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a stable idempotency key from final run facts", () => {
    const run = {
      seed: "MOSS-WATCH-11",
      moves: 81,
      elapsedMs: 92000,
      score: 900
    };

    expect(createRunIdempotencyKey(run, "trail-scout", 4)).toBe(
      createRunIdempotencyKey(run, "trail-scout", 4)
    );
    expect(createRunIdempotencyKey(run, "trail-scout", 4)).toMatch(
      /^[a-z0-9_-]{12,128}$/
    );
  });
});

describe("player palettes", () => {
  it("applies supported palette attributes and falls back to defaults", () => {
    /** @type {{ dataset: Record<string, string> }} */
    const root = { dataset: {} };

    applyPlayerPalettes(
      {
        username: "Moss",
        explorerPalette: "violet",
        playgroundPalette: "dusk"
      },
      root
    );
    expect(root.dataset.explorerPalette).toBe("violet");
    expect(root.dataset.playgroundPalette).toBe("dusk");

    applyPlayerPalettes(
      {
        ...DEFAULT_PLAYER_PROFILE,
        explorerPalette: "unknown",
        playgroundPalette: "unknown"
      },
      root
    );
    expect(root.dataset.explorerPalette).toBe("teal");
    expect(root.dataset.playgroundPalette).toBe("daylight");
  });
});
