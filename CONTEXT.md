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

**Echo**:
A collectible fragment required to unlock the Gate.
_Avoid_: Prize, gem, coin

**Gate**:
The exit tile that becomes usable after every Echo is recovered.
_Avoid_: Destination, goal, finish

**Warden**:
A hostile presence that moves through the labyrinth after the Explorer acts.
_Avoid_: Monster, enemy, ghost

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
A completed Run kept on the player's device and ranked by elapsed time, then
by Moves.
_Avoid_: Score, leaderboard entry, account history
