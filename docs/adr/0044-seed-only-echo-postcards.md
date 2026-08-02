# 0044: Seed-only Echo Postcards

- Status: Accepted
- Date: 2026-08-02

## Context

The Echo Maze roadmap calls for safe social discovery without turning a
player's Run into a public profile, replay, or competitive artifact. The app
already supports deterministic `/play` links with a seed, Quest Level,
Labyrinth Number, Atlas Region, and ruleset revision. A second server-backed
invitation model would create identity, retention, deletion, and abuse
surfaces that this feature does not need.

## Decision

An Echo Postcard is a versioned `/play` URL with these query parameters only:

- `postcard=1`
- `seed`
- `level`
- `labyrinth`
- `region`
- `rules`

The seed and exact ruleset are validated against the Labyrinth Number before a
Postcard is created or accepted. The marker is presentation metadata; it does
not grant access, bind a recipient to the sender, or change gameplay. The
recipient enters the normal Run Access and normal Run initialization path.

Postcards never contain or persist an Explorer identity, Player Profile,
score, route, Run Action Log, answer, Question, timestamp, ranking, or replay.
No database migration, API endpoint, invitation table, or server-side
Postcard record is added.

## Consequences

- Social discovery is cheap, deterministic, and reversible: sharing a URL does
  not publish a personal result or create durable social state.
- Existing legacy share links remain valid and continue to mean **Play This
  Seed**. The in-game seed control creates the more explicit **Echo Postcard**
  form.
- A copied URL can be forwarded or edited like any URL; it is not an access
  credential or proof of authorship.
- Any future server-tracked invitations, recipients, or social history require
  a new privacy review and a new decision.
