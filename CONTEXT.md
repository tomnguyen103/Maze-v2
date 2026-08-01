# Echo Maze

Echo Maze is a browser puzzle game about revealing a hidden labyrinth, recovering its echoes, and escaping before the player loses all vitality.

## Language

**Explorer**:
The player-controlled presence moving through the labyrinth.
_Avoid_: Adventurer, character, avatar

**Labyrinth**:
The generated network of passages and walls for one run.
_Avoid_: Level, board, map

**Run**:
One attempt that starts in a new labyrinth and ends in escape, defeat, or restart.
_Avoid_: Game, session, round

**First Light Tutorial**:
An optional, replayable introduction to the real Echo, Warden Challenge, and
Gate rules that consumes no Run Access and writes no Quest or learning state.
_Avoid_: First Light Expedition, tutorial Quest, demo Run

**Run Access**:
The account-bound permission to start a distinct Personal Run. A Personal Run
that has already received access may finish even if later access changes.
Class Play authority follows Classroom Run Grant and Classroom Membership
rules instead.
_Avoid_: Subscription, play token, energy

**Run Grant**:
The durable authorization for one Explorer account and one stable Run
identifier. Repeating the same request returns the same Grant.
_Avoid_: Ticket, charge, temporary entitlement

**Lifetime Membership**:
Permanent Run Access attached to one Clerk identity after one verified $5.99
USD purchase. It has no renewal and changes no gameplay rule.
_Avoid_: Subscription, plan, premium power

**Quest Level**:
The learning tier chosen before a Quest. It sets Question complexity and the
overall Labyrinth challenge range across all twenty Labyrinths.
_Avoid_: Grade, mode, Labyrinth level

**Quest**:
One progression through twenty increasingly difficult Labyrinths at a selected
Quest Level and immutable Learning Deck revision.
_Avoid_: Campaign, map pack, twenty-level Run

**Learning Deck**:
One of four versioned reviewed preferred learning-objective mixes chosen for a
Quest: Mixed Trail, Number Trail, Word Trail, or Nature Trail. When unique
focused Questions are exhausted, it truthfully falls back to unused Mixed Trail
Questions at the same Quest Level and Difficulty Band.
_Avoid_: Trail Deck, custom Question pack, strict content silo

**Labyrinth Number**:
The Explorer's current position from 1 through 20 inside a Quest.
_Avoid_: Map number, map level, Quest Level

**Difficulty Band**:
One of five four-Labyrinth steps within a Quest: Foundation, Developing,
Capable, Advanced, or Mastery.
_Avoid_: Grade, Question Level

**Echo Atlas**:
The five-region, twenty-landmark view of the active Quest. It is a projection of
Quest Progress, never owns or changes that progress, and is replaced when a new
Quest begins.
_Avoid_: Level selector, inventory, paid map, historical Quest archive

**Atlas Region**:
One four-Labyrinth stretch of the Echo Atlas that corresponds to a Difficulty
Band and ends at a Gate Warden milestone.
_Avoid_: World, paid zone, chapter pack

**Region Theme**:
The presentation identity of one Atlas Region across Atlas, Labyrinth, Warden,
sound, and Gate Warden staging. It never changes Run rules by itself.
_Avoid_: Gameplay modifier, paid skin, hidden difficulty

**Warden Guild**:
The authored regional appearance shared by Wardens in one Atlas Region.
Universal Patrol, Hunt, Intercept, Lured, and Gate Warden markers remain
authoritative; Guild art changes no geometry, timing, pathfinding, or ability.
_Avoid_: Warden class, regional power, hidden behavior

**Sigil Ceremony**:
The short, skippable presentation after escaping an Atlas Region. It restores
the derived Atlas landmark but creates no currency, inventory, access, or
gameplay reward.
_Avoid_: Loot reveal, progression currency, reward chest

**Trail Twist**:
One of five fixed, authored, versioned gameplay rules, each associated with one
Atlas Region across its four Labyrinths. It adds a readable regional decision
while preserving Question, Hint, Skip, Vitality, score, and Run Access rules.
_Avoid_: Random event, Region Theme, difficulty boost

**Gate Warden**:
One configured Warden reserved at Labyrinths 4, 8, 12, 16, and 20. It seals the
open Gate until defeated through the normal Warden Challenge rules.
_Avoid_: Boss, raid, premium Warden

