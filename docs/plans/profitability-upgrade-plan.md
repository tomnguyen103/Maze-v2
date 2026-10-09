# Echo Maze upgrade plan: own identity, first revenue, one price

Status: approved by the owner on 2026-10-08 with every recommendation adopted.
Section 13 records the decisions. Section 14 tells the next session where to start.
The product name becomes Lantern Maze in Phase 1 PR 1; this document keeps the
current name until that PR merges.

## 1. Verdict

The product is built. The business is not switched on.

- Revenue today is $0. Stripe is unconfigured, Run Access enforcement is off, and
  migrations `0018` to `0030` are not applied to the live database.
- The Journey design system copies the WebGemma signature. `design.md` names the
  reference by URL and lists its elements as our own.
- The app has no funnel metrics, no distribution channel, and a name that eight
  other games already use on itch.io.

The plan has four phases and one constraint: one price, `$5.99 USD` once.

| Phase | Outcome | Who does the work | Size |
| --- | --- | --- | --- |
| 1. Own identity | A visual identity that is ours, on the same token pipeline | Claude, pipeline run | 2 PRs |
| 2. First dollar | Live checkout, enforcement on, readiness 200 | Owner operations, Claude scripts | 0 to 1 PR |
| 3. Funnel | Landing and paywall copy that sells to the payer, plus funnel counts | Claude, pipeline run | 2 PRs |
| 4. Distribution | Assets and a channel list ranked by evidence | Owner posts, Claude prepares | docs and assets |

Phase 1 and Phase 2 run in parallel. Phase 2 needs the owner's accounts, not code.
Phase 4 starts only after Phases 1 to 3 ship.

## 2. Where the app stands

Evidence from the live probes and the repository on 2026-10-08.

| Surface | Result | Meaning |
| --- | --- | --- |
| `/api/health` | 200, version `e687d39` | The latest main is deployed. |
| `/api/ready` | 503, `stripe: unconfigured` | Production readiness fails. |
| `/api/access/config` | `enforcementEnabled: false` | Every Run is free. |
| `db/migrations` | `0018` to `0030` unapplied | Verified Daily, Class Expeditions, offline continuity, and debrief tables are missing live. |
| `api/` | 12 functions | The Vercel Hobby function ceiling is full. New routes must reuse a function through `vercel.json` rewrites. |
| Test gate | 1,474 Vitest tests, 248 Playwright tests | The core is covered. A rebuild of working logic adds risk and no revenue. |

Repository docs that this plan extends: `docs/roadmaps/echo-maze-current-status.md`,
`docs/release-readiness.md`, `docs/lifetime-membership-operations.md`,
ADR 0007 (Lifetime Membership), and ADR 0030 (Class Expedition License).

## 3. Research: what the tools found

### Agent-Reach

