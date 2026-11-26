# Adventure game properties for Echo Maze
Date: 2026-11-25

## Question

What design properties make a browser maze game a good adventure game? Which of these properties fit a deterministic, short-session, replay-verified game such as Echo Maze?
This note uses only a fixed set of collected claims, and each claim sentence cites its source. Each "Fit" line is an Echo Maze analysis, not a source claim.

## Summary

- Curiosity grows from visible information gaps, and walls that block sight turn the map into a record of player knowledge [1](https://dl.digra.org/index.php/dl/article/view/793) [2](https://journal.stuffwithstuff.com/2015/09/07/what-the-hero-sees).
- Route choice and optional treasure under a threat that rises add risk and reward without new rules [6](https://gamedeveloper.com/business/-i-spelunky-i-it-s-all-right-to-be-mean) [7](https://www.gamedeveloper.com/disciplines/road-to-the-igf-mega-crit-games-i-slay-the-spire-i-).
- Telegraphed threats and plain numbers for danger make each loss readable and self-caused [10](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-) [12](https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Monsters.c).
- A mastery curve works best when each mechanic is a skill atom that a level introduces, develops, twists, and concludes [14](https://www.gamedeveloper.com/design/the-chemistry-of-game-design) [15](https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design).
- Short sessions keep the time cost of failure low, and exploration can act as the resource clock [17](https://gamedeveloper.com/game-platforms/road-to-the-igf-the-quick-burst-roguelike-fun-of-i-desktop-dungeons-i-) [18](https://jesperjuul.net/text/losttime/).
- Players enjoy failure that they blame on themselves, and generated necessary content must always be solvable [20](https://jesperjuul.net/text/fearoffailing/) [21](http://pcgbook.com/chapter01.pdf).
- One shared daily seed with one ranked attempt creates a ritual and a social layer [25](https://gutefabrik.com/redux-spelunky-glory-videogame-rituals-and-nifflas-miracle-run/) [26](https://techcrunch.com/?p=2256733).
- Deterministic replay holds only with a pinned build, so Echo Maze must version its rules and generator [28](https://gafferongames.com/post/floating_point_determinism/).

## Exploration and fog

- Curiosity acts like a preference for uncertainty, and it drives players to explore, try things, and ask questions [1](https://dl.digra.org/index.php/dl/article/view/793).
- A designer raises curiosity when the game creates information gaps or makes the gaps that already exist more visible [1](https://dl.digra.org/index.php/dl/article/view/793).
- Fit: Fog already creates the gap. A visible Fog frontier and Echo or Gate cues make the gap salient, with no change to seeded generation or replay.
- Walls must block the hero's view, because a fully visible map at entry removes the joy of exploration [2](https://journal.stuffwithstuff.com/2015/09/07/what-the-hero-sees).
- The map fills in one piece at a time, so it shows the growth of player knowledge [2](https://journal.stuffwithstuff.com/2015/09/07/what-the-hero-sees).
- Fit: A field-of-view function of position and seed is deterministic and cheap to replay on the server. The gradual reveal is the core loop of a short Labyrinth.
- The Crawl manual says the interface should automate tedious but necessary chores, such as long travel, exploration, and notes [3](https://raw.githubusercontent.com/crawl/crawl/master/crawl-ref/docs/crawl_manual.rst).
- Crawl auto-explore saves real time, but it does not choose the best route [3](https://raw.githubusercontent.com/crawl/crawl/master/crawl-ref/docs/crawl_manual.rst).
- The Crawl map shows explored tiles that are out of view in dark grey [3](https://raw.githubusercontent.com/crawl/crawl/master/crawl-ref/docs/crawl_manual.rst).
- Fit (partial): A dimmed layer of remembered tiles helps the player read the map. Auto-explore does not fit, because in a minutes-long maze the exploration is the play and the replayed move list is the score.
- Josh Ge designed a Cogmind map where a hidden entrance opens as it comes into view [4](https://www.gamedeveloper.com/design/complete-level-design-processes-shaping-a-cogmind-experience).
- A level-feeling message stops a full-level search for an entrance that may not exist [4](https://www.gamedeveloper.com/design/complete-level-design-processes-shaping-a-cogmind-experience).
- Both first routes in that map lead to valuable content [4](https://www.gamedeveloper.com/design/complete-level-design-processes-shaping-a-cogmind-experience).
- Ge uses field-of-view measurements to test how much a player reveals from a given position [4](https://www.gamedeveloper.com/design/complete-level-design-processes-shaping-a-cogmind-experience).
- Fit: Echo or Gate direction cues, branches that each hold value, and a reveal count per tile all come from the seed. The team can measure them offline for each Daily Labyrinth.
- In NetHack, an agent under fog needs about 250 to 360 actions to visit all rooms, but a route on the known map needs about 101 [5](https://arxiv.org/html/1711.03087).
- Complete coverage brings diminishing returns [5](https://arxiv.org/html/1711.03087).
- Random search for secret doors, which costs turns, makes the effect larger [5](https://arxiv.org/html/1711.03087).
- Fit (partial): The ratio of the fog route to the known-map optimum is a useful seeded difficulty metric, as an inference. Random secret search does not fit a deterministic game. A full-clear objective adds tedium to a short session.

## Risk and reward

- Spelunky rewards bold players with larger payoffs and cautious players with slower, steadier gains [6](https://gamedeveloper.com/business/-i-spelunky-i-it-s-all-right-to-be-mean).
- Spelunky summons a near-unavoidable ghost if the player stays in a level too long [6](https://gamedeveloper.com/business/-i-spelunky-i-it-s-all-right-to-be-mean).
- Spelunky announces special level conditions up front, so hazards feel like known challenges and not sudden unfair twists [6](https://gamedeveloper.com/business/-i-spelunky-i-it-s-all-right-to-be-mean).
- Fit (partial): Optional Echoes against a threat that grows suit short Labyrinths. The trigger must count Moves or turns, not real time, and the Readout must warn ahead of time.
- Mega Crit say that the branching map, borrowed from FTL, adds risk-reward and planning on top of combat with little extra complexity [7](https://www.gamedeveloper.com/disciplines/road-to-the-igf-mega-crit-games-i-slay-the-spire-i-).
- Players pick paths that match their strategy, so choice gets deeper without new rules [7](https://www.gamedeveloper.com/disciplines/road-to-the-igf-mega-crit-games-i-slay-the-spire-i-).
- Fit: Labyrinth branches and Atlas Region choices can trade a safe route to the Gate against a detour past Wardens for extra Echoes. A fixed seed keeps this fair on Daily leaderboards.
- Darkest Dungeon players stun-locked the last enemy to heal fully and clear stress [8](https://gamesbeat.com/darkest-dungeon-designers-really-arent-sadists-were-realists/).
- This tactic drained the risk-and-reward tension that the designers consider the core of the game [8](https://gamesbeat.com/darkest-dungeon-designers-really-arent-sadists-were-realists/).
- The designers added a thematic rule that heroes dislike needlessly prolonged combat, plus a stun-recovery buff, instead of a ban on the tactic [8](https://gamesbeat.com/darkest-dungeon-designers-really-arent-sadists-were-realists/).
- Fit (partial): Echo Maze needs a stall counter against safe loops, such as a wait for a Patrol to pass. The counter must count Moves or Warden actions, not wall-clock time.
- The Into the Breach designers found that a threat aimed only at the mechs was trivial, because the player could step away [9](https://gamedeveloper.com/design/reimagining-failure-in-strategy-game-design-in-i-into-the-breach-i-).
- Real tension came when cities, mechs, and side objectives competed for protection [9](https://gamedeveloper.com/design/reimagining-failure-in-strategy-game-design-in-i-into-the-breach-i-).
- Maps also let the player move enemies, because an enemy that the player cannot move becomes unstoppable [9](https://gamedeveloper.com/design/reimagining-failure-in-strategy-game-design-in-i-into-the-breach-i-).
- Fit: A Warden threat works best when it guards an Echo or the Gate route, not an empty corridor. Warden Bell lures let the Explorer reposition a Warden.

## Readable threats and telegraphing

- Subset Games telegraph every enemy attack one turn ahead and use less randomness than in FTL, so the game plays like a puzzle [10](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-).
- Player attacks in Into the Breach have no random chance [10](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-).
- The designers want each death to feel like the player's own fault, with a clear cause so the player can improve [10](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-).
- Fit: Wardens already move after the Explorer acts and show a readable Warden Mode. The game can show the next tile of each visible Warden.
- Fit caveat: Fog limits this telegraph to Wardens that the Explorer can see now. A replayable run lets the player see exactly why a hit happened.
- Playtesters were confused about which unit caused which threat, and several sentences of weapon text did not help them [11](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-).
- The team cut mechanics that they could not show clearly [11](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-).
- The team replaced text tooltips with short animated demonstrations of each effect [11](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-).
- Fit: Each Trail Twist and each Warden Mode marker needs a short visual preview of its effect. A twist that the board cannot show clearly is a cut candidate.
- Brogue monster text states the chance to hit, the typical hit as a percent of current health, and the worst-case number of hits that could kill [12](https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Monsters.c).
- This text turns a risky engagement into an informed bet instead of a guess [12](https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Monsters.c).
- Fit: A wrong answer in a Warden Challenge has a deterministic Vitality cost. The game can state before contact how many wrong answers the Explorer can survive.

## Progression and mastery curve

- Chen argues that a single, narrow, static difficulty keeps only the typical player in flow and loses both novices and experts [13](https://khoury.northeastern.edu/~lieber/courses/csu670/f08/materials/p31-chen-flow-in-games.pdf).
- His fix offers adaptive choices inside the core activity, so the player picks a challenge level without menus that break concentration [13](https://khoury.northeastern.edu/~lieber/courses/csu670/f08/materials/p31-chen-flow-in-games.pdf).
- Fit: A shared seed cannot adapt to each player. In-run choices still let each Explorer set a risk level: optional Echoes, Pulse spend, and a Warden answered or avoided.
- Cook models play as skill atoms, and each atom is a loop of action, simulation, feedback, and an updated mental model [14](https://www.gamedeveloper.com/design/the-chemistry-of-game-design).
- Skill atoms link into a chain, where later skills depend on mastery of earlier ones [14](https://www.gamedeveloper.com/design/the-chemistry-of-game-design).
- If an early atom burns out, every skill that depends on it becomes unreachable [14](https://www.gamedeveloper.com/design/the-chemistry-of-game-design).
- Logs of each atom's state across playtests show where players no longer learn and quit [14](https://www.gamedeveloper.com/design/the-chemistry-of-game-design).
- Fit: Each Trail Twist is a skill atom that depends on movement, Fog, and Pulse. Verified server replays can log atom use and burnout per Region.
- Fit caveat: The source does not state "one mechanic at a time". That order is an inference from its dependency model.
- Hayashida says Super Mario 3D Land levels follow a kishotenketsu structure in four steps [15](https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design).
- The player learns one mechanic, meets a harder setup with it, meets a twist that forces new thought, and then shows mastery [15](https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design).
- Fit: An Atlas Region can carry one Trail Twist through the four steps across its Labyrinths. One example is a safe Windway, then a Windway near the Gate, then a Windway with a Warden patrol. The interview does not discuss level length, so the match to minute-long sessions is an inference.
- Hunicke and Chapman's Hamlet system watches in-game statistics and predicts when the player struggles, such as repeated resource shortfalls in an FPS [16](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf).
- Hamlet then quietly changes the supply of items such as health [16](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf).
- The authors aim to intervene just enough to keep the system stable and predictable [16](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf).
- The authors note that DDA takes control away from the designer [16](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf).
- Fit (partial): Adaptation from recorded inputs still replays deterministically. In-run adjustment makes shared-seed Daily scores incomparable, so it suits only between-run Quest choices, such as the next seed or Region.

## Short-session pacing

- Desktop Dungeons came from a wish to play Crawl-style roguelikes in ten-minute sessions on a single screen [17](https://gamedeveloper.com/game-platforms/road-to-the-igf-the-quick-burst-roguelike-fun-of-i-desktop-dungeons-i-).
- Game time does not advance normally there, so the designers tied regeneration to exploration [17](https://gamedeveloper.com/game-platforms/road-to-the-igf-the-quick-burst-roguelike-fun-of-i-desktop-dungeons-i-).
- The designers also removed choices that had an obvious answer [17](https://gamedeveloper.com/game-platforms/road-to-the-igf-the-quick-burst-roguelike-fun-of-i-desktop-dungeons-i-).
- Fit: A reward for each newly revealed tile, such as Vitality or Pulse recovery, is a deterministic function of reveal order. The server can replay it, and each step into Fog becomes a real choice.
- Juul proposes to measure the punishment of a failure by the play time it costs, not by the number of failures [18](https://jesperjuul.net/text/losttime/).
- A game with many failures can still feel fair when each setback is small [18](https://jesperjuul.net/text/losttime/).
- Replay of an identical section punishes more than replay of a varied one [18](https://jesperjuul.net/text/losttime/).
- Fit (partial): Minutes-long Labyrinths keep the time lost per failure low. A fixed seed makes a Quest retry replay an identical layout, which Juul counts as the kind that punishes more.
- Wardle aimed for about three minutes of play a day, after the once-daily NYT puzzles [19](https://www.gamedeveloper.com/marketing/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success).
- The emoji grid lets players share how an attempt went without the answer [19](https://www.gamedeveloper.com/marketing/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success).
- The once-daily limit created a social layer around the results [19](https://www.gamedeveloper.com/marketing/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success).
- Fit: A Labyrinth lasts minutes. A share card can show outcome shape (Echoes, Vitality left, Pulses used, turns) without the route, which matches the Wordle pattern.

## Fairness

- In Juul's survey of 85 players, those who blamed their own mistakes rated the game significantly higher than those who blamed difficulty (p<0.016) [20](https://jesperjuul.net/text/fearoffailing/).
- The survey used a custom prototype, and Juul says that the small sample needs wider tests [20](https://jesperjuul.net/text/fearoffailing/).
- Players who lost some lives and then finished rated the game highest, and players who never failed rated it lower [20](https://jesperjuul.net/text/fearoffailing/).
- This second result was only a trend (p=0.06) [20](https://jesperjuul.net/text/fearoffailing/).
- Juul concludes that players prefer to feel responsible for failure, and that failure adds depth because it makes players rethink strategy [20](https://jesperjuul.net/text/fearoffailing/).
- Fit: Seeded runs remove luck as an excuse, so a Daily defeat traces to the player's own choices. A typical clear that costs some Vitality matches the highest-rated pattern.
- PCG research separates necessary content, which the player must pass to finish, from optional content, which can be wrong without harm [21](http://pcgbook.com/chapter01.pdf).
- Necessary content must always be correct, and a dungeon with no entrance or exit is a catastrophic failure [21](http://pcgbook.com/chapter01.pdf).
- Playability is a core requirement of any generated level [21](http://pcgbook.com/chapter01.pdf).
- Fit: The Labyrinth layout, the Gate, required Echoes, and Windway hops are necessary content. Each seed must pass a hard reachability check, with no soft-lock.
- Dormans generates the mission first, as a directed graph of tasks in logical order, and then generates a space to hold it [22](https://pcgworkshop.com/archive/dormans2010adventures.pdf).
- The space grammar keeps a reference to each mission symbol, so keys and items go behind the specified tests or locks [22](https://pcgworkshop.com/archive/dormans2010adventures.pdf).
- Fit: Tide Doors, Echo Bridges, and Warden Bells act like locks and keys. Mission-first placement keeps each objective reachable by construction, not by a later repair pass.
- Spelunky lays a 4x4 room grid and first walks a random solution path from a top-row start room to a bottom-row exit [23](https://tinysubversions.com/spelunkyGen/).
- Each room on the path has openings that match its neighbors [23](https://tinysubversions.com/spelunkyGen/).
- Rooms off the path get random fill with no exit guarantee, so variety stays out of the critical route [23](https://tinysubversions.com/spelunkyGen/).
- Fit: Carve a guaranteed Explorer route from the start to the Gate first. Add dead ends, Fog pockets, and Trail Twists only off that spine, or check that they keep it intact.
- Smith and Whitehead evaluate a level generator from many generated levels, and they score each level on emergent metrics such as linearity and a leniency proxy [24](https://www.pcgworkshop.com/archive/smith2010analyzing.pdf).
- They plot the distribution, and they do not judge a generator by speed or count [24](https://www.pcgworkshop.com/archive/smith2010analyzing.pdf).
- This method exposes hidden biases and gaps in the generator [24](https://www.pcgworkshop.com/archive/smith2010analyzing.pdf).
- The authors do not treat their metrics as a true difficulty score, and they name difficulty and pacing as future metrics [24](https://www.pcgworkshop.com/archive/smith2010analyzing.pdf).
- Fit: Deterministic seeds let the team batch-generate Labyrinths offline. The team can plot path length to the Gate, Warden density, and Fog-hidden hazards, then reject Daily seeds outside the target band.

## Replay value for seeded and daily runs

- Doug Wilson describes a nightly Spelunky ritual, where each player got one official run per evening and practice runs did not count [25](https://gutefabrik.com/redux-spelunky-glory-videogame-rituals-and-nifflas-miracle-run/).
- The single attempt made each run tense and gave players something to look forward to [25](https://gutefabrik.com/redux-spelunky-glory-videogame-rituals-and-nifflas-miracle-run/).
- Wilson says the ritual helped inspire the formal Daily Challenge in the 2013 Steam release [25](https://gutefabrik.com/redux-spelunky-glory-videogame-rituals-and-nifflas-miracle-run/).
- Fit: A deterministic Daily seed with one ranked, replay-verified attempt plus unranked practice matches this ritual. The short Labyrinth makes a daily habit practical. The source is a first-hand player-designer account, not the rationale of Derek Yu.
- Wardle credits the spread of Wordle to one puzzle per day that everybody solves [26](https://techcrunch.com/?p=2256733).
- He says random per-player words, even with a once-a-day limit, would not have grown the same way [26](https://techcrunch.com/?p=2256733).
- He also says the daily limit was a deliberate choice against open-ended engagement [26](https://techcrunch.com/?p=2256733).
- Fit: The Daily run must give each player the same seed, Labyrinth, and Warden questions, so people can compare and talk about one shared puzzle.
- The Slay the Spire Daily Climb uses the same seed for everyone, so players can compare results from identical choices [27](https://slaythespire.wiki.gg/wiki/Weekly_Patch_14_-_Bullet_Time).
- Each daily also combines several rule-bending modifiers, which the developers planned to add to and tune over time [27](https://slaythespire.wiki.gg/wiki/Weekly_Patch_14_-_Bullet_Time).
- Fit (partial): A rotating Trail Twist mix per Daily adds variety. Each modifier combination must pass the solvability check, and the modifier set must be part of the replay-verified seed.
- A generator can build content in one constructive pass, or it can loop generate and test until a candidate passes [21](http://pcgbook.com/chapter01.pdf).
- A random seed controls the generation space, so the same seed always rebuilds the same content [21](http://pcgbook.com/chapter01.pdf).
- Fit: A seeded generate-and-test loop works if the retry counter comes from the seed. The server then re-derives the same accepted Labyrinth at replay time.
- Replay of recorded inputs gives identical results only when the simulation is deterministic [28](https://gafferongames.com/post/floating_point_determinism/).
- Changes to compiler, optimization settings, CPU architecture, or debug versus release builds can break floating-point replays [28](https://gafferongames.com/post/floating_point_determinism/).
- A patched build can fail to play back replays from the original build [28](https://gafferongames.com/post/floating_point_determinism/).
- Fit: Score verification should use integer-only grid logic. Each run should store a rules or generator version, so a later patch does not reject or re-score older Daily runs.

## Fit for a deterministic, short-session, replay-verified game

| Property | Fits | Why |
| --- | --- | --- |
| Curiosity through salient information gaps | Yes | Fog creates the gap, and a frontier and cues need no change to seeded generation. |
| Line of sight with a map that fills in | Yes | Field of view is a deterministic function of position and seed. |
| Exploration chores and readable map memory | Partial | Dimmed remembered tiles fit, but auto-explore removes the play that the replay scores. |
| Exploration as the resource clock | Yes | Rewards from reveal order are deterministic, and the server can replay them. |
| Wayfinding cues and route choices that pay off | Yes | Cues and reveal counts come from the seed, and the team can measure them offline. |
| Fog cost and diminishing returns of full coverage | Partial | The fog-route ratio is a useful metric, but random secret search and full clears do not fit. |
| Push-your-luck under a mounting threat | Partial | The trigger must count Moves, not real time, and the Readout must warn first. |
| Route choice as a risk-reward layer | Yes | A fixed seed keeps branch trade-offs fair on Daily leaderboards. |
| Anti-stall pressure | Partial | A stall counter must count Moves or Warden actions, not wall-clock time. |
| Threats that hit what the player values | Yes | Wardens guard Echoes or the Gate route, and Warden Bells reposition them. |
| Telegraphed threats and readable failure | Yes | Warden moves are deterministic, but Fog limits the telegraph to visible Wardens. |
| Clarity over novelty in threat display | Yes | Each Trail Twist needs a short visual preview, or it is a cut candidate. |
| Quantified danger in plain numbers | Yes | The Vitality cost of a wrong answer is deterministic, so the game can state survivable errors. |
| Flow with difficulty choices in the core activity | Yes | In-run choices set risk with no change to the shared seed. |
| Skill chains and burnout | Yes | Verified replays can log Trail Twist use and burnout per Region. |
| Four-step mechanic arc in one level | Yes | An Atlas Region can carry one Trail Twist through four steps across its Labyrinths. |
| Dynamic difficulty adjustment | Partial | In-run adjustment breaks Daily comparison, so it fits only between Quest runs. |
| Failure cost as time lost | Partial | Short Labyrinths cost little time, but identical Quest retries punish more. |
| Short session and spoiler-free sharing | Yes | A share card shows outcome shape without the route. |
| Self-attributed failure raises enjoyment | Yes | Seeds remove luck, so each Vitality loss traces to player choices. |
| Solvability of necessary content | Yes | Each seed must pass a hard reachability check. |
| Completable-by-construction locks and keys | Yes | Mission-first placement keeps Tide Door and Echo Bridge objectives reachable. |
| Guaranteed solution path plus free filler | Yes | The generator carves the Gate route first and adds twists off the spine. |
| Expressive range analysis | Yes | Seeds allow offline batch audits before each Daily release. |
| One official attempt per day | Yes | One ranked, replay-verified Daily attempt sits beside unranked practice. |
| One shared daily puzzle | Yes | Every player gets the same seed, Labyrinth, and Warden questions. |
| Same daily seed with rotating modifiers | Partial | Each modifier mix must pass the solvability check and sit inside the verified seed. |
| Seeded generate-and-test | Yes | The retry counter comes from the seed, so the server re-derives the Labyrinth. |
| Pinned build for deterministic replay | Yes | Integer grid logic and a stored rules version keep old Daily runs valid. |

## Sources

1. Integrating Curiosity and Uncertainty in Game Design (To, Ali, Kaufman, Hammer; DiGRA/FDG 2016). https://dl.digra.org/index.php/dl/article/view/793
2. What the Hero Sees: Field-of-View for Roguelikes (Bob Nystrom). https://journal.stuffwithstuff.com/2015/09/07/what-the-hero-sees
3. Dungeon Crawl Stone Soup manual (crawl_manual.rst). https://raw.githubusercontent.com/crawl/crawl/master/crawl-ref/docs/crawl_manual.rst
4. Complete Level Design Processes: Shaping a Cogmind Experience (Josh Ge, Grid Sage Games). https://www.gamedeveloper.com/design/complete-level-design-processes-shaping-a-cogmind-experience
5. Exploration in NetHack With Secret Discovery (Campbell and Verbrugge, arXiv 1711.03087). https://arxiv.org/html/1711.03087
6. Spelunky: It's all right to be mean (Leigh Alexander) (secondary). https://gamedeveloper.com/business/-i-spelunky-i-it-s-all-right-to-be-mean
7. Road to the IGF: Mega Crit Games' Slay the Spire. https://www.gamedeveloper.com/disciplines/road-to-the-igf-mega-crit-games-i-slay-the-spire-i-
8. Darkest Dungeon designers really aren't sadists: 'We're realists' (secondary). https://gamesbeat.com/darkest-dungeon-designers-really-arent-sadists-were-realists/
9. Reimagining failure in strategy game design in Into the Breach (secondary). https://gamedeveloper.com/design/reimagining-failure-in-strategy-game-design-in-i-into-the-breach-i-
10. Road to the IGF: Subset Games' Into the Breach (interview with Justin Ma). https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-
11. Into the Breach dev on UI design: sacrifice cool ideas for the sake of clarity every time (secondary). https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-
12. BrogueCE source, src/brogue/Monsters.c, function monsterDetails(). https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Monsters.c
13. Jenova Chen, Flow in Games (and Everything Else), Communications of the ACM 50(4), 2007. https://khoury.northeastern.edu/~lieber/courses/csu670/f08/materials/p31-chen-flow-in-games.pdf
14. Daniel Cook, The Chemistry of Game Design (2007). https://www.gamedeveloper.com/design/the-chemistry-of-game-design
15. The secret to Mario level design (Koichi Hayashida interview). https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design
16. Robin Hunicke and Vernell Chapman, AI for Dynamic Difficulty Adjustment in Games. https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf
17. Road to the IGF: The Quick-Burst Roguelike Fun of Desktop Dungeons (Danny Day and Rodain Joubert). https://gamedeveloper.com/game-platforms/road-to-the-igf-the-quick-burst-roguelike-fun-of-i-desktop-dungeons-i-
18. Jesper Juul, In Search of Lost Time. https://jesperjuul.net/text/losttime/
19. Josh Wardle reflects on the unconventional road to Wordle's success (GDC 2022 coverage) (secondary). https://www.gamedeveloper.com/marketing/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success
20. Jesper Juul, Fear of Failing? The Many Meanings of Difficulty in Video Games (2009). https://jesperjuul.net/text/fearoffailing/
21. Procedural Content Generation in Games, Chapter 1: Introduction (Togelius, Shaker, Nelson). http://pcgbook.com/chapter01.pdf
22. Dormans, Adventures in Level Design: Generating Missions and Spaces for Action Adventure Games (2010). https://pcgworkshop.com/archive/dormans2010adventures.pdf
23. Spelunky Generator Lessons (Darius Kazemi) (secondary). https://tinysubversions.com/spelunkyGen/
24. Gillian Smith and Jim Whitehead, Analyzing the Expressive Range of a Level Generator (PCG Workshop 2010). https://www.pcgworkshop.com/archive/smith2010analyzing.pdf
25. Douglas Wilson, Spelunky, Glory, Videogame Rituals and Nifflas' Miracle Run (Die Gute Fabrik). https://gutefabrik.com/redux-spelunky-glory-videogame-rituals-and-nifflas-miracle-run/
26. TechCrunch interview with Josh Wardle on Wordle. https://techcrunch.com/?p=2256733
27. Weekly Patch 14 - Bullet Time (Slay the Spire Wiki copy of patch notes) (secondary). https://slaythespire.wiki.gg/wiki/Weekly_Patch_14_-_Bullet_Time
28. Glenn Fiedler, Floating Point Determinism (Gaffer On Games). https://gafferongames.com/post/floating_point_determinism/
