# A legacy ruleset survives Restart and Active Run Recovery

## Symptom

A player is stuck in a Windway pocket after the windways-v2 fix ships. Restart
and Retry give the same trapped board. The Warden Mode line reads "Path clear",
so the player blames the Warden.

## Root cause

The fix changed generation for new Runs only. A Run that starts before the
release keeps `rulesetRevision: "windways-v1"` in its active-run locator.

- `startFreshRun` in `src/main.js` reuses the locator when the Level and the
  Labyrinth Number match. It keeps the seed and the legacy revision.
- Active Run Recovery restores the v1 Run as it is.

So the v1 trap board comes back on each Restart. A generation fix does not
reach a player until every path that rebuilds a Run asks for the current
revision.

## Fix

- `currentRunRuleset` maps a legacy Quest revision to the current revision of
  its Atlas Region. `startFreshRun` uses it, so Restart and Retry rebuild the
  same seed on windways-v2 with a new run ID.
- `explorerCanBeTrapped` runs the Objective Reachability check from the
  Explorer tile. `startSharedRun` drops a recovered Run that fails it and starts
  a fresh Run with a notice.
- ADR 0053 item 5 records the amendment.

## Tests

- `tests/legacy-windway-recovery.test.js` pins `WINDWAY-TRAP-7` under v1, walks
  it into the pocket, and checks that the upgraded ruleset has no trap.
- `tests/warden-behavior.test.js` plays each Gate Warden milestone with every
  Warden live. It checks that a Warden never changes where a Move goes, never
  enters the Gate, an Echo, or a wall, and never stops an Explorer who answers
  correctly. The no-soft-lock searches remove Wardens on that claim.

## Rule

A generation fix that keeps a legacy revision must also route each rebuild
path (Restart, Retry, Recovery) to the current revision.
