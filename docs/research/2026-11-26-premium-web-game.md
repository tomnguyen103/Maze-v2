# Premium web game research for the Echo Maze rebuild
Date: 2026-11-26

## Scope

- This note answers four questions for the premium rebuild of Echo Maze.
- Question 1: What separates a premium browser game from a competent one?
- Question 2: Which rebuild approach fits Echo Maze?
- Question 3: How does the game prove fairness and solvability, and how does the server verify a Run at low cost?
- Question 4: Which rule changes give the largest gain in play quality?
- The note extends `docs/research/2026-11-25-adventure-game-properties.md` and repeats none of its 28 sources. The text names that file "the prior note".
- Repository state: `main` at `bac960e`, with a clean tree.
- The note changes no code, no ADR, and no GLOSSARY term. Each proposed change needs its own spec.

## Method

- Four research passes, one per question, fetch the pages on 2026-11-26. Each external claim cites the page that supports it.
- "(secondary)" marks press coverage of a talk or an interview.
- `[unverified]` marks an external claim that no fetched page confirms.
- "Inference" marks a transfer from another genre or from a source that does not state the claim.
- A "Fit" line and a "Now" line are Echo Maze analysis, not source claims. They take no `[unverified]` mark.
- The same rule covers an uncited Change, Gain, Cost, or Findings line, and an uncited criterion line in Question 2.
- It also covers each list of properties, reasons, conditions, measures, and release items.
- A repository fact cites the repository source, or names a file, an ADR, or an audit finding.
- Audit findings A-01 to A-54 come from `docs/audits/2026-11-25-game-logic-audit.md`. Items L1 to L14 come from the logic plan.
- Sizes use KB = 1024 bytes, the unit of `scripts/check-bundle-budget.mjs`.
- A small model summarises each fetched page for Question 2. Therefore this note paraphrases each statement and quotes none.
- Question 4 uses two scales. Gain: 1 is small, 5 is large. Cost: 1 is cheap, 5 is expensive.
- Question 4 ranks by gain minus cost, and the higher gain breaks a tie. "Partly" marks a finding that a candidate helps but does not close.
- A candidate number in Question 4 is a stable identifier, not a rank.
- One global source list serves the four questions. Each source has one number, in order of first use.

### Input conflicts and their resolution

- Warden behind Fog: the Question 1 input lets the Explorer hear a Warden behind Fog. Question 4 hides each Warden that is out of view. Resolution: the Game restriction on Fog decides. A cue carries only what the rules reveal, and each channel carries the same fact.
- Daily answers: the Question 3 input keeps ranked Daily answers on the server. Question 4 removes the Warden Challenge from the Daily Shared Labyrinth. Resolution: Question 4 decides. The server-side answer measure applies only if a ranked Daily keeps a Warden Question.
- Time in rank: Question 1 uses elapsed time as a rank input, and Question 3 keeps time out of the rank. Resolution: no conflict exists. The device-local Run Record ranks by elapsed time, and the Verified Daily Board does not.
- Unsourced claims: the Question 2 input reads each unnumbered claim as a repository fact. This note marks only an unsourced external claim as `[unverified]`.
- Unused source: the Question 3 input lists a Factorio Wiki page that no claim cites. This note drops it.

## Question 1: What separates a premium browser game from a competent one?

The six aspect names come from the research question.

### Board feel

