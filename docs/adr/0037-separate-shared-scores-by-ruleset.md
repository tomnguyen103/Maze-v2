# 0037: Rank shared scores only within one exact Region and ruleset

- Status: Accepted
- Date: 2026-07-29

## Context

Trail Twists change deterministic movement decisions by Atlas Region. Even
though scoring values remain unchanged, a Run under Echo Hush is not
mechanically equivalent to one under Tide Doors or legacy Classic Rules.
Combining them in one ordered list would imply competitive comparability that
the rules do not support.

## Decision

Every new Score Entry carries its exact Atlas Region and ruleset revision.
Global Scoreboard queries, best-entry replacement, ordering, and Global Max
Score operate only within the composite `(Atlas Region, ruleset revision)`
partition. The player sees the board for the current Run's Region and rules by
default and may explicitly view preserved legacy entries under **Classic
Rules**.

Existing scores are neither deleted nor silently assigned to a new regional
ruleset. Entries that predate ruleset identity remain on the Classic Rules
board. A score cannot replace or compare against one from a different Atlas
Region or ruleset revision, even when the seed, Quest Level, Labyrinth Number,
or numeric score matches.

Verified Daily remains a separate Classic Rules ranking and is not routed
through this selection.

This ADR supersedes ADR 0005 only where it describes one cross-ruleset Global
Scoreboard and one cross-ruleset Global Max Score.

## Consequences

- Shared rankings remain honest after regional mechanics ship.
- Legacy history remains readable without pretending it used new rules.
- Boards become smaller and ruleset selection must be visible.
- Submission, replacement, indexes, migration defaults, old links, and
  concurrent best-score updates require exact Region-and-ruleset tests.
