# 0012: Keep the UTC Daily casual and outside Quest state

## Status

Accepted

## Context

Echo Maze needs one shared Labyrinth that Explorers can revisit as a daily
ritual. The feature must be deterministic across clients and offline, but the
normal Run entry path consumes account-bound Run Access and owns Quest, Atlas,
Run Record, demo, and Global Scoreboard effects. Reusing that path would make a
casual Daily destructive or commercially misleading.

Generated Question providers are also unsuitable for a shared daily sequence:
provider availability and response timing are intentionally outside the
deterministic Run.

## Decision

Derive a public Daily contract from the current UTC calendar date. Version 1
uses seed `DAILY-YYYYMMDD`, Trail Scout, Labyrinth 5, and a date-derived ordinal
sequence from the bundled reviewed Question deck. The date changes at
`00:00 UTC`. A Daily URL uses `/play?daily=YYYY-MM-DD`; any other date is
expired and presents the current Daily instead of replaying old content.

Daily starts bypass Run Access admission. They never write Quest Progress,
active Run locators, Run Records, demo completion, score submissions, Atlas
state, or cosmetics. Terminal Daily results write only a bounded device-local
record containing date, public seed, completion, elapsed Personal Best, and
Moves. Defeats cannot replace an escape.

The first release has no global Daily ranking, streak, reward, or competitive
claim. A server-verified competitive mode requires a separate fairness
decision.

## Consequences

- Every client can reconstruct the same maze and reviewed card sequence while
  offline.
- Loading, completing, or replaying a Daily leaves the active Quest recoverable
  from its existing device-local locator.
- Shared links contain no identity, child activity, result, or ranking data.
- Old links explain the UTC boundary and offer today’s Daily.
- Daily Personal Best is intentionally device-local and casual.