- A response within 0.1 second makes the player feel direct control of the object. No extra feedback is necessary at that speed [1](https://www.nngroup.com/articles/response-times-3-important-limits/).
- INP measures the time from an interaction to the next painted frame, across the whole visit [2](https://web.dev/articles/inp). A good INP value is 200 ms or less at the 75th percentile [2](https://web.dev/articles/inp).
- Game feel is the tactile sensation of control of a digital object. Good feel is responsive, tight, and deep [3](https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient).
- The engine of a turn-based game never blocks for input [4](https://journal.stuffwithstuff.com/2014/07/15/a-turn-based-game-loop/). The interface gives the next action to the loop, and the loop returns control when none exists [4](https://journal.stuffwithstuff.com/2014/07/15/a-turn-based-game-loop/). A failed action, such as a walk into a wall, costs no turn [4](https://journal.stuffwithstuff.com/2014/07/15/a-turn-based-game-loop/). An alternate action converts the intent, so a walk into a door opens the door [4](https://journal.stuffwithstuff.com/2014/07/15/a-turn-based-game-loop/).
- A sharp canvas multiplies its size by `devicePixelRatio` and scales the context [5](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas). Integer coordinates prevent sub-pixel anti-alias work [5](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas). Layered canvases let the game redraw only the layer that changes. An offscreen canvas holds each image that repeats [5](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas).
- A quality browser game works across aspect ratios, which include portrait on a phone [6](https://poki.com/blog/what-makes-high-quality-browser-game). Its controls stay large and readable for mouse, keyboard, and touch [6](https://poki.com/blog/what-makes-high-quality-browser-game).
- Fit: the device-local Run Record ranks by elapsed time, then by Moves. A Move animation that blocks the next input costs rank. The Explorer must accept the next Move at once, and a blocked Move must cost no Move. Fog, Labyrinth, and Explorer suit three canvas layers.

### Feedback

- Polish is one of six parts of game feel. The others are input, response, context, metaphor, and rules [3](https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient).
- A study compares two versions of one tile game with identical rules [7](https://www.jesperjuul.net/text/juiciness.pdf). The version with more juice gets a higher quality score, but the difference is not significant [7](https://www.jesperjuul.net/text/juiciness.pdf). The same study finds no gain in ease of use [7](https://www.jesperjuul.net/text/juiciness.pdf). The mean score of the players is lower with juice, also not significant [7](https://www.jesperjuul.net/text/juiciness.pdf).
- The authors propose that redundant feedback can raise cognitive load. They ask for a larger study [7](https://www.jesperjuul.net/text/juiciness.pdf).
- A study of Breakout with 38 participants shows that vibration feedback improves player experience scores over no vibration [8](https://uwaterloo.ca/haptic-experience-lab/projects/juicy-haptic-design-vibrotactile-embellishments-can-improve). In that study, low haptic juice and high haptic juice differ only on expressivity [8](https://uwaterloo.ca/haptic-experience-lab/projects/juicy-haptic-design-vibrotactile-embellishments-can-improve).
- Essential information must not come from sound alone or from a fixed colour alone [9](https://gameaccessibilityguidelines.com/basic/).
- A pleasant effect on each click or movement is one mark of polished presentation on a web platform [6](https://poki.com/blog/what-makes-high-quality-browser-game).
- Fit: each Move, blocked Move, Echo, Pulse, Vitality change, and Gate needs one distinct, short cue. Each cue must state a rule result, not decorate it. A small amount of embellishment is enough. This is an inference from [7](https://www.jesperjuul.net/text/juiciness.pdf) and [8](https://uwaterloo.ca/haptic-experience-lab/projects/juicy-haptic-design-vibrotactile-embellishments-can-improve). Quiet Expedition keeps the information and removes the embellishment. Presentation never changes rules, timing, or the Run Action Log.

### Motion

- Most interface animations last between 100 and 500 ms [10](https://www.nngroup.com/articles/animation-duration/). Simple feedback needs about 100 ms, and a large screen change needs 200 to 300 ms [10](https://www.nngroup.com/articles/animation-duration/). An animation that repeats often must be shorter and more subtle. At 500 ms an animation starts to feel like a drag [10](https://www.nngroup.com/articles/animation-duration/). Ease-out motion feels responsive. Linear motion looks unnatural [10](https://www.nngroup.com/articles/animation-duration/).
- `transform` and `opacity` are the cheap properties to animate [11](https://web.dev/articles/animations-guide). Properties that cause layout or paint, such as `top` and `left`, are expensive [11](https://web.dev/articles/animations-guide).
- `requestAnimationFrame` is the base of the main loop [12](https://developer.mozilla.org/en-US/docs/Games/Anatomy). The simulation updates at a constant tick, and the draw runs as often as the device permits [12](https://developer.mozilla.org/en-US/docs/Games/Anatomy).
- With `prefers-reduced-motion: reduce`, the interface removes, reduces, or replaces motion. A dissolve can replace a pulse [13](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).
- WCAG 2.3.3 requires a way to turn off motion that an interaction triggers [14](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html). Colour and opacity changes count only if they change perceived size, shape, or position [14](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
- Content must not flash more than three times in one second [15](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html).
- Fit: a Move between two cells needs about 100 ms with ease-out. A change of Labyrinth or screen needs at most 300 ms. Explorer Access Settings and Quiet Expedition own the reduced path, with fades in place of slides, shakes, and zooms. A Warden hit must not flash more than three times per second. The Sigil Ceremony stays short, and the Explorer can skip it.

### Audio

- A browser creates an `AudioContext` in a suspended state when no user gesture exists [16](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices). The game creates or resumes the context inside a gesture [16](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).
- The game starts sound from the first click or tap and primes the audio then [17](https://developer.mozilla.org/en-US/docs/Games/Techniques/Audio_for_Web_Games). An audio sprite puts many short sounds in one file [17](https://developer.mozilla.org/en-US/docs/Games/Techniques/Audio_for_Web_Games). The Web Audio API gives exact timing, so a sound occurs with its event [17](https://developer.mozilla.org/en-US/docs/Games/Techniques/Audio_for_Web_Games). Music can consist of synchronised loops that enter and leave with the game state [17](https://developer.mozilla.org/en-US/docs/Games/Techniques/Audio_for_Web_Games).
- Audio that plays automatically for more than 3 seconds needs a stop control [18](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html). A volume control that is independent of the system volume also meets that need [18](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html).
- Separate volume or mute controls for effects and music are a basic guideline [9](https://gameaccessibilityguidelines.com/basic/).
- A sound toggle uses `role="switch"` and a clear label [16](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).
- In Cogmind, sound tells the player about events outside the field of view [19](https://gamedeveloper.com/audio/audio-accessibility-features-for-roguelikes). A visible marker and an optional text log show the same events [19](https://gamedeveloper.com/audio/audio-accessibility-features-for-roguelikes).
- A hidden tab must pause its media. The game resumes the media only if it played before [20](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
- Fit: the first Move or the start control unlocks audio. One sprite file holds the Move, wall, Echo, Pulse, Warden, and Gate sounds. A Warden cue carries only what the rules reveal. Fog hides a Warden that is out of view (Question 4, candidate 1). A sound cue and a visible cue for one Warden event carry the same fact, and the Trail Compass states it too. Region Theme supplies the sound set. Effects and music each have a persistent switch, and both stop when the tab hides.

### Onboarding

- George Fan blends the tutorial into play and does not label it (secondary) [21](https://gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan). The player learns by action, not by text (secondary) [21](https://gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan). He shows at most eight words on screen at one time (secondary) [21](https://gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan). He introduces one mechanic at a time (secondary) [21](https://gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan).
- Adaptive messages appear only for a player who does the wrong thing (secondary) [21](https://gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan). Visual design shows the function of each object (secondary) [21](https://gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan).
- A study of more than 45,000 players tests eight tutorial designs in three games [22](https://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf). Tutorials help only in the most complex game. In the two simpler games, the effect of a tutorial is negligible [22](https://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf). Context-sensitive instructions raise play time by 16% and progress by 40% in the complex game only [22](https://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf). Restricted freedom gives no measured gain [22](https://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf).
- Zach Gage builds each game as a sandbox where a newcomer feels safe to experiment (secondary) [23](https://www.gamedeveloper.com/design/puzzmo-co-creator-zach-gage-on-building-newspaper-games-that-can-last-forever). Help must have a form that the newcomer expects (secondary) [23](https://www.gamedeveloper.com/design/puzzmo-co-creator-zach-gage-on-building-newspaper-games-that-can-last-forever).
- Cannon Clash has no start menu and introduces its systems gradually [24](https://poki.com/blog/how-we-made-cannon-clash-load-fast-and-boosted-conversion). The team removes the intro animation after playtests [24](https://poki.com/blog/how-we-made-cannon-clash-load-fast-and-boosted-conversion).
- Fit: the first Labyrinth teaches by play, with no barrier before the first Move. Prompts stay at eight words or fewer and appear when the Explorer first needs them. A hint appears only after a repeated mistake. The First Light Tutorial stays optional and replayable. The Tactics Lab gives unscored drills for safe experiment.

### Session shape

- A loop repeats: the player acts, the system responds, and the player updates a mental model [25](https://lostgarden.com/2012/04/30/loops-and-arcs/).
- A loop gains value with repetition and builds mastery [25](https://lostgarden.com/2012/04/30/loops-and-arcs/). An arc delivers its content once and then loses value [25](https://lostgarden.com/2012/04/30/loops-and-arcs/). A product that depends on arcs needs new content without end [25](https://lostgarden.com/2012/04/30/loops-and-arcs/).
- Gage says that about ten hours of fun across one year of daily play is enough (secondary) [23](https://www.gamedeveloper.com/design/puzzmo-co-creator-zach-gage-on-building-newspaper-games-that-can-last-forever). He rejects prototypes that are fun only in long sessions (secondary) [23](https://www.gamedeveloper.com/design/puzzmo-co-creator-zach-gage-on-building-newspaper-games-that-can-last-forever).
- A web player is uncommitted in the first seconds. Core loops must suit short sessions [6](https://poki.com/blog/what-makes-high-quality-browser-game). One game with a 40 MB build has a 29.5 s median load, and 50% of the players who click start to play [6](https://poki.com/blog/what-makes-high-quality-browser-game). A 6 MB build loads in 3.7 s, and 72% start [6](https://poki.com/blog/what-makes-high-quality-browser-game).
- Cannon Clash downloads 2.4 MB before play and converts 81% of clicks to play [24](https://poki.com/blog/how-we-made-cannon-clash-load-fast-and-boosted-conversion). Assets that are not essential load after the start [24](https://poki.com/blog/how-we-made-cannon-clash-load-fast-and-boosted-conversion).
- A wait longer than 10 seconds exceeds the limit of attention and needs a progress indicator [1](https://www.nngroup.com/articles/response-times-3-important-limits/).
- Most browsers stop `requestAnimationFrame` callbacks in a background tab [12](https://developer.mozilla.org/en-US/docs/Games/Anatomy) [20](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
- One option treats the gap as a pause [12](https://developer.mozilla.org/en-US/docs/Games/Anatomy).
- Fit: a Run is one tight loop of a few minutes. The Daily Shared Labyrinth is the optional slower loop, one Run per date. The Sigil Ceremony is a short arc. The first download stays small, and the first Move comes within seconds. A hidden tab pauses the Run. Active Run Recovery opens paused, and time away never counts.

### Required properties

The Echo Maze rebuild must have these twelve properties.

1. Each input paints a result within 100 ms, and INP stays at 200 ms or less [1](https://www.nngroup.com/articles/response-times-3-important-limits/) [2](https://web.dev/articles/inp).
2. A Move animation never blocks the next input. The Run Record rank by elapsed time, the loop in [4](https://journal.stuffwithstuff.com/2014/07/15/a-turn-based-game-loop/), and the durations in [10](https://www.nngroup.com/articles/animation-duration/) require this.
3. A blocked Move costs no Move and gives one distinct cue [4](https://journal.stuffwithstuff.com/2014/07/15/a-turn-based-game-loop/).
4. The canvas is sharp at each `devicePixelRatio`, uses integer coordinates, and redraws only the layer that changes [5](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas).
5. The layout works in portrait on a phone, with large controls in the Action rail for touch, mouse, and keyboard [6](https://poki.com/blog/what-makes-high-quality-browser-game).
6. Feedback is short and states a rule result. No cue relies on sound alone or colour alone [7](https://www.jesperjuul.net/text/juiciness.pdf) [9](https://gameaccessibilityguidelines.com/basic/).
7. Motion lasts 100 to 300 ms with ease-out and runs from one fixed-tick loop [12](https://developer.mozilla.org/en-US/docs/Games/Anatomy) [10](https://www.nngroup.com/articles/animation-duration/).
8. Motion never flashes more than three times per second [15](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html).
9. A full reduced-motion path exists in Explorer Access Settings and Quiet Expedition, and it replaces motion with fades [13](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) [14](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
10. Audio starts only after a gesture, uses one sprite with exact timing, and has persistent switches for effects and music [16](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) [17](https://developer.mozilla.org/en-US/docs/Games/Techniques/Audio_for_Web_Games) [18](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html).
11. The first Labyrinth teaches by play, with prompts of eight words or fewer and hints only after a mistake [21](https://gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan) [22](https://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf) [24](https://poki.com/blog/how-we-made-cannon-clash-load-fast-and-boosted-conversion).
12. The first download is a few megabytes at most, and the first Move comes in seconds. A hidden tab pauses the Run and its audio [6](https://poki.com/blog/what-makes-high-quality-browser-game) [24](https://poki.com/blog/how-we-made-cannon-clash-load-fast-and-boosted-conversion) [20](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

A Warden cue follows property 6 and the Fog resolution in Method. Cogmind shows the pattern of one event on two channels [19](https://gamedeveloper.com/audio/audio-accessibility-features-for-roguelikes).

Recommended answer: A premium browser game answers each input within 100 ms, never lets motion block input, and states each rule result with one short cue. It also gives full motion and audio control, teaches by play, and starts in seconds. The Echo Maze rebuild adopts the twelve required properties of this section.

## Question 2: Which rebuild approach fits Echo Maze?

The section compares four approaches on determinism, replay safety, bundle size against `npm run check:bundle`, accessibility, test cost, and migration cost.

### Current measured bundle

One run of `npm run build` and `npm run check:bundle` on 2026-11-26 gives these values [26](../../scripts/check-bundle-budget.mjs).

| Budget row | Measured gzip | Budget | Headroom |
|---|---|---|---|
| landing JavaScript (`index-*.js`) | 7.15 KB | 8 KB | 0.85 KB |
| game JavaScript (`main-` + `game-session-` + `canvas-renderer-`) | 41.92 KB | 42 KB | 0.08 KB |
| Campfire Resume JavaScript | 4.07 KB | 5 KB | 0.93 KB |
| shared styles (`index-*.css`) | 8.77 KB | 13 KB | 4.23 KB |
| game styles (`main-*.css`) | 5.52 KB | 6 KB | 0.48 KB |
| Trail Compass JavaScript | 1.96 KB | 6 KB | 4.04 KB |
| Class Expedition play JavaScript | 1.01 KB | 5 KB | 3.99 KB |
| Question Narration JavaScript | 1.47 KB | 6 KB | 4.53 KB |
| Deck picker JavaScript | 0.41 KB | 2 KB | 1.59 KB |
| Daily submission JavaScript | 0.37 KB | 2 KB | 1.63 KB |
| Lantern Journal continuity JavaScript | 1.52 KB | 3 KB | 1.48 KB |
| Daily Constellation JavaScript | 0.59 KB | 2 KB | 1.41 KB |
| Offline continuity JavaScript | 0.67 KB | 3 KB | 2.33 KB |
| Echo Postcard JavaScript | 0.75 KB | 2 KB | 1.25 KB |
| optional Clerk | 544.21 KB | 600 KB | 55.79 KB |
| admin JavaScript | 6.80 KB | 20 KB | 13.20 KB |
| optional Sentry | not built | 120 KB | skipped |

- Split of the game row: `main-` 31.31 KB, `game-session-` 5.90 KB, `canvas-renderer-` 4.71 KB [26](../../scripts/check-bundle-budget.mjs).
- The play shell in `main-` is 75 percent of the game row. The engine and the renderer are 25 percent [26](../../scripts/check-bundle-budget.mjs). The game row has 0.08 KB of headroom [26](../../scripts/check-bundle-budget.mjs). Each approach must first free bytes or justify a new ceiling.

### Library sizes, minified+gzip

Bundlephobia reports these values for the full package entry of each library [27](https://bundlephobia.com/api/size).

| Library (version that Bundlephobia reports) | gzip bytes | KB | Share of the 42 KB game budget |
|---|---|---|---|
| preact 11.2.0 | 5,021 | 4.90 | 12% |
| lit 3.3.3 | 6,024 | 5.88 | 14% |
| svelte 5.59.2 (full package entry) | 14,159 | 13.83 | 33% |
| twgl.js 7.0.0 | 22,675 | 22.14 | 53% |
| ogl 1.0.11 | 34,177 | 33.38 | 79% |
| regl 2.1.1 | 37,658 | 36.78 | 88% |
| kaplay 3001.0.19 | 66,691 | 65.13 | 155% |
| excalibur 1.0.1 | 165,017 | 161.15 | 384% |
| littlejsengine 1.31.0 | 165,700 | 161.82 | 385% |
| pixi.js 8.23.0 | 282,430 | 275.81 | 657% |
| phaser 4.2.1 | 356,203 | 347.85 | 828% |

- The LittleJS README confirms its figure: `littlejs.min.js` is about 165 KB after gzip [28](https://github.com/KilledByAPixel/LittleJS). The same README states that a small 2D game reaches about 29 KB gzip when a bundler omits unused plugins [28](https://github.com/KilledByAPixel/LittleJS).
- Preact states a size of 3 kB [29](https://preactjs.com/). Lit states a size of about 5 KB, minified and compressed [30](https://lit.dev/docs/).
- PixiJS v8 states better tree-shake support and gives no size number [31](https://pixijs.com/blog/pixi-v8-launches). A tree-shaken PixiJS minimum is [unverified].
- A Phaser 3.50 custom build with Graphics only reaches 110 KB gzip [32](https://github.com/Ryu204/phaser-custom-build). No source gives a Phaser 4 figure.
- A Svelte application ships only the runtime parts that it uses [33](https://svelte.dev/docs/svelte/overview). The real application cost is [unverified].

### Repository facts that bind each approach

- The engine has no DOM access, no `Math.random`, and no clock read. `createRandom` uses `Math.imul` and integer shifts [34](../../src/game/game-session.js). The engine calls only `Math.abs`, `floor`, `max`, `min`, `round`, and `imul`. It calls no trigonometric function [34](../../src/game/game-session.js).
- MDN states that many `Math` functions have implementation-dependent precision across browsers and architectures [35](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math).
- The engine avoids that class of function. Therefore the browser and Node produce the same Run from one seed [34](../../src/game/game-session.js). `server/run-replay.js` imports `createRun`, `applyAction`, `actionAdvancedRun`, and `normalizeSeed` from `src/game/game-session.js` [34](../../src/game/game-session.js). The server imports no renderer and no shell module. A renderer change cannot reach the replay verifier [34](../../src/game/game-session.js). `src/main.js` has 5,455 lines. `canvas-renderer.js` has 1,073 lines. `game-session.js` has 1,937 lines [34](../../src/game/game-session.js).
- `tests/canvas-renderer.test.js` holds 75 tests on a mocked Canvas 2D context. The Vitest part of the Harness has 213 files [34](../../src/game/game-session.js). The e2e part of the Harness holds 168 Playwright tests [34](../../src/game/game-session.js). The specs name 117 distinct `#id` selectors. `index.html` declares 275 ids [34](../../src/game/game-session.js). The Labyrinth canvas has an `aria-label`. The Trail Compass is a DOM region with `aria-labelledby` and `aria-describedby` [34](../../src/game/game-session.js).
- The page has a polite live region. The Trail Compass ships as a 1.96 KB lazy chunk [26](../../scripts/check-bundle-budget.mjs) [34](../../src/game/game-session.js).
- The Content Security Policy sets `script-src 'self'` plus the Clerk and Turnstile origins. It has no `unsafe-eval` [34](../../src/game/game-session.js).

### Approach A: keep the core; rebuild renderer, shell, and feedback in vanilla JS and Canvas 2D

- Determinism: the engine stays byte-identical. The rebuild touches presentation only [34](../../src/game/game-session.js).
- Replay safety: the server import list stays the same. The Harness needs no change for the replay verifier [34](../../src/game/game-session.js).
- Bundle: the approach adds no library bytes. New feedback code still needs space, and the headroom is 0.08 KB [26](../../scripts/check-bundle-budget.mjs). The shell is 31.31 KB of the row. A shell rebuild is the only place to recover a large amount [26](../../scripts/check-bundle-budget.mjs).
- Accessibility: MDN states that a canvas is a bitmap and exposes no drawn object to accessibility tools [36](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas). The Trail Compass already supplies the nonvisual equal in DOM. Approach A keeps that design [34](../../src/game/game-session.js). WCAG SC 2.3.3 requires that the user can disable motion that an interaction triggers [14](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html). CSS and one `matchMedia` condition cover that requirement in Approach A. The guidelines list an option to turn off or hide background movement at the intermediate level [37](https://gameaccessibilityguidelines.com/full-list/).
- Test cost: the 75 renderer tests keep their mocked 2D context pattern. Rewritten draw code needs rewritten assertions. The 168 e2e tests keep their selectors where the rebuilt shell keeps the ids.
- Migration cost: the team rewrites the renderer and decomposes `main.js` in place, one surface per PR.
- Limit: Canvas 2D has no shader stage [unverified]. Glow, blur, and particles need layered canvases, cached tiles, or CSS filters.

### Approach B: keep the core; move the renderer to PixiJS or a WebGL micro-library

- Determinism: the engine stays the same, as in Approach A [34](../../src/game/game-session.js).
- Replay safety: the server never imports the renderer, so the library does not reach Node [34](../../src/game/game-session.js).
- Bundle: full PixiJS is 275.81 KB gzip, 6.6 times the whole game budget [27](https://bundlephobia.com/api/size). The tree-shaken size is [unverified]. The smallest named micro-library, twgl.js, takes 22.14 KB, 53 percent of the budget [27](https://bundlephobia.com/api/size). A lazy effects chunk needs a new budget row. The first Run then starts without effects or waits for them.
- Accessibility: PixiJS states that screen readers do not see canvas elements by default [38](https://pixijs.com/8.x/guides/components/accessibility). PixiJS accessibility is an opt-in module that places invisible `<div>` elements over the canvas [38](https://pixijs.com/8.x/guides/components/accessibility). That overlay labels sprites. It does not replace the Trail Compass, so the DOM path stays custom work. Reduced motion stays manual work. No fetched PixiJS page states a reduced-motion feature [unverified].
- Test cost: the 75 renderer tests assert Canvas 2D calls. A WebGL renderer invalidates each of them. PixiJS needs a custom adapter for Node and headless tests [39](https://pixijs.com/8.x/guides/concepts/environments). Vitest then needs that adapter or browser runs.
- Migration cost: the hatch, Fog, Neatline, and Coastline draw code moves to a scene graph or to shaders.
- Risk: WebGL adds context loss and GPU driver variance to a game that needs neither for its rules [unverified].

### Approach C: keep the core pure; rebuild the shell on Preact, Svelte, or Lit with a Canvas Labyrinth

- Determinism: the engine stays the same. The framework owns only the view state [34](../../src/game/game-session.js).
- Replay safety: the server import list stays the same [34](../../src/game/game-session.js).
- Bundle: Preact adds 4.90 KB and Lit adds 5.88 KB before any component code [27](https://bundlephobia.com/api/size). The headroom is 0.08 KB [26](../../scripts/check-bundle-budget.mjs). The framework pays back only if component code is smaller than the present 31.31 KB shell. That is [unverified].
- Accessibility: the shell stays semantic DOM, so the Trail Compass and live regions keep their model. Svelte warns at compile time on inaccessible markup, with about 42 `a11y_` warnings [40](https://svelte.dev/docs/svelte/compiler-warnings). Lit components scope styles by default [30](https://lit.dev/docs/). Shadow DOM hides the tree from page JavaScript and CSS [41](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM). Id-based ARIA references such as `aria-labelledby` across a shadow root are a known risk [unverified]. A virtual DOM re-render can re-announce or drop live-region text. This risk is [unverified].
- Test cost: the 117 `#id` selectors and the readiness barrier in e2e must survive a full shell rewrite. The view unit tests on happy-dom need a framework render step in each file.
- Migration cost: 5,455 lines of `main.js` and each lazy view module move to components. The pre-rendered landing markup in `index.html` and the 8 KB landing row must not load the framework.

### Approach D: rewrite on Phaser, Excalibur, KAPLAY, or LittleJS

- Determinism: Phaser gives a delta that is a clamped and smoothed average value [42](https://docs.phaser.io/phaser/concepts/game). Rules must not read it. Excalibur and LittleJS offer seeded random numbers [28](https://github.com/KilledByAPixel/LittleJS) [43](https://excaliburjs.com/docs/random/). Neither page claims a deterministic loop. The present engine is turn-based and pure. A framework loop adds nothing that the rules need.
- Replay safety: Phaser HEADLESS still needs the DOM. Phaser intends it for unit tests and not for use on a server [44](https://docs.phaser.io/api-documentation/constant/phaser). If the rules move into framework scenes, the Node verifier loses the shared engine. If the rules stay outside, the framework is only a renderer. Approach D then equals Approach B at more weight.
- Bundle: KAPLAY 65.13 KB, Excalibur 161.15 KB, LittleJS 161.82 KB, Phaser 347.85 KB [27](https://bundlephobia.com/api/size). Each exceeds 42 KB alone. The best sourced reduced figures are 29 KB for a small LittleJS game [28](https://github.com/KilledByAPixel/LittleJS) and 110 KB for Phaser 3.50 [32](https://github.com/Ryu204/phaser-custom-build).
- Accessibility: the LittleJS README names no accessibility feature [28](https://github.com/KilledByAPixel/LittleJS). No fetched Phaser, Excalibur, or KAPLAY page states screen-reader support. The absence is [unverified]. The Readout, Action rail, dialogs, and Questions are DOM today. A framework UI layer moves them into a canvas.
- Test cost: the 75 renderer tests, the view tests, and most of the 168 e2e tests need a rewrite.
- Migration cost: this is a full rewrite of the renderer and the shell, plus an adapter for each lazy feature chunk.

### Score table (1 = worst, 5 = best)

| Criterion | A: vanilla + Canvas 2D | B: rendering library | C: UI framework shell | D: game framework |
|---|---|---|---|---|
| Determinism | 5 | 5 | 5 | 2 |
| Replay safety (same rules in Node) | 5 | 5 | 5 | 2 |
| Bundle size against budgets | 4 | 1 | 3 | 1 |
| Accessibility | 5 | 3 | 4 | 2 |
| Test cost | 4 | 2 | 2 | 1 |
| Migration cost | 4 | 3 | 2 | 1 |
| Total (30) | 27 | 19 | 21 | 9 |

Evidence for each score:

- Determinism: A, B, and C leave `game-session.js` untouched, so each scores 5. D scores 2 because of [44](https://docs.phaser.io/api-documentation/constant/phaser) and [42](https://docs.phaser.io/phaser/concepts/game).
- Replay safety: A, B, and C keep the server import list. D scores 2 because Phaser rejects server use [44](https://docs.phaser.io/api-documentation/constant/phaser).
- Bundle: A scores 4, not 5, because the row has 0.08 KB left and feedback code adds bytes [26](../../scripts/check-bundle-budget.mjs). B scores 1 for PixiJS at 657 percent of the budget. A twgl.js renderer scores 2 at 53 percent [27](https://bundlephobia.com/api/size). C scores 3 because Preact or Lit costs 12 to 14 percent of the budget before component code [27](https://bundlephobia.com/api/size). D scores 1 because each named framework exceeds the budget alone [27](https://bundlephobia.com/api/size).
- Accessibility: A scores 5 because the DOM path already exists and stays under direct control [36](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas) [34](../../src/game/game-session.js). B scores 3 because the overlay is opt-in and the reduced-motion work stays manual [38](https://pixijs.com/8.x/guides/components/accessibility). C scores 4 because Svelte adds compile-time checks [40](https://svelte.dev/docs/svelte/compiler-warnings) and Lit adds shadow-root risk [41](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM). D scores 2 because no sourced framework feature supplies a nonvisual Labyrinth [28](https://github.com/KilledByAPixel/LittleJS).
- Test cost: A scores 4 because the mock pattern and the e2e selectors survive. B and C each break one large test layer.
- Migration cost: A scores 4 as an in-place rebuild. B rewrites one module on a new model. C rewrites 5,455 lines.

### Reasons and conditions

Reasons for Approach A:

1. The game budget has 0.08 KB of headroom [26](../../scripts/check-bundle-budget.mjs). Only A and C fit, and C spends 12 percent on a runtime first [27](https://bundlephobia.com/api/size).
2. The engine is pure, integer-seeded, and shared with the server. A, B, and C keep it, and A adds no new risk beside it [34](../../src/game/game-session.js).
3. The nonvisual equal of the Labyrinth is DOM, not canvas [36](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas). A keeps full control of that DOM and of the live regions.
4. The premium gap is in the shell and the feedback. The shell is 75 percent of the game row and 5,455 lines [26](../../scripts/check-bundle-budget.mjs) [34](../../src/game/game-session.js).
5. A keeps the mock pattern of the 75 renderer tests and the 117 e2e selectors. The Harness keeps its value in the rebuild.

Conditions on Approach A:

1. Split `main.js` into plain view modules first. This step takes the structure benefit of Approach C without a runtime.
2. Put motion and feedback in a lazy chunk with its own budget row. Do not hide bytes outside a budget.
3. Make each effect obey `prefers-reduced-motion` and Quiet Expedition, as SC 2.3.3 requires [14](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
4. Use layered canvases, cached tiles, and CSS for effects. Keep the Pilot Chart hatch and Fog tiles in Canvas 2D.
5. Reopen Approach B only for a measured need that Canvas 2D cannot meet. Then prefer a hand-written WebGL overlay.
6. Do not choose Approach D. It fails the replay criterion, the bundle criterion, and the accessibility criterion together.

Recommended answer: Choose Approach A, which scores 27 of 30. Keep the deterministic core, and rebuild the renderer, the play shell, and the feedback in vanilla JavaScript and Canvas 2D. The six conditions of this section apply.

## Question 3: How does the game prove fairness and solvability, and how does the server verify a Run at low cost?

### Solvability proof for a generated Labyrinth

- Constructive guarantee: a maze generator commonly builds a random spanning tree. The depth-first variant visits every cell [45](https://en.wikipedia.org/wiki/Maze_generation_algorithm). An edge that a generator adds after the tree creates a loop. A loop gives more than one path between two cells [45](https://en.wikipedia.org/wiki/Maze_generation_algorithm).
- Generate-and-test with a solver in the loop: one framework generates maze-like puzzles, then a model checker verifies each one [46](https://avesis.metu.edu.tr/publication/details/70f166dc-4b24-46e1-afd3-12b3979b91ee/verifying-maze-like-game-levels-with-model-checker-spin). Model check of a small state space: that framework takes the SPIN counterexample as the solution [46](https://avesis.metu.edu.tr/publication/details/70f166dc-4b24-46e1-afd3-12b3979b91ee/verifying-maze-like-game-levels-with-model-checker-spin). The same framework checks stated requirements [46](https://avesis.metu.edu.tr/publication/details/70f166dc-4b24-46e1-afd3-12b3979b91ee/verifying-maze-like-game-levels-with-model-checker-spin).
- Reachability and soft-lock search: no fetched page states a method.
- An exact search over position and mechanism state is the usual form [unverified].
- Property-based tests apply random inputs to the code and find edge cases [47](https://fast-check.dev/docs/introduction/why-property-based/). The tool then shrinks a failure to a small counterexample [47](https://fast-check.dev/docs/introduction/why-property-based/).
- Model-based and stateful tests generate whole action sequences against a simpler model [48](https://fast-check.dev/docs/advanced/model-based-testing/) [49](https://hypothesis.readthedocs.io/en/latest/stateful.html). An invariant runs after each step [48](https://fast-check.dev/docs/advanced/model-based-testing/) [49](https://hypothesis.readthedocs.io/en/latest/stateful.html).
- A constant seed makes a property run repeat exactly. A failed run reports a seed that reproduces it [48](https://fast-check.dev/docs/advanced/model-based-testing/) [47](https://fast-check.dev/docs/introduction/why-property-based/).
- Fit: the Harness already holds three of these methods. The base Labyrinth is one connected maze (ADR 0053 item 3). `everyReachableTileReachesObjectives` in `src/game/game-session.js` is the generate-and-test guard for Objective Reachability. `tests/no-soft-lock.test.js` is a small model check over position, Echo mask, and Tide phase. The gap is random action sequences against `applyAction`. `package.json` has no fast-check.

### Determinism across engines

- Determinism means the same start state and the same inputs give the same result. Then only the inputs go on the wire [50](https://gafferongames.com/post/deterministic_lockstep/).
- A checksum of the full state at each step detects a divergence [50](https://gafferongames.com/post/deterministic_lockstep/) [51](https://www.riotgames.com/en/news/determinism-league-legends-fixing-divergences) [52](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond).
- Only the first divergence matters, because the state turns to chaos after it [51](https://www.riotgames.com/en/news/determinism-league-legends-fixing-divergences). Riot logs state as a key-value tree to locate the first divergence [51](https://www.riotgames.com/en/news/determinism-league-legends-fixing-divergences).
- Riot built determinism to get fast tests that repeat from recorded inputs [53](https://www.riotgames.com/en/news/determinism-league-legends-introduction).
- Riot runs automated tests on real recordings [53](https://www.riotgames.com/en/news/determinism-league-legends-introduction) [51](https://www.riotgames.com/en/news/determinism-league-legends-fixing-divergences).
- Age of Empires seeds and synchronises the random numbers. Small differences multiply over time [52](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond).
- `Math.random` gives no way to set the seed [54](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random).
- Many `Math` functions have implementation-dependent precision, so two browsers can differ [35](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math).
- `Math.imul` gives C-like 32-bit multiplication [55](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul).
- mulberry32 holds 32 bits of state and skips about a third of the values. sfc32 holds 128 bits [56](https://github.com/bryc/code/blob/master/jshash/PRNGs.md).
- `for...in` order differs between engines when code mutates the object [57](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in).
- A `sort` comparator that is not well-formed gives undefined order [58](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort).
- Fit: `server/run-replay.js` imports `createRun` and `applyAction` from the client module, so no second implementation exists. Two risks stay. One is a browser engine against Node. The other is a client bundle older than the server. `createRandom` (`game-session.js` line 1924) matches the mulberry32 code in [56](https://github.com/bryc/code/blob/master/jshash/PRNGs.md) with an FNV-1a string seed. `tests/deterministic-core.test.js` already bans clock reads, `Math.random`, and locale collation under `src/game` and `shared`. Its one exemption is `src/game/unique-id.js`, which makes Run identifiers only. The test does not ban transcendental `Math` functions or `for...in`. `tests/twist-generation-golden.test.js` pins placement only. No golden test pins the result of a full Run Action Log.

### Server verification of a Run

- Full replay: the server feeds the seed and the inputs into its own copy of the rules [59](https://dev.to/gowtham_r_2002/dont-trust-the-score-building-server-authoritative-validation-for-a-prize-based-mobile-game-246i).
- TrackMania validation replays the inputs the same way [60](https://donadigo.com/tmx1).
- Cost bounds: an API needs an execution timeout, a memory limit, and a payload size limit [61](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption).
- An API also needs an operations limit per request and a rate limit [61](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption).
- A cheaper policy replays only the scores that reach the top of a leaderboard [62](https://bugnet.io/blog/how-to-fix-leaderboard-cheating-and-fake-scores).
- Server-issued start: one design creates a one-time Run on the server with a fresh seed, a rules version, and a 15-minute expiry [59](https://dev.to/gowtham_r_2002/dont-trust-the-score-building-server-authoritative-validation-for-a-prize-based-mobile-game-246i).
- HMAC authenticates a message with a secret key and a hash function [63](https://www.rfc-editor.org/rfc/rfc2104). The RFC recommends a key of at least the hash output length [63](https://www.rfc-editor.org/rfc/rfc2104).
- Commit-reveal: a commitment hides a value in the commit phase and binds the sender to it [64](https://en.wikipedia.org/wiki/Commitment_scheme).
- Wordle shipped each future answer in one script [65](https://makezine.com/article/maker-news/how-every-developer-knew-all-the-wordle-answers-from-day-one/).
- Limit of replay: the official TrackMania check accepts a Run from a slowed game [60](https://donadigo.com/tmx1).
- Tool-assisted play uses frame advance and savestates [66](https://tasvideos.org/Glossary).
- Usual response: statistics rank suspect players for review. A mismatch is a risk flag, not proof [60](https://donadigo.com/tmx1) [59](https://dev.to/gowtham_r_2002/dont-trust-the-score-building-server-authoritative-validation-for-a-prize-based-mobile-game-246i).
- Checkpoint verification has no fetched source [unverified].
- Fit: `verifyRunReplay` already does the full replay with hard limits. The Daily limit is 1024 actions and 64 KiB. The offline limit is 4096 actions and 512 KiB. Each log allows 4 hours elapsed. `server/daily-route.js` applies the body cap and the `score.submit` rate limit before the replay. Three gaps stay. First, no measured time budget exists for a maximum-length log. Second, ADR 0012 lets a Daily start bypass Run Access, so the server sees no Daily Run start. Third, `createDailyContract` derives `DAILY-YYYYMMDD` in client code. Each future Daily Shared Labyrinth is public, as in [65](https://makezine.com/article/maker-news/how-every-developer-knew-all-the-wordle-answers-from-day-one/). The bundle also ships each `answerId` of the Daily Questions.

### Leaderboard integrity for one ranked attempt on a shared daily seed

- Trusted writes: a Steam leaderboard set to Trusted accepts no score from a client. Only the server API sets a score [67](https://partner.steamgames.com/doc/features/leaderboards).
- One attempt: one design caps the client run ID and the server run ID at one submission per day [59](https://dev.to/gowtham_r_2002/dont-trust-the-score-building-server-authoritative-validation-for-a-prize-based-mobile-game-246i).
- A captured request sent again fails as a duplicate [59](https://dev.to/gowtham_r_2002/dont-trust-the-score-building-server-authoritative-validation-for-a-prize-based-mobile-game-246i). A submission for a Run that was already submitted gets HTTP 409 [59](https://dev.to/gowtham_r_2002/dont-trust-the-score-building-server-authoritative-validation-for-a-prize-based-mobile-game-246i). The server stamps a rules version on the Run that it issues [59](https://dev.to/gowtham_r_2002/dont-trust-the-score-building-server-authoritative-validation-for-a-prize-based-mobile-game-246i). The client claim serves analytics only. The server result is the record [59](https://dev.to/gowtham_r_2002/dont-trust-the-score-building-server-authoritative-validation-for-a-prize-based-mobile-game-246i).
- The official TrackMania check does not reject a Run that a slowed game made [60](https://donadigo.com/tmx1). So a replay proves legal inputs, not unaided play [60](https://donadigo.com/tmx1).
- A check against the maximum achievable result and a flag for an impossible jump add a cheap filter [62](https://bugnet.io/blog/how-to-fix-leaderboard-cheating-and-fake-scores).
- No fetched primary source describes a published daily-seed design with one ranked attempt and a hidden seed [unverified].
- Fit: ADR 0024 already gives trusted writes. Only `submitVerifiedEntry` after the replay writes a Verified Daily Entry. ADR 0024 and the GLOSSARY keep the best escaped Verified Run per Explorer per UTC date. The Verified Daily Board is best-of-many. An Explorer can replay the public seed until the Run is optimal. Run Score adds fixed awards: 100 for a correct Warden answer, 50 for an Echo, 500 for the Gate. Run Score takes no input from elapsed time, and ADR 0024 keeps time out of the rank. Both fit the evidence in [60](https://donadigo.com/tmx1). The answer award is the weak point, because the answers are in the bundle.

### Source grades

- Primary: [50](https://gafferongames.com/post/deterministic_lockstep/) [53](https://www.riotgames.com/en/news/determinism-league-legends-introduction) [51](https://www.riotgames.com/en/news/determinism-league-legends-fixing-divergences) [52](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond) [49](https://hypothesis.readthedocs.io/en/latest/stateful.html) [46](https://avesis.metu.edu.tr/publication/details/70f166dc-4b24-46e1-afd3-12b3979b91ee/verifying-maze-like-game-levels-with-model-checker-spin) [61](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption) [63](https://www.rfc-editor.org/rfc/rfc2104) [67](https://partner.steamgames.com/doc/features/leaderboards) [60](https://donadigo.com/tmx1).
- Tool or platform documents: [48](https://fast-check.dev/docs/advanced/model-based-testing/) [47](https://fast-check.dev/docs/introduction/why-property-based/) [56](https://github.com/bryc/code/blob/master/jshash/PRNGs.md) [54](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random) [35](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math) [55](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul) [57](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in) [58](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort).
- Secondary: [45](https://en.wikipedia.org/wiki/Maze_generation_algorithm) [64](https://en.wikipedia.org/wiki/Commitment_scheme) [66](https://tasvideos.org/Glossary) [65](https://makezine.com/article/maker-news/how-every-developer-knew-all-the-wordle-answers-from-day-one/) [59](https://dev.to/gowtham_r_2002/dont-trust-the-score-building-server-authoritative-validation-for-a-prize-based-mobile-game-246i) [62](https://bugnet.io/blog/how-to-fix-leaderboard-cheating-and-fake-scores).

### Required measures

1. Harness, current tiers: keep the connected base maze, the Objective Reachability check, and the exact search of `tests/no-soft-lock.test.js`. Add each new mechanism state to the search key of that exact search.
2. Harness, new tier: add fast-check as a pinned dev dependency. Run model-based commands through `applyAction` with a fixed seed. Assert no throw, no soft-lock, and replay equality in that tier.
3. Harness, new tier: store golden Run Action Logs per ruleset revision with a state hash at each tenth action. Run the golden logs in Node and in each e2e browser.
4. Extend `tests/deterministic-core.test.js`: also ban transcendental `Math` functions and `for...in`. Keep `src/game/unique-id.js` as the one exemption.
5. Keep one generator stream of integer state. Keep mulberry32 for each current revision. A new revision can adopt sfc32 behind the revision pin.
6. Keep full replay as the only proof. Add no checkpoints at 1024 actions. Add a benchmark test that replays a maximum-length log and sets the time budget.
7. Add a Daily Run Grant for the ranked Daily, on the Run Grant pattern of ADR 0007. The server signs the Daily Run Grant with HMAC over the Explorer, the UTC date, the ruleset revision, and the issue time.
8. Rank only the Run of the first Daily Run Grant per Explorer per UTC date. Submit checks the signature, the Explorer, the date, and that the Grant is unused. An abandoned first Run leaves no ranked entry for that date. This measure supersedes the best-entry rule of ADR 0024 and the GLOSSARY term Verified Daily Entry. Later Runs stay Verified Runs without a rank.
9. Derive the ranked seed as HMAC of a server secret and the date. The note names no secret value. Publish the SHA-256 commitment of the seed early, and reveal the seed with the Grant. This measure amends the public contract and the Run Access bypass of ADR 0012.
10. The ranked Daily has no Warden Question (Question 4, candidate 8). Therefore the bundle ships no ranked `answerId`. If a later ranked Daily keeps a Warden Question, the server holds the answers and scores each answer in the replay. The cost of that fallback is a network call at start and per Warden Challenge.
11. The casual Daily stays offline on the public seed, without a rank.
12. State the limit in the product: a Verified Run proves legal inputs, not unaided play. A second account can scout the seed after the reveal. Keep time out of the rank, flag outliers, and keep stakes low.

Recommended answer: Prove fairness in the Harness with the connected base maze, the Objective Reachability check, the exact soft-lock search, model-based tests, and golden Run Action Logs. Keep full replay with a measured time budget as the only server proof. Rank only the Run of one HMAC-signed Daily Run Grant on a committed seed.

## Question 4: Which rule changes give the largest gain in play quality?

Scope: Echo Maze rules, generator, and Run Score. Inputs: the GLOSSARY, the audit, the logic plan, `rebuild-v3.md` sections 5 and 6, and the engine code.

### Candidate 1: line-of-sight Fog with map memory

- Now: `revealKeys` shows a radius-2 diamond with no wall test (A-25). `revealed` is permanent and shows each Warden at its live position (A-05).
- Change: reveal only tiles in line of sight. Keep seen passages as memory. Show a Warden only in the current view. Show a mark at the tile where the Explorer last saw each Warden.
- Gain: the Fog becomes real information. A wall now hides a Warden, so a corner is a risk that the player can read. Anderson states that a stealth player must know the result before the commit [68](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules). A view through walls gives knowledge with no cause. A live Warden on a remembered tile removes the Fog. Roguelike developers store memory as a copy of the last sight, not as a live object [69](#sources) [unverified].
- The prior note covers the field-of-view algorithm.
- Cost: engine change in the reveal step. The Bell Lure reads `revealed`, so the change touches each revision (L4). The Run Action Log format stays. A stored Run replays on its own revision.
- Findings: A-05, A-25. Partly A-17, A-18, A-19, A-24. Gain 5. Cost 3.

### Candidate 2: Warden telegraph

- Now: Wardens move after the Explorer. The target reads the new Explorer tile and `lastDirection`. A seeded random value breaks a tie. The player cannot know the next Warden step.
- Two variants exist. Display-only shows the mode and the target tile. It changes no rule and costs 1.
- Committed intent is the variant that this note scores. Each Warden selects its next step at the end of a turn.
- The Labyrinth view shows that step for each Warden in view. The Warden makes that step after the next Explorer action.
- Gain: each loss of Vitality becomes a result that the player can foresee. Clark tests fixed-interval movement so that enemy patterns are fair and predictable [70](https://gamedeveloper.com/business/road-to-the-igf-brace-yourself-games-i-crypt-of-the-necrodancer-i-). Anderson shows the limits of guard sight and sound, so the player can understand the systems [68](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules). Pac-Man ghosts reverse on a mode change, and that reversal is the visible signal [71](https://pacman.holenet.info/).
- The prior note gives the Into the Breach case for shown intent.
- Gain: committed intent also removes the hidden tie-break and the Intercept read of a stale `lastDirection`.
- Cost: engine change in `moveWardens` and one new field per Warden in the Run state. The Run Action Log format stays. Wardens react one action late, so the Warden count and ranges need a new balance pass.
- Findings: A-22, A-42, A-48, A-54. Partly A-38, A-46. Gain 5. Cost 3.

### Candidate 3: Warden pursuit and anti-stall rules

- Now: 548 of 570 Patrol Wardens stand still in the last 20 turns (A-02). 49 of 60 Hunt or Intercept Wardens oscillate (A-06). The locked Gate tile is a safe stall tile (A-49).
- Change: remove the "stay" move from Patrol. Make Patrol walk a route between Echoes. Measure pursuit distance over the tiles that a Warden can enter. Let a Warden enter the Gate tile. Spawn each Warden outside the Intercept radius (L12). Alternate Hunt with a short Patrol phase.
- Gain: Pac-Man alternates scatter and chase at fixed intervals, and scatter gives the player a short rest [71](https://pacman.holenet.info/). Each ghost has a different target rule, so pursuit has variety [71](https://pacman.holenet.info/). A timer forces a ghost out when the player eats no dots, so a stall has no value [71](https://pacman.holenet.info/).
- Pac-Man is real-time, so the transfer is an inference.
- Invisible, Inc. adds an alarm that rises each turn, so each move is a trade-off [72](https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-). Lantz reports the cost: many players feel that the alarm is unfair, and some leave [72](https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-). The article does not name the stall as its target [72](https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-).
- So this note recommends pursuit repair and a contact-capable Gate tile, not a clock that rises.
- Cost: engine change for each revision (L2). No format change. A stored Run replays on its own revision.
- Findings: A-02, A-06, A-41, A-49. Partly A-04, A-23. Gain 4. Cost 3.

### Candidate 4: Echo placement and route reward

- Now: `pickEntities` shuffles Echoes past a minimum start distance and ignores the Gate and the branches (A-10). The Gate is in a dead end in about 80% of seeds, and 82% of dead-end tiles are empty (A-47). The best known-map route shows 85 to 86% of passages (A-10). 23 to 34% of Echo Bridges save 3 tiles or fewer (A-50).
- Change: put each Echo at the end of a branch or on the far side of a loop. Put the Gate away from the last Echo. Accept a Bridge only when it saves a set minimum of tiles.
- Gain: a branch then holds a reward, and the order of Echoes becomes a route decision. Cyclic generation puts the lock on one path and the key on the other, so the return is part of a loop (secondary) [73](https://gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-). Dead Cells puts useful items in dead ends and adds a way back to the last fork (secondary) [73](https://gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-). The LIMOS study finds that long-solution mazes have short dead-end paths, so the player follows a near-obvious path [74](https://perso.limos.fr/~palafour/PAPERS/PDF/labyrinthe.pdf).
- The study names Recursive Backtracking as the example [74](https://perso.limos.fr/~palafour/PAPERS/PDF/labyrinthe.pdf).
- Gain: Kim et al. show that a generator can accept designer targets for branch and solution-path topology [75](https://pcgworkshop.com/archive/kim2019designcentric.pdf).
- Cost: generator change. Each seed gives a different Labyrinth, so each revision needs a successor. The Daily Shared Labyrinth changes at one stated date. No Run Action Log format change.
- Findings: A-10, A-47, A-50. Partly A-09. Gain 4. Cost 3.

### Candidate 5: loop density of the Labyrinth

- Now: the generator opens `floor(size/4)` loop walls after a perfect depth-first maze. The chokepoint share of the Gate route is 0.59 at size 11 and 0.69 at size 23 (A-13).
- Change: open loops in proportion to the passage count, and place them so that each Warden zone has two exits. Validate the chokepoint share for each seed (`rebuild-v3` section 5.7).
- Gain: a chase needs a second route. With one route, a Warden on a chokepoint decides the result. Pullen states that a recursive backtracker has a high "river" factor and a long, twisty solution [76](https://www.astrolog.org/labyrnth/algrithm.htm).
- His table gives it about 10% dead ends, against about 30% for Kruskal or Prim [76](https://www.astrolog.org/labyrnth/algrithm.htm). A partial braid mixes loops and dead ends [76](https://www.astrolog.org/labyrnth/algrithm.htm).
- Gain: Thompson reports that cycles copy the structure of hand-made levels (secondary) [73](https://gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-).
- The maze-metric papers measure loop-free mazes that the solver sees in full [74](https://perso.limos.fr/~palafour/PAPERS/PDF/labyrinthe.pdf) [77](https://archive.bridgesmathart.org/2001/bridges2001-213.pdf).
- Their use for loops under Fog is an inference.
- Cost: one generator rule and one validator rule. The change breaks seed stability. It ships with candidate 4 in the same successor revisions. No format change.
- Findings: A-13. Gain 4. Cost 2.

### Candidate 6: Trail Twist count scaled to Labyrinth size

- Now: Windways, Tide Doors, and Signal Bells each get a fixed count of 2. Only Echo Bridges scale (A-30).
- Change: set the Trail Twist count per Labyrinth in the config table, in step with the passage count.
- Gain: a Trail Twist that the Explorer meets once on a size-23 Labyrinth does not shape the route. McEntee states that each mechanic has a parameter that changes the challenge [78](https://www.gamedeveloper.com/design/rational-design-the-core-of-i-rayman-origins-i-). Count is that parameter here.
- No fetched source measures Trail Twist density for a grid game. The gain claim is [unverified].
- Cost: small generator change, inside the same seed break as candidates 4 and 5.
- Findings: A-30. Partly A-03. Gain 2. Cost 2.

### Candidate 7: the Pulse as a real decision

- Now: a Pulse shows about 11 to 12 new tiles for 2 actions and adds nothing to `revealed` (A-24, A-28). The Pulse count is the same for all 20 Labyrinths of a Quest Level (A-28). A second press wastes a Pulse (A-29). A correct answer in a Warden Challenge gives a Pulse (A-20).
- Change: add the passages that a Pulse shows to map memory. Show Wardens in the Pulse for the Pulse duration only. Set the Pulse count per Labyrinth. Give a Pulse for each Echo, not for a Question. Block a second Pulse while one is active.
- Gain: the Pulse then buys route knowledge that lasts, and its cost is clear. Bycer states that scarcity is the main cause of the hoard habit [79](https://gamedeveloper.com/game-platforms/how-to-stop-making-hoarders-in-video-games).
- He recommends a limit inside one encounter with a refill after it [79](https://gamedeveloper.com/game-platforms/how-to-stop-making-hoarders-in-video-games).
- A Pulse per Echo is that refill, and it pays the player for the risk of the branch.
- Cost: engine change in `resolvePulse` and the Echo step, plus one input guard. No format change.
- Findings: A-24, A-28, A-29. Partly A-19. Gain 3. Cost 2.

### Candidate 8: the Warden Challenge: keep, change, or make optional

- Now: contact starts a Question. A correct answer gives +100 and 1 Pulse, and contact itself costs nothing (A-20). A paid Question Skip is never better than a guess (A-07). The text omits the Vitality cost (A-43). Each Daily attempt gets the same Question order (A-20).
- Evidence on Questions inside an action loop is mixed.
- Jičínská et al. test a shooter with quiz questions against the bare quiz, with 69 children aged 10 to 12 [80](https://frontiersin.org/articles/10.3389/fpsyg.2021.678380/full). The bare quiz gives better immediate recall (d = 0.46) [80](https://frontiersin.org/articles/10.3389/fpsyg.2021.678380/full). The test after about 3 weeks shows no significant difference (n = 62, d = 0.09) [80](https://frontiersin.org/articles/10.3389/fpsyg.2021.678380/full). In free choice, 59 children select the game and 10 select the quiz [80](https://frontiersin.org/articles/10.3389/fpsyg.2021.678380/full).
- The authors state that this form interrupts flow, and they find no long-term harm to learning [80](https://frontiersin.org/articles/10.3389/fpsyg.2021.678380/full).
- Rowland finds a reliable testing effect (g = 0.50) [81](https://doi.org/10.1037/a0037559). Feedback raises it (g = 0.73 against 0.39) [81](https://doi.org/10.1037/a0037559).
- Recall tests give larger benefits than recognition tests [81](https://doi.org/10.1037/a0037559). A multiple-choice Question is a recognition test (inference).
- Habgood and Ainsworth report more learning for content inside the core mechanic [82](https://doi.org/10.1080/10508406.2010.508029) [unverified]. They also report about 7 times more free-choice play time for that content [82](https://doi.org/10.1080/10508406.2010.508029) [unverified]. That free-choice study has 16 children, and a later paper disputes the cause [82](https://doi.org/10.1080/10508406.2010.508029) [unverified].
- Answer: change the payoff, remove the paid Question Skip, and remove the Challenge from the Daily and Classic Rules.
- The evidence does not support removal from the Quest. The Question does not harm long-term learning, and children select the game.
- The audit supports a change of payoff: the present rule rewards contact.
- In the new revisions, contact costs 1 Vitality, and the Warden returns to its spawn (`rebuild-v3` section 5.2).
- In a Quest Run, a correct answer cancels that cost and gives no score and no Pulse. A wrong answer shows the explanation.
- Cost: engine, Challenge actions in the Run Action Log, server replay, and the Question supply. A stored Run in a Challenge stays on its legacy revision.
- Findings: A-07, A-20, A-43. Partly A-08, A-27, A-37, A-39. Gain 4. Cost 4.

### Candidate 9: Vitality recovery

- Now: no code path raises Vitality (A-44).
- Change (not recommended now): one recovery item per Labyrinth on the most expensive branch.
- Gain: one small roguelike replaces timed recovery with full recovery at the level exit [83](https://onebitpunch.itch.io/hello-rogue/devlog/200957/hello-rogue-v101).
- Its developer states that the player must then choose between exploration and the exit [83](https://onebitpunch.itch.io/hello-rogue/devlog/200957/hello-rogue-v101).
- Bycer names refill at a checkpoint as a pattern that keeps short-term weight [79](https://gamedeveloper.com/game-platforms/how-to-stop-making-hoarders-in-video-games).
- Each Labyrinth already starts with full Vitality, so Echo Maze already has that refill.
- Evidence for recovery inside a short Labyrinth is thin, and the gain is [unverified].
- Cost: one entity type, one generator rule, one Compass text. Same seed break as candidate 4.
- Findings: A-44. Gain 2. Cost 2.

### Candidate 10: score formula

- Now: Run Score is 500 + 50 per Echo + 100 per Warden defeat. The Gate needs every Echo, so the Echo term is a constant (A-09). The only variable term rewards contact with a Warden (A-20).
- Change: score the route. Use Moves against par (candidate 12) and Vitality at the Gate. Give no score for a Question.
- Gain: Pink reports that a score system changes which choices a player values [84](https://gamedeveloper.com/design/mechanical-dissonance-and-setting-player-expectations).
- His case is Hitman: Absolution, where score bonuses make one method feel correct and replace his own motive [84](https://gamedeveloper.com/design/mechanical-dissonance-and-setting-player-expectations).
- Echo Maze has the same fault: the score pays for contact, and the fiction says "avoid the Warden".
- Gain: a route score also removes the Daily Question farm.
- Cost: score function, Run Record fields, server validation, and one leaderboard partition per revision. Stored scores stay valid inside their own revision. The two scales do not compare.
- Findings: A-09, A-20. Partly A-11, A-40. Gain 4. Cost 3.

### Candidate 11: difficulty curve over the Quest ladder

- Now: `getLabyrinthConfig` selects size, Echo count, and Warden count by band. Two Bright Start bands are identical. Vitality and Pulses are the same for all 20 Labyrinths (A-12, A-28). The config is not in the revision, so a config edit breaks replay of stored Runs (A-31).
- Change: one fixed table row per Labyrinth (`rebuild-v3` section 5.5). Name the table version in the revision (L10). Alter one or two parameters per step.
- Gain: McEntee defines macro flow as a constant rise in difficulty that matches the rise in skill [78](https://www.gamedeveloper.com/design/rational-design-the-core-of-i-rayman-origins-i-).
- He describes exposition, then validation, then challenge for each mechanic [78](https://www.gamedeveloper.com/design/rational-design-the-core-of-i-rayman-origins-i-).
- A step function gives flat runs and then a jump.
- The first Labyrinth of each Trail Twist must be the exposition, with a low Warden count.
- Cost: config table, revision identity, and replay lookup by table version. No engine rule change.
- Findings: A-12, A-31. Partly A-08, A-28. Gain 3. Cost 3.

### Candidate 12: a par or optimal-route measure per seed

- Now: no measure exists. `rebuild-v3` section 5.3 defines "chart par".
- Chart par is the shortest route from the start through all Echoes to the Gate.
- Change: compute par in the generator by breadth-first search over (tile, Echo set, Tide phase). Store it in the Run. Use par in the validator (par between `size` and `size²/2`), the score, and the result screen.
- Gain: par gives each seed a target that the player can compare with a friend. Par also gives the validator a number for route length.
- Cooper and Bazzaz show that a generator can enforce reachability rules for each level [85](https://doi.org/10.1145/3723498.3723844). That enforcement costs up to 5 times the generation time [85](https://doi.org/10.1145/3723498.3723844).
- Holm argues against par: a number can replace level design, and a hard limit forces resets [86](https://criticalcycle.blogspot.com/2020/09/issues-with-turn-limits-in-puzzle-games.html). So par must stay a soft target.
- No fetched developer source supports par for a maze game, so the gain is [unverified] outside the repository.
- Cost: one pure function and one Run field. No rule change. Wardens are not in the search, so the text must say "chart par", not "best possible Run".
- Findings: partly A-10, A-11. Gain 3. Cost 2.

### Ranked table

| Rank | Candidate | Gain | Cost | Findings resolved | Sources |
|---|---|---|---|---|---|
| 1 | Line-of-sight Fog with map memory | 5 | 3 | A-05, A-25; partly A-17, A-18, A-19, A-24 | [68](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules), [69](#sources) |
| 2 | Warden telegraph (committed intent) | 5 | 3 | A-22, A-42, A-48, A-54; partly A-38, A-46 | [71](https://pacman.holenet.info/), [68](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules), [70](https://gamedeveloper.com/business/road-to-the-igf-brace-yourself-games-i-crypt-of-the-necrodancer-i-) |
| 3 | Loop density | 4 | 2 | A-13 | [73](https://gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-), [76](https://www.astrolog.org/labyrnth/algrithm.htm), [74](https://perso.limos.fr/~palafour/PAPERS/PDF/labyrinthe.pdf), [77](https://archive.bridgesmathart.org/2001/bridges2001-213.pdf) |
| 4 | Warden pursuit and anti-stall | 4 | 3 | A-02, A-06, A-41, A-49; partly A-04, A-23 | [72](https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-), [71](https://pacman.holenet.info/) |
| 5 | Echo placement and route reward | 4 | 3 | A-10, A-47, A-50; partly A-09 | [73](https://gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-), [74](https://perso.limos.fr/~palafour/PAPERS/PDF/labyrinthe.pdf), [75](https://pcgworkshop.com/archive/kim2019designcentric.pdf) |
| 6 | Score formula | 4 | 3 | A-09, A-20; partly A-11, A-40 | [84](https://gamedeveloper.com/design/mechanical-dissonance-and-setting-player-expectations) |
| 7 | Par per seed | 3 | 2 | partly A-10, A-11 | [86](https://criticalcycle.blogspot.com/2020/09/issues-with-turn-limits-in-puzzle-games.html), [85](https://doi.org/10.1145/3723498.3723844) |
| 8 | Pulse as a real decision | 3 | 2 | A-24, A-28, A-29; partly A-19 | [79](https://gamedeveloper.com/game-platforms/how-to-stop-making-hoarders-in-video-games) |
| 9 | Warden Challenge: change payoff; none in Daily and Classic | 4 | 4 | A-07, A-20, A-43; partly A-08, A-27, A-37, A-39 | [80](https://frontiersin.org/articles/10.3389/fpsyg.2021.678380/full), [81](https://doi.org/10.1037/a0037559), [82](https://doi.org/10.1080/10508406.2010.508029) |
| 10 | Difficulty curve | 3 | 3 | A-12, A-31; partly A-08, A-28 | [78](https://www.gamedeveloper.com/design/rational-design-the-core-of-i-rayman-origins-i-) |
| 11 | Trail Twist count scaled to Labyrinth size | 2 | 2 | A-30; partly A-03 | [78](https://www.gamedeveloper.com/design/rational-design-the-core-of-i-rayman-origins-i-) |
| 12 | Vitality recovery | 2 | 2 | A-44 | [79](https://gamedeveloper.com/game-platforms/how-to-stop-making-hoarders-in-video-games), [83](https://onebitpunch.itch.io/hello-rogue/devlog/200957/hello-rogue-v101) |

### Release shape

- Ship one revision generation in one release, with one ADR. Six revisions are live.
- Each revision gets one successor from the same engine change set.
- The successors are `classic-v2`, `echo-hush-v2`, `windways-v3`, `echo-bridges-v2`, `tide-doors-v2`, and `warden-bells-v2`.
- The six present revisions move to the legacy list (the ADR 0053 pattern). A stored Run replays on its own revision.
- `currentRunRuleset` starts each new Run on the successor. The Daily Shared Labyrinth changes at one stated date.
- Each Verified board has one partition per revision.
- One break is cheaper than two, because each break needs a legacy engine path.

Ship in that generation:

- Line-of-sight Fog and the Warden telegraph, together. The first hides Wardens, and the second makes them fair.
- Warden pursuit repair, loop density, and Echo placement. Together they make a chase and a route a choice.
- Par and the score formula. The score needs par, and both need the new generator.
- The Pulse change and the Trail Twist count. Both are cheap inside the same break.
- The difficulty table, with the table version in the revision identity.
- The Warden Challenge payoff, because the score and the Pulse both read the Challenge.
- The Daily and Classic Rules have no Question. A Quest Run keeps the Question as a save.

Leave out:

- Vitality recovery. Evidence is thin, and each Labyrinth already refills Vitality.
- A clock that rises, or Warden speed escalation. Lantz reports that many players feel such a clock is unfair [72](https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-).
- Par as a hard Move limit. Holm shows the reset cost [86](https://criticalcycle.blogspot.com/2020/09/issues-with-turn-limits-in-puzzle-games.html).
- A full braid. Dead ends must stay, because they hold the Echoes.
- Full removal of the Question from the Quest. The learning evidence does not require it [80](https://frontiersin.org/articles/10.3389/fpsyg.2021.678380/full) [81](https://doi.org/10.1037/a0037559).

Open risks:

- Committed intent makes Wardens react one action late, so Warden counts need a balance pass.
- Sources [82](https://doi.org/10.1080/10508406.2010.508029) and [69](#sources) are [unverified].
- The loop, Trail Twist count, par, and recovery gains rest on inference.

Recommended answer: Ship line-of-sight Fog and the Warden telegraph, which rank first and second, with the nine other accepted candidates as one revision generation. Use one release and one ADR. Leave out Vitality recovery, a clock that rises, a hard par limit, and a full braid.

## Sources

1. Response Times: The 3 Important Limits (Jakob Nielsen, Nielsen Norman Group). https://www.nngroup.com/articles/response-times-3-important-limits/
2. Interaction to Next Paint (INP) (Jeremy Wagner and Barry Pollard, web.dev). https://web.dev/articles/inp
3. Game Feel: The Secret Ingredient (Steve Swink, Game Developer, 2007). https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient
4. A Turn-Based Game Loop (Bob Nystrom, 2014). https://journal.stuffwithstuff.com/2014/07/15/a-turn-based-game-loop/
5. Optimizing canvas (MDN Web Docs). https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
6. What makes a high-Quality browser game? (Poki blog, 2026). https://poki.com/blog/what-makes-high-quality-browser-game
7. Good Feedback for bad Players? A preliminary Study of 'juicy' Interface feedback (Jesper Juul and Jason Scott Begy, DiGRA/FDG 2016). https://www.jesperjuul.net/text/juiciness.pdf
8. Juicy Haptic Design: Vibrotactile Embellishments Can Improve Player Experience in Games (Tanay Singhal and Oliver Schneider, CHI 2021, project page). https://uwaterloo.ca/haptic-experience-lab/projects/juicy-haptic-design-vibrotactile-embellishments-can-improve
9. Basic guidelines (Game Accessibility Guidelines). https://gameaccessibilityguidelines.com/basic/
10. Executing UX Animations: Duration and Motion Characteristics (Page Laubheimer, Nielsen Norman Group, 2020). https://www.nngroup.com/articles/animation-duration/
11. How to create high-performance CSS animations (Kayce Basques and Rachel Andrew, web.dev). https://web.dev/articles/animations-guide
12. Anatomy of a video game (MDN Web Docs). https://developer.mozilla.org/en-US/docs/Games/Anatomy
13. prefers-reduced-motion (MDN Web Docs). https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
14. Understanding SC 2.3.3: Animation from Interactions (W3C, WCAG 2.2). https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
15. Understanding SC 2.3.1: Three Flashes or Below Threshold (W3C, WCAG 2.2). https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
16. Web Audio API best practices (MDN Web Docs). https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
17. Audio for Web games (MDN Web Docs). https://developer.mozilla.org/en-US/docs/Games/Techniques/Audio_for_Web_Games
18. Understanding SC 1.4.2: Audio Control (W3C, WCAG 2.2). https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html
19. Audio Accessibility Features for Roguelikes (Josh Ge, Game Developer, 2020). https://gamedeveloper.com/audio/audio-accessibility-features-for-roguelikes
20. Page Visibility API (MDN Web Docs). https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
21. GDC 2012: 10 tutorial tips from Plants vs. Zombies creator George Fan (Tom Curtis, Game Developer, 2012) (secondary). https://gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan
22. The Impact of Tutorials on Games of Varying Complexity (Erik Andersen and others, CHI 2012). https://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf
23. Puzzmo co-creator Zach Gage on building newspaper games that can last forever (Chris Kerr, Game Developer, 2023) (secondary). https://www.gamedeveloper.com/design/puzzmo-co-creator-zach-gage-on-building-newspaper-games-that-can-last-forever
24. How we made Cannon Clash load fast and boosted conversion (Leonidas Maliokas, Poki blog, 2024). https://poki.com/blog/how-we-made-cannon-clash-load-fast-and-boosted-conversion
25. Loops and Arcs (Daniel Cook, Lostgarden, 2012). https://lostgarden.com/2012/04/30/loops-and-arcs/
26. Repository: `npm run build` and `npm run check:bundle`, run once on 2026-11-26. The link is the budget script.
27. Bundlephobia API, one request per library with `?package=<name>`, fetched on 2026-11-26. Values are minified+gzip bytes of the full package entry. https://bundlephobia.com/api/size
28. LittleJS README. https://github.com/KilledByAPixel/LittleJS
29. Preact home page. https://preactjs.com/
30. Lit docs. https://lit.dev/docs/
31. PixiJS v8 launch post. https://pixijs.com/blog/pixi-v8-launches
32. Phaser custom build guide (Phaser 3.50). https://github.com/Ryu204/phaser-custom-build
33. Svelte overview. https://svelte.dev/docs/svelte/overview
34. Repository files: `src/game/game-session.js`, `src/game/canvas-renderer.js`, `src/main.js`, `server/run-replay.js`, `index.html`, `tests/`, `vercel.json`. The link is the engine file.
35. MDN, `Math` reference (precision note). https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math
36. MDN, `<canvas>` element. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas
37. Game Accessibility Guidelines, full list. https://gameaccessibilityguidelines.com/full-list/
38. PixiJS accessibility guide. https://pixijs.com/8.x/guides/components/accessibility
39. PixiJS environments guide. https://pixijs.com/8.x/guides/concepts/environments
40. Svelte compiler warnings. https://svelte.dev/docs/svelte/compiler-warnings
41. MDN, shadow DOM guide. https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM
42. Phaser game concept page. https://docs.phaser.io/phaser/concepts/game
43. Excalibur random docs. https://excaliburjs.com/docs/random/
44. Phaser constants reference. https://docs.phaser.io/api-documentation/constant/phaser
45. Maze generation algorithm (Wikipedia). https://en.wikipedia.org/wiki/Maze_generation_algorithm
46. Verifying Maze-Like Game Levels With Model Checker SPIN (Tekik, Surer, Can; IEEE Access 10, 2022; abstract page). https://avesis.metu.edu.tr/publication/details/70f166dc-4b24-46e1-afd3-12b3979b91ee/verifying-maze-like-game-levels-with-model-checker-spin
47. fast-check docs, Why property-based? https://fast-check.dev/docs/introduction/why-property-based/
48. fast-check docs, Model based testing. https://fast-check.dev/docs/advanced/model-based-testing/
49. Hypothesis docs, Stateful tests. https://hypothesis.readthedocs.io/en/latest/stateful.html
50. Deterministic Lockstep (Glenn Fiedler, Gaffer On Games). https://gafferongames.com/post/deterministic_lockstep/
51. Determinism in League of Legends: Fixing Divergences (Riot Games). https://www.riotgames.com/en/news/determinism-league-legends-fixing-divergences
52. 1500 Archers on a 28.8 (Bettner and Terrano, Age of Empires). https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
53. Determinism in League of Legends: Introduction (Riot Games). https://www.riotgames.com/en/news/determinism-league-legends-introduction
54. MDN, `Math.random()`. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
55. MDN, `Math.imul()`. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul
56. PRNGs: mulberry32, sfc32, string seed hashes (bryc). https://github.com/bryc/code/blob/master/jshash/PRNGs.md
57. MDN, `for...in`. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in
58. MDN, `Array.prototype.sort()`. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
59. Don't trust the score (Gowtham R; developer write-up, prize game). https://dev.to/gowtham_r_2002/dont-trust-the-score-building-server-authoritative-validation-for-a-prize-based-mobile-game-246i
60. TMX Replay Investigation (donadigo, TrackMania). https://donadigo.com/tmx1
61. API4:2023 Unrestricted Resource Consumption (OWASP). https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption
62. How to fix leaderboard cheating and fake scores (Bugnet). https://bugnet.io/blog/how-to-fix-leaderboard-cheating-and-fake-scores
63. RFC 2104, HMAC (Krawczyk, Bellare, Canetti). https://www.rfc-editor.org/rfc/rfc2104
64. Commitment scheme (Wikipedia). https://en.wikipedia.org/wiki/Commitment_scheme
65. How Every Developer Knew All The Wordle Answers From Day One (Make:). https://makezine.com/article/maker-news/how-every-developer-knew-all-the-wordle-answers-from-day-one/
66. Glossary (TASVideos). https://tasvideos.org/Glossary
67. Steamworks docs, Leaderboards (Valve). https://partner.steamgames.com/doc/features/leaderboards
68. Mark of the Ninja's five stealth design rules (M. Kumar; talk by N. Anderson; Game Developer, 2012). https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules
69. FAQ Friday #70: Map Memory (Kyzrati, r/roguelikedev, 2018). [unverified]: search summary only. The input gives no URL.
70. Road to the IGF: Crypt of the NecroDancer (A. Wawro; interview with R. Clark; Game Developer). https://gamedeveloper.com/business/road-to-the-igf-brace-yourself-games-i-crypt-of-the-necrodancer-i-
71. The Pac-Man Dossier (J. Pittman). https://pacman.holenet.info/
72. Game Design Deep Dive: Alarm systems in Invisible, Inc. (J. Lantz, Klei; Game Developer, 2015). https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-
73. Unexplored's secret: cyclic dungeon generation (T. Thompson, Game Developer, 2021) (secondary; the design is by J. Dormans). https://gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-
74. How to Generate Perfect Mazes? (Bellot et al., LIMOS; preprint). https://perso.limos.fr/~palafour/PAPERS/PDF/labyrinthe.pdf
75. Design-Centric Maze Generation (Kim, Grove, Wurster, Crawfis; FDG 2019; abstract read). https://pcgworkshop.com/archive/kim2019designcentric.pdf
76. Think Labyrinth: Maze Algorithms (W. D. Pullen). https://www.astrolog.org/labyrnth/algrithm.htm
77. The Complexity and Difficulty of a Maze (M. S. McClendon, Bridges 2001). https://archive.bridgesmathart.org/2001/bridges2001-213.pdf
78. Rational Design: The Core of Rayman Origins (C. McEntee, Game Developer, 2012). https://www.gamedeveloper.com/design/rational-design-the-core-of-i-rayman-origins-i-
79. How to stop making hoarders in video games (J. Bycer, Game Developer, 2018). https://gamedeveloper.com/game-platforms/how-to-stop-making-hoarders-in-video-games
80. Extrinsically Integrated Instructional Quizzes in Learning Games (Jičínská et al., Frontiers in Psychology 12:678380, 2021). https://frontiersin.org/articles/10.3389/fpsyg.2021.678380/full
81. The Effect of Testing Versus Restudy on Retention (C. A. Rowland, Psychological Bulletin, 2014; DOI 10.1037/a0037559; full text read from a course copy). https://doi.org/10.1037/a0037559
82. Habgood and Ainsworth, Journal of the Learning Sciences 20(2), 2011, DOI 10.1080/10508406.2010.508029. [unverified]: three fetches fail; only a search summary supports the claims. https://doi.org/10.1080/10508406.2010.508029
83. Hello Rogue v1.01 devlog (One-bit Punch; small game, weak evidence). https://onebitpunch.itch.io/hello-rogue/devlog/200957/hello-rogue-v101
84. Mechanical Dissonance and setting player expectations (H. Pink, Game Developer, 2013). https://gamedeveloper.com/design/mechanical-dissonance-and-setting-player-expectations
85. Stuck in the Middle: Generating Levels without (or with) Softlocks (S. Cooper, M. Bazzaz; FDG 2025; DOI 10.1145/3723498.3723844). https://doi.org/10.1145/3723498.3723844
86. Issues With Turn Limits in Puzzle Games (J. Holm, Critical Cycle, 2020) (counter-evidence). https://criticalcycle.blogspot.com/2020/09/issues-with-turn-limits-in-puzzle-games.html

## Limits

- A small model summarises each page that Question 2 cites. Each Question 2 statement is a summary-level paraphrase.
- The KAPLAY guide index and the Excalibur docs give no statement on accessibility, Node use, or determinism of the loop.
- One web search finds no first-party migration postmortem. A candidate blog post returns HTTP 404, so this note cites no postmortem.
- The tree-shaken PixiJS size and the Svelte application runtime size stay [unverified].
- The bundle values come from one build on 2026-11-26 at `bac960e`. A later commit can change them.
- Source [81](https://doi.org/10.1037/a0037559) comes from a course copy of the article. Source [46](https://avesis.metu.edu.tr/publication/details/70f166dc-4b24-46e1-afd3-12b3979b91ee/verifying-maze-like-game-levels-with-model-checker-spin) comes from an abstract page, and [75](https://pcgworkshop.com/archive/kim2019designcentric.pdf) from an abstract.
- Sources [82](https://doi.org/10.1080/10508406.2010.508029) and [69](#sources) rest on a search summary only. Source [69](#sources) has no URL in the input, so its link points to this list.
- Repository sources [26](../../scripts/check-bundle-budget.mjs) and [34](../../src/game/game-session.js) link to a repository file, not to a web page.
- The Question 3 input lists "Desynchronization" (Factorio Wiki). No claim cites it, so this note omits it.
- No fetched source describes a daily-seed design with one ranked attempt and a hidden seed. The Question 3 design is a composition.
- No measured time budget exists for the replay of a maximum-length Run Action Log.
- The loop density, Trail Twist count, par, and Vitality recovery gains rest on inference. A playtest must confirm each of them.
- The Pac-Man transfer to a turn-based game is an inference, because Pac-Man is real-time.
- Each Fit line is analysis of the repository at one commit. This research does not re-run the audit numbers.
