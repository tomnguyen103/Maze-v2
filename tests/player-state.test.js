import {
  INITIAL_PLAYER_STATE,
  reducePlayerState
} from "../src/player/player-state.js";
import { describe, expect, it } from "vitest";

const PROFILE = {
  username: "Moss Runner",
  explorerPalette: "violet",
  playgroundPalette: "dusk"
};

describe("player session state", () => {
  it("requires first-login profile creation when Clerk has no saved profile", () => {
    const authenticated = reducePlayerState(INITIAL_PLAYER_STATE, {
      type: "auth-changed",
      userId: "user_123"
    });
    const loaded = reducePlayerState(authenticated, {
      type: "profile-loaded",
      profile: null
    });

    expect(loaded).toMatchObject({
      userId: "user_123",
      profile: null,
      profileRequired: true,
      loading: false
    });
  });

  it("keeps a saved profile and clears the first-login requirement", () => {
    const loaded = reducePlayerState(
      {
        userId: "user_123",
        profile: null,
        profileRequired: true,
        loading: false
      },
      { type: "profile-saved", profile: PROFILE }
    );

    expect(loaded.profile).toEqual(PROFILE);
    expect(loaded.profileRequired).toBe(false);
  });

  it("returns to clean guest state on sign out", () => {
    const signedOut = reducePlayerState(
      {
        userId: "user_123",
        profile: PROFILE,
        profileRequired: false,
        loading: false
      },
      { type: "auth-changed", userId: "" }
    );

    expect(signedOut).toEqual(INITIAL_PLAYER_STATE);
  });
});
