export const INITIAL_PLAYER_STATE = Object.freeze({
  userId: "",
  profile: null,
  profileRequired: false,
  loading: false
});

/**
 * @typedef {{
 *   username: string,
 *   explorerPalette: string,
 *   playgroundPalette: string
 * }} PlayerProfile
 * @typedef {{
 *   userId: string,
 *   profile: PlayerProfile | null,
 *   profileRequired: boolean,
 *   loading: boolean
 * }} PlayerState
 * @typedef {{
 *   type: "auth-changed",
 *   userId: string
 * } | {
 *   type: "profile-loaded",
 *   profile: PlayerProfile | null
 * } | {
 *   type: "profile-saved",
 *   profile: PlayerProfile
 * }} PlayerStateEvent
 */

/**
 * @param {PlayerState} state
 * @param {PlayerStateEvent} event
 * @returns {PlayerState}
 */
export function reducePlayerState(state, event) {
  if (event.type === "auth-changed") {
    if (!event.userId) {
      return { ...INITIAL_PLAYER_STATE };
    }
    if (event.userId === state.userId) {
      return state;
    }
    return {
      userId: event.userId,
      profile: null,
      profileRequired: false,
      loading: true
    };
  }
  if (event.type === "profile-loaded") {
    return {
      ...state,
      profile: event.profile,
      profileRequired: event.profile === null,
      loading: false
    };
  }
  return {
    ...state,
    profile: event.profile,
    profileRequired: false,
    loading: false
  };
}