**Echo**:
A collectible fragment required to unlock the Gate.
_Avoid_: Prize, gem, coin

**Gate**:
The exit tile that becomes usable after every Echo is recovered.
_Avoid_: Destination, goal, finish

**Warden**:
A hostile presence that moves through the labyrinth after the Explorer acts.
_Avoid_: Monster, enemy, ghost

**Warden Challenge**:
A paused confrontation between the Explorer and one Warden. A correct answer
defeats that Warden; a wrong answer removes Vitality and, while Vitality remains,
continues the Challenge with a fresh Question. Losing the final Vitality ends the Run.
_Avoid_: Collision, combat screen, quiz

**Warden Question**:
One short, age-appropriate multiple-choice problem matched to the Quest Level.
It has one unambiguous answer, a free Hint, and a brief explanation.
_Avoid_: Riddle, trivia prompt, AI response

**Reviewed Question Revision**:
One immutable approved version of a Warden Question's wording, choices, answer,
Hint, explanation, metadata, and optional Echo Lens. Editing reviewed content
creates a new revision rather than changing the prior revision in place.
_Avoid_: Mutable Question ID, provider response, generated variant

**Question Skip**:
Replacing the current Warden Question without answering it. The first Question
Skip in each Labyrinth is free; later Question Skips each remove one Vitality.
_Avoid_: Reroll, pass

**Question Hint**:
A short clue that helps with one Warden Question without exposing its answer.
_Avoid_: Pulse, answer reveal

**Echo Lens**:
An optional human-reviewed explanation shown only after an answer or outside a
live Warden Challenge and bound to one exact Reviewed Question Revision. It
never provides a second source of pre-answer help.
_Avoid_: Question Hint, generated explanation, answer reveal

**Warden Mode**:
The readable tactic a Warden currently follows: Patrol, Hunt, Intercept, or the
one-action Lured state created only by a Warden Bell Trail Twist.
_Avoid_: Difficulty level, random behavior, AI state

**Vitality**:
The Explorer's remaining capacity to survive contact with Wardens.
_Avoid_: Hit points, health, lives

**Pulse**:
A limited action that temporarily reveals nearby passages without moving the Explorer.
_Avoid_: Hint, scan, radar

**Fog**:
The unrevealed portion of the labyrinth.
_Avoid_: Hidden cells, darkness, unexplored map

**Run Record**:
A terminal Run kept on the player's device with its Quest Level, Labyrinth
Number, seed, and escape or defeat outcome. Escapes rank by elapsed time, then
Moves. Defeats rank after escapes by Echo progress, then elapsed time and Moves.
_Avoid_: Score, leaderboard entry, account history

**Run Replay**:
A bounded, identity-free, device-local playback of movement and gameplay
outcomes attached to one retained Run Record. It never stores exact selected
answers or synchronizes to cloud storage.
_Avoid_: Replay video, answer transcript, cloud replay library

**Play This Seed**:
Starting a new playable Run from a retained Run Record's seed and compatible
rules. It is normal play, not playback of the original Explorer's actions.
_Avoid_: Run Replay, Watch Trail, restore Run

**Player Profile**:
An authenticated Explorer identity linked to Clerk and stored in the shared
database. It contains one public username and cosmetic color preferences.
_Avoid_: Account record, Run Record, character

**Run Score**:
Points earned inside the current Labyrinth: 100 for each defeated Warden, 50
for each recovered Echo, and 500 for escaping through the Gate. It resets when
a new Labyrinth begins.
_Avoid_: Run Record rank, Quest progress, lifetime points

**Score Entry**:
One authenticated escaped Run submitted to the shared database for one exact
`(Atlas Region, ruleset revision)` partition. The server recalculates its Run
Score from bounded Run facts and accepts a submission only once.
_Avoid_: Run Record, raw client score, account history

**Global Scoreboard**:
The public ranking of each Player Profile's best Score Entry within one exact
`(Atlas Region, ruleset revision)` partition. Higher Run Score ranks first,
followed by later Labyrinth Number, fewer Moves, shorter elapsed time, and
earlier submission.
_Avoid_: Cross-ruleset ranking, Personal Records, lifetime leaderboard, live multiplayer

