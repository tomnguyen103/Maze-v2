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

**Run Access**:
The account-bound permission to start a distinct Run. A Run that has already
received access may finish even if later access changes.
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
The learning tier chosen before a Quest. It sets the curriculum and the overall
Labyrinth challenge range across all twenty Labyrinths.
_Avoid_: Grade, mode, Labyrinth level

**Quest**:
One progression through twenty increasingly difficult Labyrinths at a selected
Quest Level.
_Avoid_: Campaign, map pack, twenty-level Run

**Labyrinth Number**:
The Explorer's current position from 1 through 20 inside a Quest.
_Avoid_: Map number, map level, Quest Level

**Difficulty Band**:
One of five four-Labyrinth steps within a Quest: Foundation, Developing,
Capable, Advanced, or Mastery.
_Avoid_: Grade, Question Level

**Echo Atlas**:
The five-region, twenty-node view of one Quest. It is a projection of Quest
Progress and never owns or changes that progress.
_Avoid_: Level selector, inventory, paid map

**Atlas Region**:
One four-Labyrinth stretch of the Echo Atlas that corresponds to a Difficulty
Band and ends at a Gate Warden milestone.
_Avoid_: World, paid zone, chapter pack

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

**Question Skip**:
Replacing the current Warden Question without answering it. The first Question
Skip in each Labyrinth is free; later Question Skips each remove one Vitality.
_Avoid_: Reroll, pass

**Question Hint**:
A short clue that helps with one Warden Question without exposing its answer.
_Avoid_: Pulse, answer reveal

**Warden Mode**:
The readable tactic a Warden currently follows: Patrol, Hunt, or Intercept.
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
One authenticated escaped Run submitted to the shared database. The server
recalculates its Run Score from bounded Run facts and accepts a submission only
once.
_Avoid_: Run Record, raw client score, account history

**Global Scoreboard**:
The public ranking of each Player Profile's best Score Entry. Higher Run Score
ranks first, followed by later Labyrinth Number, fewer Moves, shorter elapsed
time, and earlier submission.
_Avoid_: Personal Records, lifetime leaderboard, live multiplayer

**Global Max Score**:
The highest Run Score currently present on the Global Scoreboard.
_Avoid_: maximum possible score, personal best

**Quest Continuity**:
Account-bound Quest Progress synchronized only at Labyrinth boundaries. An
active in-progress Run remains on its current device.
_Avoid_: live multiplayer sync, mid-Run resume

**Lantern Journal**:
A clearable learning view projected from bounded, reviewed Question outcomes
during play.
_Avoid_: gradebook, diagnosis, permanent student record

**Practice Lantern**:
One optional, unscored reviewed Question that revisits a learning objective
without a Warden, Vitality cost, timer, or Quest consequence.
_Avoid_: remediation, punishment, bonus score

**Explorer Access Settings**:
Device-local presentation preferences that improve Fog, maze-mark, Question,
or motion readability without changing geometry, timing, rules, or score.
_Avoid_: difficulty settings, gameplay assist

**Daily Shared Labyrinth**:
One optional date-derived deterministic Run that is separate from the active
Quest and uses a reviewed Question order shared by every Explorer for that date.
_Avoid_: ranked tournament, streak, daily reward
