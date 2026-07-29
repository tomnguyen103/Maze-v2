# 0026: Version regional gameplay as Trail Twists

- Status: Accepted
- Date: 2026-07-28

Living Regions combines a presentation-only Region Theme with a deterministic
Trail Twist gameplay layer. Trail Twists is the only place regional mechanics
may change Run behavior; Atlas projection, rendering, sound, and theme code
cannot hide gameplay changes. Every shipped Twist carries an explicit ruleset
revision through active Run identity, Active Run Recovery, Run Records, shared
links, and any applicable Daily or server replay contract. This keeps Living
Regions mechanically distinctive without creating two overlapping regional
rule systems or weakening Question, Hint, Skip, Vitality, score, and Run Access
contracts. All five concrete Twists in this ADR are accepted production
commitments. Each still requires its own paper prototype, compatibility proof,
and tuning evidence before implementation; those gates may revise the mechanic
but cannot cancel the Region or its Trail Twist.

Each Region Theme includes one authored ambient sound layer. It starts only
after an explicit Sound On action, pauses wherever the Run pauses and while the
tab is hidden, and stops immediately with Sound Off. Ambient audio never carries
the only warning, clue, Trail Twist state, or Warden-mode signal. Trail Compass
remains complete without it, and its directional tones still require a separate
Listen action. First Light uses only universal sounds.

Each Region also has one authored Warden Guild appearance. Patrol, Hunt,
Intercept, and Lured retain universal glyphs and text labels across every Guild,
and every Gate Warden retains one universal boss marker. Color is never the only
mode signal. Regional art cannot change collision geometry, timing, pathfinding,
or imply an ability absent from the canonical mode; Trail Compass announces the
same canonical names.

The Region's Gate Warden receives a short, skippable entrance beat that pauses
the Run without changing elapsed time or state. Escaping the Region triggers one
short authored Sigil ceremony. Its full form plays once per Region in the active
Quest; repeat Runs use a compact result. Reduced Motion replaces animation with
a static transition, Sound remains optional, and skipping has no penalty. The
restored Atlas landmark is the only lasting result—no currency, inventory, or
additional gameplay reward is created.

Exactly one fixed, authored Trail Twist belongs to each of the five Atlas
Regions. The Twist remains stable across that Region's four Labyrinths and may
escalate toward its Gate Warden; it is never randomly rotated or selected from
a player-facing rules menu.

Trail Twists begin in the first normal Quest. First Light teaches universal
rules without a regional Twist, Region 1 introduces the simplest Twist at
Labyrinth 1, and legacy Records or shared links that lack a ruleset revision
retain Classic Rules.

The accepted Region 1 Twist is **Echo Hush**: when an Explorer action collects
an Echo, ordinary Wardens skip their movement step for that action only.
Movement returns to normal on the next action. Echo Hush changes no Question,
Vitality, Pulse, score, or Gate Warden Challenge rule.

The accepted Region 2 Twist is **Windways**: a small deterministic set of
visibly directional passage tiles carries the Explorer one additional legal
tile. Its destination is visible before entry, the travel counts as one action,
and Wardens move once after it finishes. Windways never chain, and their source
tiles never overlap the start, Gate, Echoes, or initial Wardens.

The accepted Region 3 Twist is **Echo Bridges**: each Echo is paired
deterministically with one visible sealed shortcut. Collecting that Echo
permanently opens its Bridge for both Explorer and Warden pathfinding. Bridges
only add edges to an independently solvable base Labyrinth; they never close or
remove its paths.

The accepted Region 4 Twist is **Tide Doors**: deterministic optional shortcut
edges alternate between open and sealed. A successful movement or Pulse action
resolves Explorer and Warden movement against one shared visible phase, then
toggles the Doors for the next action. Questions, Hints, pauses, and blocked
inputs do not advance them, and the base Labyrinth stays connected with every
Door sealed.

The accepted Region 5 Twist is **Warden Bells**: a small deterministic set of
one-use Signal Bells exposes a Ring Bell action while the Explorer is adjacent.
Ringing spends one action and Move. Ordinary Wardens enter a visible one-action
Lured state and move one step toward the Bell, which then becomes spent; normal
modes return on the next action. Hidden Warden positions and Gate Wardens remain
unaffected.

This ADR supersedes ADR 0001 only where that decision limits Warden Mode to
Patrol, Hunt, and Intercept. Warden Bells adds Lured as a deterministic,
player-triggered, one-action mode; it does not change the three normal tactics.

Verified Daily remains on Classic Rules and Run Action Log version 1. Trail
Twists do not enter its competitive contract; any future Daily support requires
a new replay protocol version and separate compatibility decision.

Shared casual Score Entries follow ADR 0037: rankings, best-entry replacement,
and Global Max Score never compare different Region/ruleset revisions. Legacy
entries remain on the Classic Rules board.