**Global Max Score**:
The highest Run Score currently present on one exact Region-and-ruleset Global
Scoreboard.
_Avoid_: maximum possible score, personal best

**Quest Continuity**:
Account-bound Quest Progress synchronized only at Labyrinth boundaries. An
active in-progress Run remains on its current device.
_Avoid_: live multiplayer sync, active Run cloud sync

**Active Run Recovery**:
The same-device restoration of one non-terminal Run from temporary local
recovery data. Time away never counts, the recovered Run opens paused, and
recovery ends when the Run escapes, is defeated, or is explicitly restarted.
Its player-facing label is **Campfire Resume**.
_Avoid_: Cloud Run Continuity, cross-device resume, abandoned-Run history

**Offline Run Continuity**:
The device-local continuation of one exact, previously server-authorized Run
under pinned rules and a signed, device-bound Offline Continuity Receipt while
the network is unavailable, plus one preselected fixed Lantern Trail. Its
player action is **Continue Offline**.
_Avoid_: Pocket Expedition, offline admission, new offline Run, offline entitlement, offline Class Play

**Offline Verification Package**:
The bounded device-local receipt, pinned reviewed content identity, and Run
Action Log v2 retained only while one offline Run awaits replay verification.
It is deleted after accepted replay or terminal rejection and is not Run Replay
history.
_Avoid_: answer history, cloud queue, replay library

**Pinned Offline Cache**:
One versioned service-worker cache selected by an Offline Continuity Receipt.
It may be staged for a newer version, but it cannot activate, serve the active
Run, or evict its assets before terminal state and durable verification handoff.
_Avoid_: permanent app freeze, account-shared cache, offline entitlement

**Quest ID**:
The opaque identifier for one intentional twenty-Labyrinth Quest. It lets
Quest Continuity distinguish two Quests at the same Quest Level.
_Avoid_: Run ID, seed, account ID

**Quest Revision**:
The server-issued optimistic version of one Cloud Quest Progress record.
_Avoid_: Labyrinth Number, schema version, save count

**Quest Conflict**:
A local and cloud Quest with different Quest IDs. The Explorer must explicitly
choose which Quest to continue; neither record is silently overwritten.
_Avoid_: automatic merge, newest-wins replacement

**Lantern Journal**:
A clearable learning view projected from bounded, reviewed Question outcomes
during play.
_Avoid_: gradebook, diagnosis, permanent student record

**Practice Lantern**:
One optional, unscored reviewed Question that revisits a learning objective
without a Warden, Vitality cost, timer, or Quest consequence.
_Avoid_: remediation, punishment, bonus score

**Lantern Trail**:
An optional unscored fixed sequence of three distinct Practice Lanterns for one
learning objective, followed by up to two optional Questions for more practice.
Outcomes change feedback, never hidden sequence or difficulty, and unfinished
Trail position exists only in the current tab.
_Avoid_: Mastery test, assignment, adaptive diagnosis, Quest

**Question Narration**:
The opt-in feature exposed through the **Read Aloud** player control. It speaks
the exact visible Reviewed Question Revision content through a locally supplied
voice at the Explorer's request, without remote narration, voice input, or
judging reading ability.
_Avoid_: Read With Me, remote voice, voice answer, speech recognition, reading tutor

**Explorer Access Settings**:
Presentation preferences that improve Fog, maze-mark, Question, or motion
readability without changing geometry, timing, rules, or score. They follow a
signed-in Explorer across devices and remain device-bound for guests.
_Avoid_: difficulty settings, gameplay assist

**Revealed Path Compass**:
The presentation-only accessibility feature labeled **Trail Compass** for
players. It provides a complete keyboard and screen-reader gameplay path through
the same Quest rules by describing the current tile, legal revealed exits,
revealed entities, and regional Trail Twist state without exposing Fog-hidden
state.
_Avoid_: Echo Sonar, Pulse, maze solver, hidden-state scan, simplified mode

**Classroom**:
A Clerk-backed learning group in which one or more Teachers can invite Students
and view privacy-minimized learning progress.
_Avoid_: Organization, tenant, school account

**Classroom Membership**:
The association between one Explorer and one Classroom, with either the Teacher
or Student role.
_Avoid_: Global role, account role, subscription

