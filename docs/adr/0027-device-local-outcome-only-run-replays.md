# 0027: Retain outcome-only Run Replays with local Run Records

- Status: Accepted
- Date: 2026-07-28

A completed Run may retain one bounded, identity-free Run Replay only alongside
its device-local Run Record. At terminal state, selected answer-option actions
from Active Run Recovery are converted to correct, wrong, Hint, or Skip
outcomes; exact selected option identifiers and answer text are discarded.
Removing or aging out one of the five retained Run Records removes its Replay,
and old Records without outcome logs remain readable through their existing
seed-based behavior. Full route logs never synchronize to cloud storage or
become public shares. This accepts shorter local replay history in exchange for
keeping a child's detailed movement and answer history off the server; any
future Challenge Card is a separate, privacy-reviewed static export rather than
a full Run Replay.

Device-local Run Replay data created during signed-in play is scoped to that
Explorer's account on the device. Signing out or deleting the account removes
that Explorer's Run Replay details before another account can use the device.
Cloud data follows its separate export and deletion contract.

The domain feature is Run Replay and its player action is **Watch Trail**.
Starting a new playable Run from the same seed remains a separate **Play This
Seed** action and is not described as Replay.