[Agent-Reach](https://github.com/Panniantong/Agent-Reach) is installed in an isolated
`uv tool` environment, outside this repository. The safe-mode check reports 4 of 16
channels: Jina Reader (web), RSS, V2EX, and Bilibili. `yt-dlp` works with
`--js-runtimes node`. These channels produced the YouTube, Product Hunt, Hacker News,
and GitHub evidence below.

Channels that need more setup:

- Reddit returns 403 without a logged-in account. Both `reddit.com` and `old.reddit.com`
  block Jina Reader.
- X needs cookies from a secondary account.
- Exa web search needs `mcporter`, which the `--system` install adds globally.

The `--system` install also writes a `SKILL.md` into the agent skills directory. It did
not run. Decision D6 covers it. The free channels were enough for this plan.

### Competitor prices

| Product | Price | Model |
| --- | --- | --- |
| Blooket Plus | $4.99/mo annual ($59.88/yr), $9.99 flex | Subscription |
| Gimkit Pro | $4.99/mo annual, $14.99 flex; Dept $650/yr; School $1,000/yr | Subscription |
| Kahoot | about $36 to $228/yr | Subscription |
| Prodigy parent membership | $9.95 to $19.95/mo ($58.95 to $118.95/yr); teachers free | Subscription, teacher-led funnel |
| Echo Maze | $5.99 once | One payment |

Every competitor charges a subscription. "No subscription" is the pitch. A parent
review video titled "Educational Math Apps for Kids, No Subscriptions Required!" has
88,075 views. That audience exists and searches for exactly this.

Sources: [Blooket pricing](https://www.blooket.com/plans),
[Gimkit pricing](https://www.gimkit.com/pricing),
[Prodigy memberships](https://www.prodigygame.com/main-en/membership),
[Kahoot plans](https://kahoot.com/schools/plans/).

### Channel evidence

| Channel | Evidence | Verdict |
| --- | --- | --- |
| YouTube parent reviewers | "Best math apps" videos: 88k, 50k, 22k, 18k views. Prodigy's own parent video: 1.2M. Reviewers: eSchooled with Amanda Melrose, Kids Learning for Life, Susan Jones Teaching. | Primary. Send review access. |
| YouTube Shorts and TikTok | Kids quiz clips reach 1M to 2.4M views on small channels. | Primary. Gameplay clips cost little. |
| Teacher communities (TPT, Facebook groups) | 83% of teachers use AI tools; Prodigy grows through free teacher accounts that pull parents in. | Primary. Teacher invite, parent pays. |
| Homeschool groups and newsletters | 3.4M to 4.3M homeschool students; growth slows to 1.5%. "Homeschool apps" videos: 120k, 52k, 26k views. | Secondary. |
| ESA marketplaces (Odyssey, ClassWallet, Step Up) | Per-state vendor approval. Texas lists vendors at no fee. ClassWallet takes an unpublished percentage. Prodigy is an approved vendor in Arizona. | Later. Zero cost to list, long approval. |
| Product Hunt (education feed) | AI tutors dominate the feed. No kids' game in the top 15 today. | One launch day, low expectation. |
| Hacker News Show HN | Comparable kids' apps peak at 12 points. | Skip. |
| itch.io | 90% revenue share, but eight games named "Echo Maze" already sit there, and the audience is indie gamers, not parents. | Skip. |
| Poki, CrazyGames | 50/50 ad split, ads in a kids' app, 8 MB cap, 16:9 only. | Skip. Ads conflict with the no-ads privacy posture and the one price. |
| Discord Activities | 10% cut, high failure rate, teen audience. | Skip. |
| Reddit (r/homeschool, r/Teachers) | Blocked to tools. Manual posts only. | Owner choice. |

Sources: [Kids Learning for Life review](https://www.youtube.com/results?search_query=Educational+Math+Apps+for+Kids+No+Subscriptions+Required),
[ESA vendor guide 2026](https://edubracket.com/articles/how-to-become-an-esa-approved-vendor-2026),
[ClassWallet vendor page](https://classwallet.com/why-joining-classwallet-as-a-vendor-is-a-smart-business-move/),
[Step Up For Students vendors](https://www.stepupforstudents.org/schools-and-providers/vendors/),
[Prodigy ESA funds](https://www.prodigygame.com/main-en/homeschoolers/grant-funds),
[Product Hunt education feed](https://www.producthunt.com/feed?category=education),
[Echo Maze name collisions on itch.io](https://kamilragam.itch.io/echo-maze).

### Trends that shape the plan

- Parents put privacy first. 86% back restrictions on children's data. No ads, no
  third-party analytics, no child email.
- About 3 in 4 parents support learning games in school. The teacher path is a parent
  acquisition path.
- Gemini 3.8 Flash costs $0.75 per million input tokens and $3.75 per million output
  tokens until 2026-12-31. The price doubles on 2027-01-01. The database question bank
  must carry the load before then.
  Source: [Gemini 3.8 Flash pricing](https://eesel.ai/blog/gemini-3-8-flash-pricing).

## 4. Phase 1: own identity

### Diagnosis

`design.md` lines 8 to 10 state that the look "follows the WebGemma journey reference"
and list its elements. The live page confirms the match:

| WebGemma element | Echo Maze today | Action |
| --- | --- | --- |
| Sky-tinted grid paper ground | `--color-paper` sky tint plus a 24px grid | Replace |
| Pastel colour blobs behind the hero | Sky, mint, pear, lilac blobs on landing and Atlas | Replace |
| Floating islands joined by rope bridges | Echo Atlas islands and rope bridges; canvas bridges with rope planks | Replace |
| Glass header with blur | `.command-bar` glass header | Replace |
| Pill tab strip in the header | Pill section strips on dashboard and Classroom | Replace |
| Zoom-and-pan island timeline | Atlas journey map | Keep the map, change the drawing |

### Keep

White panels with a 1px line, the five Region Hues, the 4-point spacing scale, the
radius scale, 44px touch targets, WCAG AA pairs, the Hallmark bans, the Night theme
contract, the `tokens.css` single export, and the fonts (Bricolage Grotesque display,
Geist body, Geist Mono numbers). The fonts are not the problem. The ground, the
texture, the illustration grammar, and the header are.

### Direction A: Field Journal (recommended)

The world is the Explorer's own journal. The fiction already has Echoes, lanterns,
Wardens, Gates, and the Echo Atlas. The visual grammar follows that fiction, not a
model timeline.

- **Ground**: warm cream paper, `oklch(97% 0.012 85)`, with a faint ruled-line texture
  in CSS, not a grid. Night keeps the deep indigo ground.
- **Ink**: warm charcoal, `oklch(28% 0.02 60)`. Lines are drawn, not bordered: 1.5px ink
  rules with rounded ends.
- **Accent**: one lantern amber, `oklch(76% 0.15 70)`, for the primary action and the
  active Echo. Sky moves from primary to Windcall's Region Hue only.
- **Region Hues**: the same five hues as ink washes behind map regions, not blobs.
- **Atlas**: an inked trail map. Each Atlas Region is a drawn territory with a compass
  rose, dotted trail segments, and a flag at the Gate. No islands, no rope bridges.
- **Header**: solid paper bar with a single ink rule. Section navigation is an underline
  tab, not a pill.
- **Cards**: paper cards with a torn-edge mask only on the landing hero, flat elsewhere.
- **Labyrinth canvas**: known tiles as paper with a wash; walls as ink-hatched blocks;
  Echo Bridges as drawn plank lines; Wardens unchanged in shape, re-inked.
- **Landing**: one hero with a drawn Labyrinth fragment, the price line, and the
  no-subscription line.

Direction B, one sentence: a Night Expedition ground with lantern pools of light reads
well but fights the Hallmark glow ban and the daytime classroom use, so A wins.

### Process and gates

- Modification-scale pipeline: `/grill-with-docs` with design-recon, `/to-spec`,
  `/to-tickets`, `/implement`, `/audit-loop`, then `pr-workflow`. No TDD on a restyle.
- `stitch-pipeline` runs first with the existing Stitch project `3244739478942983822`.
  `design.md` and `tokens.css` are rewritten, and `.hallmark/log.json` is committed.
- The impeccable detector gates every UI PR:
  `node ~/.claude/skills/impeccable/scripts/detect.mjs --json <paths>` must exit 0.
- Browser proof: desktop and mobile screenshots through the browser MCP for landing,
  game, Atlas, dashboard, and Classroom, in light and Night.
- The bundle gate holds. Shared styles stay under 12 KB gzip, so textures are CSS
  patterns and inline SVG, never raster images.

### Files

| PR | Files | Content |
| --- | --- | --- |
| 1 | `tokens.css`, `design.md`, `src/daylight.css`, `index.html` | Tokens, ground, header, landing hero |
| 2 | `src/game/quest-atlas.css`, `src/game/region-theme.css`, canvas palette, `src/admin/admin.css`, `src/classroom/classroom.css` | Atlas map, canvas re-ink, dashboard and Classroom strips |

### Rename

Eight games on itch.io carry the name "Echo Maze". A parent who searches the name
finds them first. The new name is **Lantern Maze** (D1). It keeps "Maze" for
continuity and search, and "Lantern" already lives in the glossary through the
Lantern Journal and the Practice Lantern. RDAP reported `lanternmaze.app` and
`lanternmaze.com` unregistered on 2026-10-08. The owner registers the domain; the
registrar check is the final word, and `mazelight.app` is the fallback name.

The rename lands inside Phase 1 PR 1 and touches the wordmark, `<title>`, the web
manifest, `GLOSSARY.md`, `design.md`, the package name, the Clerk application name,
the Stripe Product name, the Vercel project, the repository name, and the docs.
Code identifiers such as `ECHO_MAZE_APP_ORIGIN` and the `echo-maze-export/3` schema
keep their names: a rename there breaks live configuration and persisted data for
no revenue.

## 5. Phase 2: first dollar

These steps are in order. Each one is operator work on the owner's accounts, and
Claude prepares the commands and checks the result.

1. Move the Vercel project to Pro. The Hobby plan forbids commercial use.
   Source: [Vercel fair use policy](https://vercel.com/docs/limits/fair-use-guidelines).
2. Apply migrations `0018` to `0030` to the production Neon branch through the Neon MCP,
   after a snapshot. Run the live Classroom integration subset against it.
3. Activate the Stripe account. Create the live Product and the `$5.99 USD` one-time
   Price. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and
   `ECHO_MAZE_APP_ORIGIN` on Vercel. Names only appear here, never values.
4. Generate and deploy the offline receipt keys. Configure Verified Daily and confirm
   `/api/daily/leaderboard` returns 200.
5. Set `RUN_ACCESS_ENFORCEMENT_ENABLED=true`. Confirm `/api/ready` returns 200.
6. Run the live purchase-and-refund smoke test. The owner enters the card. Claude never
   enters payment data.
7. Run the manual assistive-technology acceptance session from `docs/release-readiness.md`.
8. Publish the refund, privacy, deletion, and support pages. A children's product
   needs a COPPA position: accounts belong to a parent or a teacher, and the app
   stores no child contact data. This is a legal review item, not engineering.

Code impact: at most one small PR for a readiness-check script and the policy pages.

## 6. Phase 3: funnel at one price

The funnel exists: one guest demo Run, sign-in, three free Runs, then the
`$5.99 USD` Lifetime Membership. ADR 0007 stays as written. The changes are copy,
timing, and measurement.

- **Landing copy** speaks to the payer. Today the h1 is the name and the lead is the
  mechanic. The new lead: twenty Labyrinths, reviewed questions, `$5.99` once, no
  subscription, no ads. The mechanic moves to the second block.
- **Paywall moment** stays at the Run start after the third free Run. The dialog names
  what the Explorer keeps: the Echo Atlas, the Run Records, and the Lantern Journal.
  One decision per view, as `design.md` requires.
- **Teacher invite** becomes the classroom path at one price. A Teacher runs Class Play
  on free Runs and sends a parent link. The parent buys the Lifetime Membership for
  the Explorer. The Class Expedition License (ADR 0030) stays deferred (D3).
- **Funnel counts** come from the existing product events in `server/product-events.js`:
  guest demo decisions, sign-ups, free Run decisions, checkouts opened, confirmations.
  A SQL view and metric cards on the admin dashboard show the five counts per day. No
  PostHog, no third-party script, no child-level data.
- **Question cost** stays near zero. The question bank in PostgreSQL serves Runs first.
  Gemini generation fills the bank in batches before 2027-01-01.

Two PRs: one for landing and paywall copy, one for the funnel view and the teacher
invite link.

## 7. Phase 4: distribution

Claude prepares the assets. The owner posts them. Sends to third parties need the
owner's explicit permission each time.

1. Six gameplay clips, 15 to 30 seconds, vertical, no child faces. Targets: YouTube
   Shorts and TikTok.
2. One review-access note and a free Lifetime Membership code for ten parent reviewers,
   starting with the channels in section 3.
3. One teacher invite post for Facebook groups and TPT, with the Class Play demo link.
4. One Product Hunt page on a weekday.
5. ESA vendor applications for Texas (Odyssey, no fee) and Florida (Step Up) after
   thirty days of live sales.

## 8. Unit economics at one price

| Item | Amount |
| --- | --- |
| Gross per sale | $5.99 |
| Stripe fee, 2.9% + $0.30 | $0.47 |
| Net per sale | $5.52 |
| Vercel Pro | $20.00/month |
| Neon | $0 to 0.5 GB per project |
| Clerk | $0 to 10,000 monthly active users |
| Sentry | $0 on the developer plan |
| Gemini generation per question | about $0.002 at current rates |
| Break-even | 4 sales per month |
| 100 sales per month | $552 net, $532 after Vercel |

A one-time price means revenue grows only with new families. Each sale is final.
This is the structural cost of the one-price constraint. The plan respects it. A
review at ninety days of live sales decides whether a second price returns to the table.

Sources: [Vercel pricing](https://vercel.com/pricing), [Neon pricing](https://neon.com/pricing),
[Clerk pricing](https://clerk.com/pricing), [Stripe pricing](https://stripe.com/pricing).

## 9. What changes, what stays, what we do not rebuild

**Changes**: visual identity, landing and paywall copy, funnel metrics, go-live
configuration, distribution assets, and the name if D1 says yes.

**Stays**: the deterministic Labyrinth core, server-authoritative Run Access, the
Stripe `payment` mode flow, Clerk, Neon, the 12-function API layout, the test gate,
GLOSSARY terms, and ADRs 0007 and 0030.

**Not rebuilt**: no framework migration, no React, no subscription, no ads, no second
price, no new backend. The core passes 1,474 tests and earns nothing today because it
is switched off, not because it is wrong. A rebuild delays the first dollar and adds
regression risk for zero revenue.

## 10. Sequence and timeline

| Week | Lane A: Claude | Lane B: owner operations |
| --- | --- | --- |
| 1 | Decisions D1 to D7. Phase 1 grill, spec, tickets. PR 1. | Vercel Pro, Neon snapshot and migrations, Stripe live Product and Price. |
| 2 | Phase 1 PR 2. Phase 3 grill and spec. | Keys, Verified Daily, enforcement on, smoke purchase and refund, AT session. |
| 3 | Phase 3 PR 1 and PR 2. | Policy pages reviewed. |
| 4 | Phase 4 assets. | Posts and reviewer outreach. |
| Day 30 and day 90 | Funnel review against section 11. | Price review per section 8. |

CodeRabbit refills about one review per forty minutes, so PRs stay small and ship
one at a time. Every PR passes `npm run check`, the browser matrix for UI changes,
and the impeccable detector.

## 11. Success metrics

| Metric | Day 30 | Day 90 |
| --- | --- | --- |
| `/api/ready` | 200 | 200 |
| Live sales | 20 | 150 |
| Guest demo to sign-up | 20% | 25% |
| Sign-up to paid | 5% | 8% |
| Impeccable detector on UI diffs | exit 0 | exit 0 |
| Shared styles bundle | under 12 KB gzip | under 12 KB gzip |

## 12. Risks

- COPPA and children's privacy: the legal review in Phase 2 step 8 gates the public push.
- Stripe activation needs the owner's business details and can take days.
- The one-time price caps revenue per family. Section 8 names the ninety-day review.
- The name collision stays if D1 says no.
- Gemini doubles in price on 2027-01-01. The question bank fills before then.
- The 12 KB style budget limits texture. Direction A is designed for CSS patterns.
- App store packaging adds a 15% to 30% platform fee and kids-category rules. It is out
  of scope (D5).

## 13. Decisions recorded on 2026-10-08

| Decision | Outcome |
| --- | --- |
| D1 Rename | Yes. The product becomes Lantern Maze. Domain `lanternmaze.app`, fallback `mazelight.app`. |
| D2 Direction | Direction A, Field Journal. |
| D3 One price | `$5.99 USD` once stays the only price. The Class Expedition License stays deferred. The classroom path is "teacher invites, parent buys". |
| D4 Go-live | Authorized: Vercel Pro, migrations `0018` to `0030`, the live Stripe Product and Price, enforcement on, and the smoke purchase. The owner performs the account, billing, and card steps. |
| D5 App stores | Out of scope. |
| D6 Agent-Reach `--system` | Declined. The isolated install stays as it is. |
| D7 Channels | YouTube parent reviewers, Shorts and TikTok, and teacher communities. The other channels wait for the day-30 review. |

## 14. Next session: start here

The next session implements Phase 1 PR 1. Read `GLOSSARY.md`, `design.md`,
`tokens.css`, and sections 4 and 13 of this plan first.

1. Open with `Pipeline: feature — /grill-with-docs` at modification scale, no TDD.
   The grill covers the rename, the Direction A tokens, the ground, the header, and
   the landing hero. Done when the grill rounds print in full in chat.
2. Write `.scratch/lantern-maze-identity/spec.md` and one ticket per slice under
   `.scratch/lantern-maze-identity/issues/`. Done when the entry gate line prints.
3. Branch `feat/lantern-maze-identity` off fresh `main`. Run `stitch-pipeline` with
   design-recon against Stitch project `3244739478942983822`, then `/implement`.
   Done when `design.md`, `tokens.css`, `src/daylight.css`, and `index.html` carry
   Direction A and the Lantern Maze name, and `.hallmark/log.json` is updated.
4. Run `/audit-loop`, then the UI gate: the impeccable detector exits 0 on every
   changed UI path, desktop and mobile screenshots exist for landing and game in
   light and Night, and `npm run check` is green.
5. Open the PR through `pr-workflow`, with a CodeRabbit review, and merge. Done when
   `main` carries the merge and the branch is deleted on both sides.

Phase 1 PR 2 follows the same five steps for the Atlas, the canvas, the dashboard,
and the Classroom. Phase 3 follows after Phase 1 merges. Section 10 holds the order.

Lane B runs in parallel and belongs to the owner: section 5 lists the eight steps in
order. The session prepares each command and checks each result, and the owner
performs every account, billing, and card action.