**Teacher**:
An Explorer whose Classroom Membership permits invitations and aggregate
learning-progress views for that Classroom.
_Avoid_: Admin, moderator, account owner

**Student**:
An Explorer whose Classroom Membership permits class-scoped play but never
another Explorer's learning-progress view.
_Avoid_: Child account, player role, member

**Class Play**:
Quest Progress and Lantern Journal outcomes associated with one Classroom,
separate from the Explorer's Personal Play.
_Avoid_: School mode, multiplayer, shared Quest

**Class Expedition**:
A Teacher assignment of one Quest Level, one Learning Deck revision, and one
four-Labyrinth Atlas Region ending at its Gate Warden. Each Student completes
an independent Class Play copy.
_Avoid_: Shared Quest, full-Quest assignment, public class race

**Class Expedition License**:
One non-recurring Teacher- or school-sponsored purchase that funds Classroom
Run Grants for one Class Expedition for 30 assigned Students. One-time
extensions add 5 seats each.
_Avoid_: Subscription, reusable credit pack, Student purchase, gameplay power

**Classroom Question Budget**:
The per-Explorer `question.fetch` allowance used when any signed-in Explorer
requests a Warden Question. It prevents one shared network address from becoming
a shared limit while keeping anonymous requests address-bound.
_Avoid_: Classroom quota, shared school allowance, Question entitlement

**Classroom Run Grant**:
The Classroom-sponsored authorization for one Student, one Class Expedition,
and one stable Run identifier while authoritative Classroom Membership remains
active. It grants assigned Class Play access only and never changes Personal
Play allowance or gameplay rules.
_Avoid_: Student purchase, Lifetime Membership, gameplay credit, shared token

**Verified Classroom Domain**:
One lower-case school email domain registered to a Classroom by a Teacher whose
verified primary Clerk email uses that same domain. Public email providers
cannot become Verified Classroom Domains, and one domain belongs to at most one
Classroom.
_Avoid_: SSO connection, email allowlist, organization claim

**Domain Auto-Join**:
The asynchronous request to add an Explorer with a verified primary email on a
Verified Classroom Domain to the matching Clerk Organization as a Student.
Classroom Membership remains absent until Clerk's Membership webhook reaches the
authoritative database.
_Avoid_: automatic database grant, domain login, implicit Teacher role

**Capstone Question**:
One reviewed, Quest-Level-, Difficulty-Band-, and Learning-Deck-matched Warden
Question reserved for a Gate Warden Challenge. It changes the milestone's
content emphasis, never its answer, Hint, Skip, Vitality, score, or Quest-wide
uniqueness rules.
_Avoid_: Boss Question, bonus Question, generated finale

**Personal Play**:
Quest Progress and Lantern Journal outcomes that belong only to the Explorer
and are not associated with a Classroom.
_Avoid_: Guest play, consumer mode, solo account

**Daily Shared Labyrinth**:
One optional date-derived deterministic Run that is separate from the active
Quest, uses Classic Rules without a Trail Twist, and follows a reviewed
Question order shared by every Explorer for that date.
_Avoid_: ranked tournament, streak, daily reward

**Run Action Log**:
A bounded, versioned sequence of player actions and cumulative Run time needed
to reproduce state-changing gameplay from a trusted Run contract.
_Avoid_: event stream, replay video, analytics log

**Verified Run**:
A terminal Run reconstructed by the server from a trusted seed, allowed
configuration, trusted Question sequence, and a valid Run Action Log. Its
outcome and score facts are derived by replay rather than accepted from the
browser.
_Avoid_: trusted client score, anti-cheat score, server-hosted Run

**Verified Daily Entry**:
One authenticated Explorer's best escaped Verified Run for one canonical UTC
Daily Shared Labyrinth date.
_Avoid_: Daily Personal Best, Score Entry, streak

**Verified Daily Board**:
The public bounded ranking of Verified Daily Entries for the current UTC Daily
Shared Labyrinth. Higher Run Score ranks first, followed by fewer Moves and
earlier server verification.
_Avoid_: Global Scoreboard, Daily reward, tournament

**Daily Trail Constellation**:
The post-escape privacy-thresholded projection of aggregate route density from
each signed-in Explorer's first verified escape for one Daily Shared Labyrinth.
It never contains or exposes a personal trail.
_Avoid_: route history, individual replay, live player map, reward
