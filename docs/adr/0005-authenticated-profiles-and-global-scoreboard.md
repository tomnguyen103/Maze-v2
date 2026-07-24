# ADR 0005: Keep authenticated profiles and global scores outside deterministic Runs

## Status

Accepted

## Context

Echo Maze needs named player accounts, cosmetic color preferences, and a shared
scoreboard without changing the existing device-local Personal Records.
Deployment targets Vercel, whose Functions require durable shared storage
outside the function filesystem.

The Labyrinth remains deterministic from its seed and configuration. Identity,
network availability, and global ranking must not change maze generation,
Warden movement, or the result of a gameplay action.

## Decision

- Clerk authenticates players. The browser may continue in guest mode when
  Clerk is not configured or a player chooses not to sign in.
- Neon Postgres stores Player Profiles and escaped Run Score Entries.
- A Player Profile uses the verified Clerk user ID as its private identity and
  exposes only its chosen username on the Global Scoreboard.
- A first authenticated visit without a Player Profile blocks shared score
  submission until the player creates a unique username.
- Usernames contain 3 to 20 letters, numbers, spaces, underscores, or hyphens.
  Uniqueness is case-insensitive.
- Explorer and playground colors come from reviewed accessible presets. They
  are cosmetic and never enter Run state or deterministic calculations.
- A Run Score starts at zero for each Labyrinth:
  - defeating a Warden awards 100 points and one Pulse;
  - recovering an Echo awards 50 points;
  - escaping awards 500 points.
- Only escaped Runs may become Score Entries. The server ignores a client
  total and recalculates score from bounded Run facts.
- Each terminal Run submission has an idempotency key. Repeating it cannot
  create another Score Entry.
- The Global Scoreboard returns the best Score Entry per Player Profile.
  Ranking uses score descending, Labyrinth Number descending, Moves ascending,
  elapsed time ascending, then submission time ascending.
- Personal Records remain device-local, retain their current schema and
  ranking, and do not depend on authentication or network access.
- Authentication is required for profile writes and score submissions. Reading
  the Global Scoreboard is public and returns usernames and score facts only.

## Security and integrity boundaries

- Clerk middleware verifies every authenticated API request on the server.
- Database credentials and Clerk secret keys remain server-only.
- The browser never selects a Clerk user ID for a write.
- API inputs use explicit allowlists, length limits, integer bounds, and
  parameterized SQL.
- Score submission is suitable for a casual leaderboard. Bounds,
  authentication, and idempotency prevent accidental or trivial duplication,
  but a determined modified client can fabricate plausible Run facts. A fully
  cheat-resistant board would require server-authoritative action replay and is
  outside this change.
- Public responses never expose email addresses, Clerk IDs, session data, or
  database identifiers.

## Consequences

- The game stays playable when Clerk or Neon is unavailable, but global profile
  and scoreboard actions show an unavailable state.
- Signed-in color choices can follow the player across devices.
- Vercel deployments need Clerk publishable and secret keys plus a Neon
  database connection supplied as environment variables.
- Preview deployments may use Neon preview branches without affecting
  production scores.
- Score balancing can change only through a new decision that also addresses
  compatibility with existing Score Entries.
