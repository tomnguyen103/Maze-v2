# Echo Maze rebuild v3: one price, zero upkeep

Status: plan, revision 3. Implementation starts only after the owner replies "approved".
Date: 2026-10-10. Base commit: `17a982c`.
This plan replaces `docs/plans/profitability-upgrade-plan.md` (programmes F1 to F4, approved 2026-10-08) wherever the two conflict.

Sources: `GLOSSARY.md`, `DESIGN.md`, ADR 0001 to 0050, `docs/solutions/`, the research files under `.scratch/rebuild-v3/research/` (`app-audit.md`, `market.md`, `visual-refs.md`), 26 desktop and mobile screenshots of the running app, and provider pages read on 2026-10-09 and 2026-10-10: the Stripe API reference (webhook endpoint update), the Managed Payments pages (overview, how it works, eligibility), Neon pricing, Workers pricing and limits, Durable Objects pricing, Workers rollbacks, the deployments API, Workers Builds GitHub integration, Email Workers. A figure with no primary source carries `[unverified]`; a model assumption `[assumption]`; a reading between two documented facts `[inference]`. This plan invents no revenue figure.

Terms follow `GLOSSARY.md`: Explorer, Labyrinth, Run, Echo, Gate, Warden, Vitality, Pulse, Fog, Trail Twist, Echo Atlas, Region, Lifetime Membership, Financial Fact, Funnel Count, Daily Shared Labyrinth. Slice S05 rewrites the Lifetime Membership entry to the Run Key; S07 and S08 rewrite Echo Atlas, Region, Trail Twist, and Daily Shared Labyrinth. New terms: **Run Key** (the credential for one Lifetime Membership), **Share String** (the spoiler-free text pasted after a Run), **Seed Link** (a signed URL that opens one Labyrinth), **Ops Tick** (the hourly repair function in the app), **Sentinel** (a dependency-free Worker that probes the app every five minutes and holds the rollback and alert powers), **Checkout Pause** (the game runs, checkout refuses), **Probation** (a new deployment's first fifteen minutes), **Deploy Freeze** (only a build with the green lock file passes), **Pin** (a Renovate rule that holds one package at its green version), **Green History** (the last ten deployments that passed Probation).

## 1. Verdict

Rebuild. Keep the seeded generator, the Run rules, and the Stripe money path. Delete about three quarters of the code. Replace accounts with a Run Key. Replace the learning identity with a general-audience daily fog maze. Move hosting from Vercel to Cloudflare Workers, with Vercel Pro as the documented fallback. Replace every human operation with an automatic one, or remove the surface.

### 1.1 Why the current build cannot earn with zero upkeep

- **Eighteen human surfaces.** The audit lists 18 parts that need the owner: a 12-step launch runbook, a two-flag pilot gate, purchase classification, dead-webhook recovery, receipt recovery, refunds, disputes, refunded-account restore, admin grants, question review, Classroom support, a public email domain list, audit checkpoints, a constellation prune, break-glass deletion, secret rotation, paid-service renewal, and launch records (`app-audit.md` §3).
- **No usage evidence for 20 features.** PostHog records only three money events. Classroom (19,864 lines), offline continuity with its service worker (7,653 lines), the admin workbench (3,269 lines), Class Expedition (2,249 lines), and Verified Daily replay (1,704 lines) have no retention or revenue evidence (`app-audit.md` §4).
- **Silent failures.** A deferred webhook answers 200, so Stripe never redelivers `[inference]`. The inbox retries once a day, five times, then marks the row dead and deletes it after 30 days. A paid Explorer without access is then a support ticket (`app-audit.md` §8).
- **The learning frame costs more than it earns.** It adds COPPA scope, a hand-authored question deck, and a comparison with free products. No source shows a one-time parent price (`market.md` Q5).
- **The look reads as templated.** The landing page is a two-column hero, three equal cards, and a pricing card. The play screen is a three-column SaaS dashboard with a 430 px Labyrinth. Every feature opens a modal (`visual-refs.md` §1, screenshots).
- **The fixed cost sits on one paid seat.** Vercel Pro costs $20 per month for a static client and a handful of functions. Cloudflare serves static assets free without a request cap and runs the functions inside its free Workers quota (§3.5).

### 1.2 What v3 is

A free Daily Shared Labyrinth on the front page, the same for every player, with a Share String. One $5.99 Run Key unlocks Free Play, the Echo Atlas, Trail Twists, larger Labyrinths, and the archive. The server is one Worker with five routes and an hourly Ops Tick, plus a Sentinel Worker under 300 lines with no dependencies. No accounts, no hand-authored content, and the client runs without the server once a Run Key is active.

| Measure | Today (`17a982c`) | v3 target |
| --- | --- | --- |
| Client lines (`src/`) | 37,723 | under 9,000 |
| Server lines (`server/`, `api/`, `shared/`) | 20,763 | under 3,000, plus the Sentinel under 300 |
| Database tables | 37 | 4 |
| Third-party services | Vercel, Neon, Clerk, Stripe, S3, Sentry, PostHog, OTLP | Cloudflare, Neon, Stripe, Sentry, GitHub with Renovate |
| Human operations after launch | 18 | 0 routine; alert email only |
| Fixed monthly cost | Vercel Pro plus unknown extras | about $1 on Cloudflare Free; about $21 on the Vercel fallback |

### 1.3 What v3 does not do

It has no accounts, no leaderboard, no multiplayer, no classroom, no learning content, no seasonal content, no mobile store build, and no admin screen. Each needs a human after launch. A future owner can add any of them on top of the Run Key and the Daily.

## 2. Positioning

### 2.1 Target player

An adult who plays a daily web puzzle on a phone or a laptop, on the Wordle, NYT Games, Puzzmo, or Clues by Sam habit, and who buys small premium games at $4.99 to $5.99 on Steam or itch.io. The market file shows both groups: daily free puzzles grow by share text, and five $4.99 titles carry 3,000 to 266,000 Steam reviews (`market.md` Q1, Q4).

The player is not a child, a parent who buys learning software, or a teacher. Those segments need content upkeep and compliance work.

### 2.2 One-line hook

"One fog-covered Labyrinth a day, the same for everyone. Sound it out, find every Echo, and reach the Gate in the fewest soundings."

### 2.3 Name

Keep **Echo Maze**. Under the Pilot Chart art direction, an echo is an echo sounding: the Explorer sounds the Fog as a pilot sounds a coast. The name needs no new domain, no new Stripe product, and no change to existing receipts. The product has no public sales yet, so the name carries no equity to lose either way.

Three alternatives, in order, if the owner prefers a rename: **Soundings** (the chart term for depth marks; fits the score), **Fogline** (the line where the chart stops; short and ownable), **Leadline** (the rope the pilot drops to sound the depth; obscure, so it ranks last).

Drop the **Field Journal** identity, the **Lantern Journal**, the **Quest** names (Bright Start, Trail Scout, Maze Master), and the **Warden Challenge**. Keep the five Region names of the Echo Atlas as light characteristics (§6).

## 3. Single-price economics

### 3.1 Price and unlock

The price stays at $5.99 USD once, `LIFETIME_AMOUNT = 599` in `shared/lifetime-product.js`, and one Stripe Price, named by `LIFETIME_PRICE_ID`, is the single line item of every Session. The market file supports $4.99 to $5.99; $5.99 tops the band with Townscaper as precedent (`market.md` Q3), and a lower price raises the fixed $0.30 card fee as a share of each sale. No tier, subscription, ad, second price, or discount schedule. Adaptive Pricing presents the price in the buyer's currency, so the gross per sale varies with the exchange rate (Stripe, how it works).

The purchase is one Lifetime Membership. Its credential is a Run Key, a 12-character code in the form `EM-XXXX-XXXX-XXXX`. The Run Key unlocks:

- Free Play: any seed, a random seed, Labyrinth size 9 to 25, any Trail Twist.
- Echo Atlas: five Regions, 20 seeded Labyrinths each, with a difficulty ladder.
- The archive: every past Daily, with its par and the player's marks.
- Share card image and the progress code (§5.6).

### 3.2 Free-to-paid boundary

| Surface | Free | Run Key |
| --- | --- | --- |
| Daily Shared Labyrinth | yes, unlimited Runs within the day | same |
| A past Daily by link, `/d/<date>` | the last 7 days, for anyone who holds the link | every day, plus the archive browser |
| Seed Link, `/s/...` | open any; make three per UTC day, signed by the Worker | make unlimited |
| Legend (the tutorial) | yes | yes |
| Free Play, Echo Atlas, Trail Twists, size 9 to 25 | locked; the Labyrinth shows under Fog with the unlock line | yes |
| Share String | yes | yes |
| Share card image, progress code | no | yes |

The free boundary lives in `localStorage`; a player who clears storage gets the allowance again. This is the Townscaper web demo model: no server metering, no address hash, no guest table. The money gate is the Run Key check, not the free counter. The Daily seed is `daily-<date>` and the bundle holds the generator, so a code reader can open any past day; the 7-day window and the Seed Link signature stop URL edits, not code readers. Risk R2 in §10 holds the leak. The unlock line names the Atlas, the Trail Twists, and the sizes first, because those are the parts a free player never sees.

### 3.3 Funnel

| Step | Counter (Funnel Count) | Where |
| --- | --- | --- |
| Visit | `visit` | an `<img>` beacon in the static HTML, so a broken script still counts the visit |
| Labyrinth drawn | `boot_ok` | sent by the bundle once it has drawn the Labyrinth; the base of the §8 ratios |
| Daily Run complete | `daily_complete` | result beacon |
| Share String copied | `share_copy` | copy button beacon |
| Checkout Session created | `checkout_created` | `/api/checkout` |
| Paid | `paid` | confirm, webhook, or reconciliation |
| Refund | `refunded` | webhook or reconciliation |

Seven counters replace the four of ADR 0049. The bundle sends `boot_ok`, `daily_complete`, and `share_copy` in one `sendBeacon` on page hide, so a visit costs two Worker requests. Beacons land in a Durable Object counter per UTC day; the Ops Tick copies the totals into the sharded `funnel_counts` table hourly (§7.4). Bot handling: a credit of 50 beacons per address per day per event type inside the Durable Object, keyed on a hash of the address with a daily salt that is not kept, so a carrier address that spends its `visit` credit still delivers `daily_complete`. Cloudflare Bot Fight Mode is added only if S00 shows that a Worker-to-zone fetch passes it `[unverified]`, because a challenged Sentinel probe would read as a failure.

### 3.4 Unit economics

All figures are arithmetic on provider price pages. None is a measured result.

| Line | Stripe direct | Stripe Managed Payments | Steam |
| --- | --- | --- | --- |
| Gross | 5.99 | 5.99 | 5.99 |
| Processing fee (2.9% + $0.30 US card) | 0.47 | 0.47 | n/a |
| Merchant-of-record fee (3.5%) `[unverified: third-party sources; Stripe's own pages state no figure]` | 0.00 | 0.21 | n/a |
| Platform cut (30%) | n/a | n/a | 1.80 |
| Net before provisions | 5.52 | 5.31 | 4.19 |
| Refund provision (3% of price plus the unreturned processing fee) `[assumption on the rate]` | 0.19 | 0.19 | 0.18 |
| Dispute provision (0.3% rate × $15 fee plus the lost sale) `[conservative: Stripe carries disputes under Managed Payments; kept as margin]` | 0.06 | 0.06 | 0.00 |
| Contribution per sale | 5.27 | 5.06 | 4.01 |

Stripe keeps the processing fee on a refund (Stripe pricing page). Steam deducts VAT and regional prices before its cut, so the Steam line overstates EU and regional sales `[unverified magnitude]`. The Steam row is a secondary channel (§4).

Sales tax is the hidden upkeep: EU VAT from the first consumer sale, US state tax above each state's threshold `[unverified: confirm with counsel]`, and quarterly filings, which the brief forbids. The plan uses Stripe Managed Payments: Stripe is the merchant of record for tax, fraud, disputes, and transaction support (Stripe, how it works). Eligibility is a Stripe review; the business must sit in the US, Canada, 31 listed European countries, Australia, Hong Kong, Japan, or Singapore (Stripe, eligibility). Video games are an eligible category; S00 picks the tax code. S00 also confirms that the account can still read the Customer email and the card's last four digits, call `refunds.create`, and receive dispute events, because `restore` and `refund` in §7.3 rest on those four `[unverified]`. D4 names the fallback.

### 3.5 Fixed monthly cost

| Item | Primary (Cloudflare) | Fallback (Vercel) | Source |
| --- | --- | --- | --- |
| Hosting | 0.00, Workers Free `[unverified: the pricing page is silent on commercial use; S00 reads the terms]` | 20.00, Pro one seat with $20 credit; Hobby forbids commercial use | Cloudflare Workers pricing; vercel.com/pricing |
| Domain | 1.00 | 1.00 | about $12 per year `[unverified]`; five years prepaid at cutover, no card stored; the year-five renewal is the one planned human action |
| Neon Free | 0.00 | 0.00 | 100 CU-hours per project per month, 1 GB storage per project, autosuspend after 5 minutes (neon.com/pricing) |
| Stripe | 0.00 | 0.00 | per-sale fees only |
| Sentry Developer | 0.00 | 0.00 | about 5,000 errors per month `[unverified]` |
| GitHub Free, Mend Renovate app | 0.00 | 0.00 | free for public and private repos |
| Total | 1.00 | 21.00 | |

Cloudflare Free quotas that bound the workload: 100,000 Worker requests per day per account, 10 ms CPU per invocation, KV 100,000 reads and 1,000 writes per day, 5 cron triggers per account, Durable Objects 100,000 requests per day with the SQLite backend, static asset requests free and unlimited (Cloudflare Workers pricing and limits, Durable Objects pricing). At two Worker requests per visit, the `<img>` visit beacon and one batched script beacon, the request quota covers about 50,000 visits per day, twenty times the top row of the funnel model in §3.7. Workers Paid at about $5 per month `[unverified]` lifts the request and CPU caps; it is the one planned upgrade, taken only when an alert asks (§8.2). No card sits on the Free account, so no bill can grow. Workers Builds has its own free minutes `[unverified: S00 reads the quota]`, which size the Renovate schedule in S16.

Neon budget: the Daily, Seed Links, beacons, the Sentinel probe, and `check` never touch Postgres. Neon wakes for the hourly tick and for checkout, confirm, activate, and restore. A wake runs about five minutes to autosuspend at the 0.25 CU floor, about 0.02 CU-hours; twenty-four tick wakes a day cost about 15 CU-hours a month. A purchase adds up to three wakes (checkout, webhook, confirm), about 0.06 CU-hours, so the 100 purchases of the top §3.7 row add about 6; the total near 21 of 100 CU-hours is under half the quota `[estimate]`. An exhausted quota fails the tick, which pauses checkout and alerts under the tick rule (§8.1); `check` keeps working from KV, and the Daily never needs Neon. Neon's own over-quota behaviour on Free is `[unverified]`.

### 3.6 Break-even

Break-even purchases per month = `ceil(F / C)`, with `F` the fixed cost and `C` the contribution. The function `breakEvenPurchases` in `shared/unit-economics.js` already computes this.

| Fixed cost F | C = 5.27 (direct) | C = 5.06 (Managed Payments) |
| --- | --- | --- |
| 1 (Cloudflare Free) | 1 | 1 |
| 6 (Workers Paid) | 2 | 2 |
| 21 (Vercel fallback) | 4 | 5 |
| 100 (one Steam fee month) | 19 | 20 |

### 3.7 Funnel model

This is a parametric model with labelled assumptions, not a forecast.

`purchases = V × d × r × c`

| Symbol | Meaning | Value |
| --- | --- | --- |
| V | visits per month | input |
| d | share of visits that complete a Daily | 0.40 `[assumption]` |
| r | share of those who return within 7 days | 0.25 `[assumption]` |
| c | share of returners who buy | 0.02 `[assumption]` |

| V | Purchases | Contribution at 5.06 | Against F = 1 |
| --- | --- | --- | --- |
| 500 | 1 | 5 | surplus 4 |
| 10,000 | 20 | 101 | surplus 100 |
| 50,000 | 100 | 506 | surplus 505 |

The model says the product survives at a few hundred visits per month on the primary platform with no marketing spend. The owner's first-30-day numbers replace every assumption at day 30 (§10).

## 4. Distribution

### 4.1 Primary: the free Daily on the owner's page

The front page is the Daily. No sign-up, no install, no account. Players arrive by Share String, by Seed Link, and by search. The Wordle, Clues by Sam, and Bracket City precedents grew on exactly this: a static daily page and a share text (`market.md` Q2, Q4).

A first visit: the page loads the Labyrinth under Fog with the date and a one-line legend strip; the first tap or arrow key moves the Explorer and the lantern reveals the first passages; nothing asks for a name, a cookie choice beyond the essential one, or an email. After the Gate, the result block shows the Share String with one copy button and one line about the Run Key.

The page is also the search surface. The build writes one static HTML page per Daily for the next 400 days, each with its own title and date, so each day is a distinct page in a search index without script; each merge rebuilds the set, and days past the last build fall back to the shell. Each Region page is static with a sample Labyrinth as inline SVG. No blog, newsletter, or social account exists after launch week; each would be routine work.

Search and share scale with zero spend because the generator is the content. Every day is new to every player and identical across players, which is the property that makes a Share String worth comparing. A Seed Link carries the same property for any Labyrinth, as Balatro and Townscaper players pass seeds (`market.md` Q4).

### 4.2 Secondary: Steam

A wrapped build of the same client at $5.99 with the Run Key built in, plus a Daily-only demo for one Next Fest. Valve is the merchant of record. Five $4.99 comparables prove the audience (`market.md` Q1); the $100 fee is recouped after $1,000 gross. Community discussions and comments are off at listing time; each is a moderation surface. P8 holds it; §10 holds its kill criterion.

### 4.3 Launch-week posts, once

The owner posts the free Daily once in each place. Each post needs a free, account-free thing to try, which the Daily is.

| Place | Rule | Evidence |
| --- | --- | --- |
| Show HN | must be tryable with no sign-up | daily puzzles scored 126 to 1,054 points |
| r/WebGames, r/puzzlevideogames, r/playmygame | free playable build | subreddit rules |
| Six pre-recorded vertical clips, 15 to 30 s | posted in launch week, then never | a 571,000-view TikTok gave 2,900 wishlists (2022) |
| itch.io page for the free Daily | links to the site; comments off | discovery weak, zero upkeep |

### 4.4 Zero-marketing channels after launch

| Channel | Mechanism | Upkeep |
| --- | --- | --- |
| Share String | text with the day number and a link | none |
| Seed Link | `/s/<version>/<size>/<echoes>/<seed>/<sig>`, signed by the Worker so no parameter can be edited, opens the same Labyrinth for anyone; the weekday table never changes it | none, generator frozen |
| Day link | `/d/<date>` opens that Daily; free for 7 days, then a Run Key, checked in the client | none |
| Search | one static page per Daily for 400 days ahead; one static page per Region with its light characteristic and sample Labyrinth | none |
| Steam | store algorithm, reviews, wishlists | none after release |

Not used: Poki and CrazyGames (ad models and a five-year web exclusivity), the App Store and Google Play (yearly fees, SDK churn, and target-API rules force upkeep), Product Hunt (weak for games), paid ads (the brief forbids ongoing work and the unit price leaves no margin).

## 5. Core loop and game-logic rebuild

### 5.1 What stays

The Run rules stay as they are in `src/game/game-session.js`: Fog, the lantern reveal, Echoes that unlock the Gate, Wardens with Patrol, Hunt, Intercept, and Lured behaviour, Vitality, Pulses, the bell lure, and the five Trail Twists. The generator stays: a randomized depth-first backtracker with `floor(size/4)` opened loops, seeded through FNV-1a into a mulberry32-style generator. Invariant I3 of `DESIGN.md` holds: maze geometry, rulesets, and `echo-bridges-v1` do not change.

### 5.2 What goes

- The Warden Challenge and every question: the bundled deck, the numeric templates, the Capstone cards, the Quest II scenes, `/api/question`, the question tables, and the admin editor. A Warden contact now costs one Vitality; the Warden returns to its spawn tile, sleeps ten soundings as a Lured Warden does today, then patrols three soundings before it may Hunt or Intercept, so a dead end does not drain an Explorer in three turns and a spawn tile inside the Intercept radius does not re-Intercept on waking. Reason: hand-authored content is upkeep, the deck marks the product as directed to children, and a math prompt puts off the target player.
- The Quest structure and its three difficulty names. The Echo Atlas ladder replaces it.
- The First Light offer, the Lantern Journal, Practice Lanterns, Echo Fossils, the Tactics Lab, Echo Postcards as a feature (the share card returns as a Run Key extra), Verified Daily replay, the constellation, the scoreboard, and cloud sync.

### 5.3 Daily Shared Labyrinth

- Seed: `daily-<UTC date>`. The day number counts from launch day as day 1 and shows in the Share String.
- Rules: Classic Rules, no Trail Twist, 2 Wardens, 3 Vitality, 2 Pulses. Size and Echoes follow the weekday, so the week has a shape and a phone can hold the small days without scrolling:

| Day | Size | Echoes |
| --- | --- | --- |
| Monday to Thursday | 13 | 3 |
| Friday, Saturday | 15 | 3 |
| Sunday | 17 | 4 |

- Runs: unlimited within the day. The revealed chart stays revealed across Runs: the Labyrinth is the same and the player's knowledge is the score's subject. A new Run returns the Explorer to the start and each Warden to its spawn tile, refills Vitality and Pulses, and hides the Echoes again. A lost Run counts and keeps its chart.
- Headline score: the soundings of the best finished Run of the day and the Run count, with chart par beneath as the full-knowledge floor. A cumulative total would read as failure against par; the count carries the cost of a scouting Run, so "36 soundings in 2 Runs" reads worse than "in 1 Run". Secondary: Echoes found, Vitality left, Pulses used. No global leaderboard: the market file quotes the Slay the Spire 2 team that cheat prevention without invasive anti-cheat is "sort of impossible", and a leaderboard needs a server and moderation.
- Par: the shortest route from the start through every Echo to the Gate with the chart fully known. With at most 4 Echoes the client checks all orders with breadth-first distances and shows an exact number. Par is geometry only, without Wardens, Fog, or Pulses: a floor a perfect-information route achieves and a Fog route rarely does. The result block names it "chart par". Free Play Labyrinths with more than 4 Echoes use the nearest-neighbour order and label par "about".
- Days logged: a count of consecutive days with a completed Daily, kept in the browser. Decision D14.

### 5.4 Share String

Spoiler-free, under 140 characters, copied to the clipboard with one tap. Each Run is a group of glyphs: one `▪` per five soundings of that Run, rounded up, with event glyphs between them in the order they happened; a lost Run ends in `✕`; a space separates Runs. At most three Runs show; older Runs collapse into `+N` first, then the oldest shown, until the string fits.

```
Echo Maze 312
▪▪◆▪▪▪✕ ▪▪◆▪▪◆▪▪◆▪▪ 36 soundings in 2 Runs, chart par 31
Echoes 3/3  Vitality 2/3
echomaze.example/d/2027-09-10
```

Glyphs: `▪` five soundings, `◆` an Echo found, `▲` a Warden contact, `○` a Pulse, `✕` the Run lost. The example shows a first Run lost after 22 soundings with one Echo, and a second Run of 36 soundings. A day with no finish shares the first line, the glyphs so far, and "lost in the Fog" in place of the soundings line. The glyphs are plain Unicode, so they survive every chat app. The link opens that day's Labyrinth for anyone for 7 days.

### 5.5 Echo Atlas ladder

Five Regions times 20 Labyrinths, seeded as `atlas-<region>-<index>`. A fixed table sets size, Echoes, Wardens, Vitality, Pulses, and the Trail Twist per index. The table is 100 rows of numbers, written once. Completion marks live in the browser. No Region is hand-authored; the generator plus the row produces every Labyrinth.

### 5.6 Progress code

A Run Key holder exports progress as a short code, about 40 base32 characters holding the Atlas bitmap, the days-logged count, and the last Daily day number, and pastes it on another device. No server, no sync table, no account.

### 5.7 Generator trust

Every Labyrinth passes a validator before play:

1. The start reaches every Echo and the Gate.
2. Each Warden spawns beyond the Intercept radius from the start, by breadth-first distance; S09 reads the radius from `game-session.js`.
3. No Echo sits next to the start.
4. Par lies between `size` and `size² / 2` moves.
5. `floor(size/4)` loops are open.

On failure the client derives the next seed as the FNV-1a hash of `<seed>#<n>`, `n` from 1 to 8, in the alphabet `normalizeSeed` accepts. A suffix would not do: `normalizeSeed` truncates to 24 characters (`game-session.js:1221`), so a 24-character seed and its suffixed retry would collapse into one. The derivation is deterministic, so a seed yields the same Labyrinth on every device. If all nine fail, the generator throws and Sentry records it. The build gate runs the Daily preflight over the next 400 Daily seeds and fails the build on an exhausted seed, so an unplayable day is caught at the merge that would ship it. A property test in the local gate runs 10,000 seeds at sizes 9, 15, and 25 and asserts that no seed needs more than two retries.

The generator carries a version string, `classic-v1`, in every Seed Link and Day link. A future rule change creates `classic-v2` and leaves `v1` in place, so no shared link ever changes its Labyrinth.

## 6. Visual identity

### 6.1 Direction: Pilot Chart

The Labyrinth is an unsurveyed coast. The game borrows the symbol set of U.S. Chart No. 1 (NOAA) for Fog, lights, dangers, and the Gate, and invents no symbol. References: Chart No. 1, the 1972 Vignelli subway map (MoMA), Mini Metro, Sunless Sea (`visual-refs.md` §2A). This direction ranked first because it ships about twelve symbols as one inline SVG sprite and `Path2D` strings, swaps the hatch and stipple painters for flat fills and one edge pass, and costs two to three weeks for tokens, canvas, and landing `[estimate]`.

### 6.2 Palette and type

- Ground: white paper. Deep water is the paper itself. Shoal water is one blue ink at three strengths. Land is one buff tint. Black carries line and type. Magenta marks lights and caution and nothing else.
- Night: the S-52 night display table `[unverified]`: the symbols stay, the ground darkens, magenta dims. Not a second layout.
- Display type: Archivo (OFL, variable `wdth` 62 to 125), condensed for the title block and Labyrinth labels. Body type: Atkinson Hyperlegible Next (OFL, variable). Neither face appears on a slop list. Italic appears only on in-Labyrinth water labels, as chart convention sets water names in italic.
- Each Region is a light characteristic, not a hue: Mosslight `Fl(2) 6s`, Windcall `Oc 4s`, Sunspan `Fl 3s`, Tideglass `Iso 2s`, Bellroot `LFl 10s`. Reduced motion shows the label and no pulse.

### 6.3 Labyrinth rendering

| Object | Rendering |
| --- | --- |
| Fog | blank paper with a fine black dot screen at low strength, from an 8 × 8 pattern tile |
| Revealed passage | water tint |
| Wall | buff land with a black coastline stroke on the water edge only and a thin blue depth contour 2 px inside the water |
| Explorer | position-fix symbol, a circle with a centre dot; the trail is a dead-reckoning track with a tick every ten soundings |
| Warden | a magenta danger circle with the dotted danger line, so the danger shares no ink with the coastline; the inner mark keeps the behaviour code (Patrol round, Hunt pointed, Intercept chevron, Lured ringed) |
| Echo | the fog-signal arc from Chart No. 1 section R with its number |
| Gate | a pair of lateral marks and a magenta light sector that points into the entrance |
| Lantern | a magenta sector arc that pulses at the Region's light characteristic |

Labyrinth tiles are at least 24 px on a phone. A Labyrinth of size 13 fits a 375 px phone at full width. Above size 13 on a phone the Labyrinth becomes a viewport that keeps the lantern centred and scrolls with the Explorer, as a chart plotter does; the revealed chart is one pinch away. On desktop the Labyrinth takes 60 to 70% of the width; today's 430 px Labyrinth with tiny tiles goes.

Accessibility floor: the whole Run plays on the keyboard; an ARIA live region announces soundings in tens, each Echo found, each Warden contact, and the Gate; a high-contrast toggle doubles the coastline stroke and removes the dot screen; reduced motion stops the lantern pulse. Contrast on every ramp step passes WCAG AA. S13 adds a thumbnail test: a Warden reads as a Warden at 24 px tiles, size 13, scaled to 160 px.

### 6.4 Screens

Four screens, no modal except pause.

1. **Daily (`/`).** The Labyrinth is the page. A title block beside it, below it on a phone, holds the date, the Region light, soundings, Echoes, Vitality, Pulses, and the Run number. The result fills the same block: the best Run against chart par, the Share String with a copy button, and one line for the Run Key: "The Atlas, Trail Twists, every size, and the archive: $5.99 once." No hero, feature cards, or pricing card.
2. **Free Play and Atlas (`/play`, `/atlas`).** The same Labyrinth shell. The Atlas is one chart sheet with five Regions as insets and 20 soundings each; a completed Labyrinth shows its par mark. The archive browser is the sixth inset.
3. **Run Key (`/key`).** Buy, activate, restore, and refund, in that order on one page. Plain forms, no card. The Stripe return URL lands here with the Session id, and the page issues the key (§7.3).
4. **Legend (`/legend`).** The tutorial, drawn as the chart legend: each symbol with its meaning, and a 7 × 7 practice Labyrinth.

Settings (sound, reduced motion, high contrast, swipe or compass arrows) sit in the title block as a legend strip, not a modal.

### 6.5 Hand-made versus templated

| Element | Hand-made | Templated or generated |
| --- | --- | --- |
| Twelve chart symbols | traced once from Chart No. 1 as SVG paths | |
| Title block, neatline, compass rose (landing only) | drawn once | |
| Region light characteristics | chosen once | |
| Labyrinth, trail, fog screen | | canvas from tokens and the seed |
| Share card (1200 × 630) | | the Run's own Labyrinth as a chart extract plus the title block |
| Steam capsule, OG image | drawn once from the share-card composer | |
| Copy | written once; one label per control | |

### 6.6 Anti-slop bar

The build passes the hallmark anti-pattern list and the impeccable craft floor by construction:

- No cream ground, no lamplight amber, no Geist, no Inter, no tracked uppercase label, no pill, no glass blur, no glow token, no card-in-card, no three equal cards, no coloured card stripe, no gradient text, no stock icon set, no emoji as icon, no fade-up on scroll, no hover scale.
- Texture comes from structure only: tint fills, one coastline stroke, the dot screen. No noise overlay.
- The guards against the stock treasure map: a white ground, no parchment, no burnt edge, the compass rose once.
- Copy density: one self-explanatory label per control. Empty-state copy exists only where its absence causes a wrong action.
- Gate: `node ~/.claude/skills/impeccable/scripts/detect.mjs --json <paths>` exits 0 on every UI PR; `.hallmark/log.json` gets a new entry; `DESIGN.md` is rewritten from the shipped build by the documenter agent.

## 7. Architecture

### 7.1 Platform

One Cloudflare Worker serves the static client from Workers static assets, five API routes, and the hourly Ops Tick in its `scheduled` handler. The Sentinel Worker holds a five-minute cron, no npm dependency, and the three powers the app must not hold: rollback, repository write, the alert of last resort. KV holds operational state; one Durable Object holds the beacon counters; Neon holds the four money tables. Workers Builds builds and deploys `main` and posts a GitHub check run on every build (Cloudflare, GitHub integration).

Why this platform. Static assets are free without a request cap, so the Daily, Seed Links, and the Legend survive any Worker quota event. The runtime pins a compatibility date and carries no Node deprecation; Node runs only at build time, pinned in `.node-version`. KV, the Durable Object, cron triggers, and the deployments API are inside the free plan. Vercel Pro remains the fallback with a mechanism-for-mechanism map in §8.5.

Runtime libraries. The database driver on Workers is `@neondatabase/serverless` over HTTP, the driver Neon documents for Workers, with no TLS handshake per invocation; it is one new dependency, which the owner approves with this plan or refuses before S06, and `pg` under `nodejs_compat` is the fallback `[unverified on Workers Free; S00 tests both]`. The Stripe SDK runs with its fetch client; Ed25519 runs in WebCrypto. The 10 ms CPU limit counts compute, not network wait; every tick step that reads a Stripe list is bounded to 100 objects per run with a KV cursor, and S10 and S11 measure CPU per step. A step that cannot fit names Workers Paid in its alert.

### 7.2 Endpoints

| Route | Method | Guard | Work |
| --- | --- | --- | --- |
| `/api/checkout` | POST | rate limit 5 per minute per address | creates a `pending` purchase row and a Checkout Session with the purchase id in metadata and the return URL `/key?session_id={CHECKOUT_SESSION_ID}`; refuses with 503 `checkout_paused` during Checkout Pause or when KV is unreadable |
| `/api/stripe-webhook` | POST | Stripe signature | inbox insert of the event id, type, and object id with `ON CONFLICT DO NOTHING`, then process; `checkout.session.completed` with `payment_status = 'paid'` and `checkout.session.async_payment_succeeded` mark the row `paid`; `expired` marks it `abandoned`; refund events and `charge.dispute.created` revoke; `charge.dispute.closed` with status `won` deletes `revoked:<purchase_id>` and sets the row `active` again; 500 on a processing failure so Stripe retries |
| `/api/key` | POST | rate limit per address: 10 per hour on `activate`, 5 per hour on `restore` and `refund`, 60 per hour on `check` and `link` | `confirm`: Session id to a key, once; `activate`: key plus device id to a signed token; `check`: token to status from KV; `restore`: email plus a second factor to a fresh key; `refund`: key, email, and a second factor to a full refund within 48 hours, then revoke; `link`: version, size, Echoes, and seed to a signed Seed Link, three per UTC day per address without a token |
| `/api/beacon` | GET, POST | per-address daily credit per event type | Durable Object increments; the GET form serves the `<img>` visit beacon |
| `/api/ready` | GET | none; cached 60 s at the edge; the `X-Probe` header with the probe secret runs the deep form | commit SHA, deployment version, `last_tick_at`, Neon status as the last tick saw it, the Stripe webhook endpoint status as the last tick saw it, pause state, freeze state, and the green lock-file SHA; the deep form also creates one Checkout Session that expires in 30 minutes, writes no row, and counts no beacon, so it works during a pause |
| `scheduled` | cron, hourly | the platform | the Ops Tick (§8.1) |

The rate limits use the Workers rate limiting binding `[unverified on Free; the fallback is a counter in the Durable Object]`, so `rate_limit_counters` leaves Postgres. The public `/api/ready` never queries Neon or Stripe; only the tick does, so the Sentinel's 288 probes a day wake nothing.

### 7.3 Run Key flow

1. `/api/checkout` writes a `run_keys` row with status `pending` and no key, and creates the Session with `customer_creation: 'always'` `[unverified under Managed Payments; S00 checks]` and the purchase id in metadata. No key exists yet, so nothing travels through Stripe or a URL.
2. The return URL lands on `/key` with the Session id. The page calls `confirm`. The server retrieves the Session with its line items, checks `payment_status = 'paid'`, the purchase id in metadata, and that the one line item's price id equals `LIFETIME_PRICE_ID`, generates the key, stores its SHA-256 with the pepper from `RUN_KEY_PEPPER`, sets the row `active` with `key_issued_at`, writes the Financial Fact if the webhook has not, and returns the key once. The Financial Fact stores `amount_total`, `currency`, and the USD settlement from the balance transaction `[unverified under Managed Payments; S00 reads one]`. Nothing compares `amount_total` with `LIFETIME_AMOUNT`: Adaptive Pricing settles in the buyer's currency, so today's check in `server/lifetime-domain.js:35` would refuse a EUR buyer. The page shows the key with "keep this", activates it, and replaces the URL with `/key` so no Session id stays in history. A second `confirm` answers `issued` and points to `restore`. This is today's confirm route, so no webhook sits on the delivery path. A buyer who closes the tab before the return gets a `paid` row from the webhook or reconciliation, and `restore` issues the key.
3. `activate` takes the key and a random device id that the client made on first visit. It checks status `active`, records the device with its activation time if it is new, evicts the device activated longest ago when ten are held, and returns a token `{purchase_id, device_id}` signed with Ed25519. The token never expires. The client verifies it with the public key in the bundle and stores both. Only an explicit `revoked` answer to `check`, called at most once a day when online, locks the client; a network error changes nothing. Revocation is best effort: an offline device keeps playing, the Steam offline-mode trade. Eviction means a buyer who clears storage never locks out, and a shared key churns its devices, which bounds sharing.
4. `check` reads KV, not Neon: every revocation writes `revoked:<purchase_id>` to KV, and `check` answers `revoked` when the key exists and `ok` otherwise, `ok` also on a KV read error, because an unreadable list must not lock a paying player. A few hundred daily checks cost KV reads and no Neon wake.
5. `restore` takes the email on the purchase plus one second factor: the card's last four digits, the Checkout Session id from the return URL, or the receipt number or PaymentIntent id printed on the Link receipt `[unverified: which identifiers the Managed Payments receipt shows; S00 reads one]`. It finds the purchase through the Customer or through `checkout.sessions.list` filtered by `customer_details.email` `[unverified filter]`, matches the second factor, issues a fresh key, and revokes the old key if one was issued. The old devices lock at their next `check`. The limit is 5 calls per hour per address and one restore per 30 days per purchase.
6. `refund` takes the key, the email on the purchase, and one second factor from step 5, so a holder of a shared key cannot refund a stranger's purchase; it checks the purchase is under 48 hours old and unrefunded, calls `issueRefund` with the existing idempotency key, and revokes the key. After 48 hours the page points to the Link receipt, where Stripe handles refund requests under Managed Payments on its own rules within 60 days (Stripe, how it works). No human on the owner's side.

Key material and threat model. The database stores a peppered hash, never the key, and Stripe holds no copy, so neither a database read nor the Stripe dashboard yields a usable key. The Ed25519 private key lives in `RUN_KEY_SIGNING_KEY`; the public key is a constant in the bundle. A leaked private key forges tokens, which grants free play and moves no money; the response is a new key pair with the old public key accepted for 30 days, during which every online client gets a fresh token from `check`. A leaked pepper has the same bound. Neither leak touches Stripe, Financial Facts, or a paying player's access. A key is 36 to the power 12 possibilities; `activate` at 10 per hour cannot enumerate it.

Why a key and not a magic link or an email login. A magic link needs an email provider, a template, a bounce handler, and a sender reputation, each a service with a bill and an upkeep surface. A key needs only the return page and the `restore` path, both of which Stripe's own records support. Decisions D5 and D7 record the choice.

### 7.4 Data and state

| Store | Item | Action | Notes |
| --- | --- | --- | --- |
| Neon | `financial_facts` | keep, three columns added | one row per PaymentIntent with `amount_total`, `currency`, and the USD settlement |
| Neon | `funnel_counts` | keep, seven metrics | sharded counters, written by the tick from the Durable Object totals |
| Neon | `webhook_inbox` | keep, narrowed | event id, type, object id, attempts, status; no payload, so no buyer email or address rests outside Stripe; a retry refetches the event from Stripe; 90-day prune; absorbs `stripe_webhook_events` |
| Neon | `run_keys` | add | `purchase_id`, `key_hash`, `status` (pending, paid, active, revoked, abandoned), `devices` (id and activation time), `created_at`, `key_issued_at`, `revoked_reason`, `restored_at` |
| Neon | 33 other tables | drop | two migrations: feature tables in S03, account tables in S05 after the backfill; DDL listed in each PR body |
| KV | `ops` namespace | add | `paused:<class>` (ten keys, each written by its owner alone), `pause_history`, `resume_count_24h`, `last_tick_at`, `tick` (the last run's record), `last_probe_at`, `green_history`, `probation`, `deploy_freeze`, `anomaly`, `incident:<class>`, `revoked:<purchase_id>`, `cursor:<step>` |
| Durable Object | `beacons` | add | per-UTC-day counters and the per-address credit; the tick drains it hourly |
| Repository | `renovate.json` | the Pin list | a `packageRules` entry per pinned package with `allowedVersions` at the green version; the Sentinel writes it, the build gate reads it |

Four Postgres tables remain. The DDL drop list: `players`, `score_entries`, `player_access`, `run_access_grants`, `lifetime_purchases` (after backfill), `stripe_webhook_events`, `cloud_quest_progress`, `learning_journals`, `deleted_user_tombstones`, `audit_events`, `audit_chain_head`, `user_roles`, `questions`, `question_versions`, `explorer_access_settings`, `rate_limit_counters`, the Classroom tables, `public_email_domains`, `org_domains`, the `verified_daily_*` tables, the Class Expedition tables, the constellation tables, the `offline_*` tables, `echo_fossil_collections`.

KV sits in a different failure domain from Neon, so a Neon outage cannot hide a pause, and `/api/checkout` refuses when it cannot read KV. KV writes against the 1,000 per day on Free: `last_probe_at` on every third probe (96), the tick's lease and record (48), and a handful of pauses, cursors, incidents, and revocations; under 200 per day. The ten class reads per checkout call sit inside the 100,000 reads.

### 7.5 Migration for existing Lifetime owners

Public Checkout was never enabled (`LIFETIME_PUBLIC_CHECKOUT_ENABLED` default `false`, ADR 0050), so every current Lifetime Membership belongs to a Pilot Account that the owner chose `[inference]`. S03 deletes the journals, quest progress, settings, and scores of those accounts. That deletion is an owner-authorized migration step after an export, run by the owner before S01; the brief's rule binds automation.

1. Before S03, the owner runs the existing data export once per Pilot Account and keeps the files outside the repository.
2. The backfill is a named owner step: `npm run backfill:run-keys`, run locally against production with the Neon lane variables, on the day S05 deploys. It reads each `player_access` row with `membership_state = 'active'` and its `lifetime_purchases` row, including admin-grant rows with no PaymentIntent, and writes one `run_keys` row with status `active`. It is idempotent per purchase id.
3. The backfill prints the Clerk email and the key for each owner once, to the console, never to a file in the repository.
4. The owner sends each Pilot Account its key and its export on the day S05 deploys, because that deployment removes Clerk sign-in. This is one message per Pilot Account, before launch, and the only pre-launch contact.
5. `financial_facts` rows stay. Clerk, `player_access`, and `lifetime_purchases` go in the same release, after the backfill has run and its output has been read.

No live customer loses access, and no customer financial data is deleted.

### 7.6 Secrets and tokens

| Secret | Holder | Scope | Expiry |
| --- | --- | --- | --- |
| `DATABASE_URL` | app Worker | one Neon database | none |
| `STRIPE_SECRET_KEY` | app Worker | a restricted key: Checkout Sessions write, Refunds write, Webhook Endpoints write, Customers, Charges, PaymentIntents, Disputes, Events read | none |
| `STRIPE_WEBHOOK_SECRET` | app Worker | one endpoint | none |
| `RUN_KEY_SIGNING_KEY` | app Worker | token signing | none; rotation only on a leak |
| `RUN_KEY_PEPPER` | app Worker | key hashing | none; rotation only on a leak |
| `PROBE_SECRET` | both Workers | the deep form of `/api/ready` | none |
| `CF_API_TOKEN` | Sentinel | Workers Scripts Write on one account (the deployments API permission); this scope can also upload a new app version, which inherits the app's secrets, so the Sentinel is its only holder | none |
| `GITHUB_TOKEN` | Sentinel | a fine-grained token, Contents read and write on this repository only; no expiration `[unverified: the no-expiration option; if absent, the token is the one scheduled renewal and the Sentinel alerts 30 days before]` | see scope |
| `CF_KV_READ_TOKEN` | Workers Builds environment | KV read on the `ops` namespace, for the deploy gate | none |
| `SENTRY_DSN`, `SENTRY_DSN_OPS`, `LIFETIME_PRICE_ID` | both | not secret | none |

No `CRON_SECRET` exists, because cron invokes the `scheduled` handler directly and no HTTP route triggers the tick. The tick holds no GitHub or Cloudflare token; every repository and deployment action runs in the Sentinel. Provider-side actions that would need an email reply are listed in §7.7.

### 7.7 Every human surface, cut or automated

| Surface today | v3 |
| --- | --- |
| 12-step launch runbook, pilot gate flip, gate code removal | one cutover slice (S18) with a checklist that the owner runs once; no flag matrix remains |
| Purchase classification script | deleted; reconciliation (§8) is the classifier |
| Dead webhooks, receipt recovery | `confirm` delivers the key without the webhook; reconciliation marks paid rows; `restore` reissues |
| Refunds | self-serve within 48 hours; Stripe handles the rest under Managed Payments |
| Disputes | Stripe handles them under Managed Payments; a dispute revokes the key, and a dispute won restores it |
| Refund and dispute rate | reconciliation computes the 30-day rate and pauses checkout at 10% with at least 20 paid, with one alert; the owner reads the reasons |
| Refunded-account restore | not offered; a refund ends the Lifetime Membership, as today |
| Admin grants, question review, Classroom, email domain list | deleted with their features |
| Audit checkpoint, constellation prune, break-glass deletion | deleted with their features |
| Secret rotation | none on a schedule; rotation only on a leak, which Sentry or Stripe reports |
| Paid services | none on the primary platform; the domain is prepaid for five years with no stored card; the year-five renewal is the one planned human action |
| Provider emails that ask for a reply | Stripe may email for a product-level support question and refunds on its own after 48 hours if the owner does not reply (Stripe, how it works); Stripe eligibility reviews; Cloudflare and Neon terms changes. Each is a read, and the plan accepts Stripe's default action on silence |
| Launch records, cost sheet, COPPA review | the cost sheet is §3.5; COPPA scope leaves with the learning frame `[unverified legal reading]` |

## 8. Self-correcting operations

Rules that bind every automation:

- It never moves money beyond what Stripe's own rules allow. The only money moves are a full refund of the customer's own purchase on the customer's request within 48 hours, and the refunds that Stripe itself issues under Managed Payments.
- It never deletes customer data. Financial Facts and Stripe records are permanent. Prunes touch only the webhook inbox and operational state.
- A failure that it cannot correct sends one alert email and fails safe: the game keeps running, and checkout pauses.

Two functions share the work. The Ops Tick runs inside the app hourly and repairs data. The Sentinel runs outside the app every five minutes with no dependency Renovate can change, and holds the powers that must survive a broken app: the probe, the rollback, the repository write, the alert of last resort. Each watches the other: the Sentinel pauses checkout and alerts `tick-dead` when `last_tick_at` is older than two hours; the tick alerts `sentinel-dead` when `last_probe_at`, written on every third probe, is older than 45 minutes, unless its own previous run is older than 90 minutes, which means the whole account was stopped and the Sentinel's `quota` alert covers it.

### 8.1 The Ops Tick and the Sentinel

The Ops Tick runs these steps in order and records every step's result: lease, drain the beacon counters into `funnel_counts` with the flood check, webhook endpoint status and re-enable, inbox retry, reconciliation (started at the 03:00 UTC tick and continued by later ticks at 100 rows per run with a KV cursor: each `run_keys` row of the last 7 days that is `pending` or `paid` is retrieved by its Session id, so no listing can fall behind a flood), the refund-rate check (daily), the anomaly check (daily), prune (daily), the Sentinel liveness check, pause-or-resume, lease release. The lease is a KV key with a 50-minute expiry; a tick that finds a live lease exits. A tick that throws is a failed tick for the pause rule.

The Sentinel runs these steps every five minutes: the shallow probe, `GET /api/ready?t=<now>`, 10-second timeout, reading version, commit, `last_tick_at`, and pause state; run Probation if the version is new (§8.3); act on an `anomaly` flag (§8.3); run the freeze-stuck check; run the pause-or-resume rule for the probe class and the tick-dead rule; write `last_probe_at` on every third probe; send any alert.

Pause classes. Each class is one KV key, `paused:<class>`, written only by its owner on its own evidence. The Sentinel owns `probe` (two consecutive failed shallow probes; three greens resume), `tick-dead` (resumes at the next tick), and `probation` (resumes when the restored version passes). The tick owns `tick` (two consecutive failed ticks; three greens resume), `webhook`, `reconcile`, `refund-rate`, `anomaly`, and `flood` (`checkout_created` past 500 in a UTC day `[assumption: ten times the top funnel row]`; resumes next day). `prelaunch` is set by hand in S06 and cleared in S18. `/api/checkout` reads the ten keys and answers 503 `checkout_paused` while any exists, so no read-then-write on a shared key can lift a money-rule pause; the client shows "Checkout is paused. The Daily stays open." on a 503 or a failed fetch. At most two automatic resumes per 24 hours across all classes; the third pause holds 24 hours and alerts `pause-held` once.

Alerts. Either Worker posts to the Sentry `echo-maze-ops` project over HTTP with no SDK, fingerprinted by failure class plus incident start. The start sits in KV under `incident:<class>` from the first failing check until the condition clears, so a multi-day incident sends one email. The fingerprints: `deploy-rollback:<version>`, `anomaly-rollback:<version>`, `restore-loop:<commit>`, `restore-failed:<commit>`, `freeze-stuck:<commit>`, `vuln-pr:<number>`, and `<class>:<incident-start>` for `probe`, `page-dead`, `webhook-disabled`, `reconcile`, `refund-rate`, `flood`, `quota`, `tick-dead`, `sentinel-dead`, `pause-held`, and `token-expiry`. One alert rule on the ops project emails every new issue. A post Sentry refuses, a 429 included, goes to the owner's address through the Workers `send_email` binding, the address verified as an Email Routing destination `[unverified: pricing of Email Workers sending]`. The browser SDK reports to a second project, `echo-maze-web`, with `sampleRate: 0.1`, `sendDefaultPii: false`, a `beforeSend` that strips `session_id`, spike protection on, and no alert rule.

Why hourly for the tick. A paid player has the key from `confirm` already, so the inbox retry and reconciliation are backstops, not the delivery. Hourly keeps Neon inside its free hours. The Sentinel owns the minute-scale work and never wakes Neon.

### 8.2 Failure classes

| Class | Detection signal | Automatic response | Limit |
| --- | --- | --- | --- |
| Runtime error, client | Sentry browser SDK at 10% sampling; `boot_ok`, sent by the bundle once the Labyrinth has drawn; `visit`, which the `<img>` beacon sends even when the script throws | the anomaly check (daily) writes the `anomaly` flag on any of three rules: `boot_ok` at zero over the last 24 hours while `visit` is at least 20, with no baseline; `daily_complete / boot_ok` over the last 24 hours under 40% of the prior 28 days with at least 300 `boot_ok` in the window; `visit` under 20% of the 28-day daily mean when that mean is at least 300. Ratios rest on script-sent beacons, so a link-preview crawler that fires `visit` alone moves nothing. With a deployment in the last 72 hours the Sentinel runs the rollback chain of §8.3 against the green before the current version; without one, the zero rule alerts `page-dead:<incident-start>` once and the other two do nothing, because the probe covers the platform | one rollback per version; no automatic code change |
| Runtime error, server | the Sentinel probe; Sentry ops project | two failed probes pause checkout; a failed Probation rolls back (§8.3) | one rollback per version; never past Green History |
| Outage of Cloudflare | none from inside; the Sentinel runs on Cloudflare too | the Daily is down with the platform; active tokens stay valid; nothing to correct | admitted: a Cloudflare outage stops the product |
| Outage of Neon or Stripe | the tick's own calls; the deep probe during Probation | Checkout Pause under the `tick` class; a Probation that fails during the outage holds on the green replay (§8.3); the Daily, Seed Links, and the Legend need no server; keys verify offline and `check` reads KV | alert after two failed ticks, once |
| Payment and webhook drift | daily reconciliation: every `run_keys` row of the last 7 days that is `pending` or `paid`, retrieved by Session id; `refunds.list` and `disputes.list` for the window against status | a paid Session with a `pending` row gets a Financial Fact and status `paid`; a refund or dispute without a revocation revokes; a `pending` row whose Session is `expired` is marked `abandoned`; an `abandoned` row whose Session later pays becomes `paid` | reads Stripe, writes the database, never creates a refund; an unrepairable mismatch pauses checkout and alerts `reconcile` |
| Webhook endpoint disabled by Stripe | `webhookEndpoints.retrieve(id).status` in the tick | the tick calls `webhookEndpoints.update(id, { disabled: false })` once per 24 hours (the `disabled` parameter is documented; re-enable by `false` is `[inference]` and S00 tests it); a second disable in 24 hours pauses checkout and alerts; `confirm` and reconciliation deliver keys without the webhook | one re-enable per 24 hours |
| Dependency and platform rot | Renovate PRs; the Workers Builds check runs `npm run check`, the preflight, and the deploy gate; Renovate's own automerge merges a green minor or patch PR after `minimumReleaseAge` of 7 days, and a green vulnerability PR at once | majors are disabled in Renovate except as a vulnerability fix, so no routine major PR opens; a vulnerability PR overrides a Pin; the compatibility date and `.node-version` pin the runtimes; a deployment that fails Probation is rolled back, frozen, restored, and its packages pinned (§8.3) | the Sentinel alerts `vuln-pr` once when a Renovate vulnerability PR is older than 2 days, which means it is red; no automatic merge of a red PR |
| Content quality | the validator in §5.7; the build-time preflight over 400 days | deterministic retry suffixes; an exhausted seed fails the build that would ship it | no automatic generator change |
| Funnel regression | the anomaly check above; `paid` is read, never acted on, because a few sales a day cannot carry a statistic | as the client row | one rollback per version |
| Cost spike or quota | Cloudflare Free has no bill: at the request cap every Worker on the account stops until 00:00 UTC, the Sentinel included; static assets keep serving the Daily; Neon Free has a hard quota; Sentry Free drops events over quota | the client treats a failed `/api/checkout` fetch as a pause; the Sentinel alerts `quota` at its first probe after the reset, reading the gap in `last_probe_at`; the alert names the Workers Paid upgrade as the owner's one action; a Neon quota exhaustion surfaces as failed ticks and the `tick` pause | the Daily never stops for cost; checkout stops for the rest of that UTC day (D20) |
| Key abuse | `devices` on a key | the eleventh activation evicts the oldest device, so a shared key churns and its first holder reactivates; `restore` issues a fresh key and revokes the old one, once per 30 days | no human |
| Refund abuse | `refund` once per purchase, within 48 hours; the 30-day refund and dispute rate | the key is revoked at once; Stripe's fraud rules apply under Managed Payments; a rate of 10% or more with at least 20 paid pauses checkout and alerts `refund-rate` | no human |

### 8.2.1 Three incidents, end to end

**A bad deployment.** Renovate merges a patch bump at 02:10 UTC; the build was green, but the new version breaks `/api/checkout` in a way the tests miss. Workers Builds deploys at 02:14. The 02:15 and 02:20 deep probes fail. The replay against the newest green version passes, so the new version is the fault. The Sentinel points traffic at the green version, writes `paused:probation` and `deploy_freeze`, and sends `deploy-rollback:<version>`. The range to `main` holds one Renovate commit, so it writes the restore commit: the green tree plus a Pin for the bumped package. The gate passes on the green lock file, Probation passes, and the Sentinel clears the freeze and the pause. The Pin holds until the owner lifts it. The owner reads one email.

**Stripe disables the webhook endpoint.** After a run of 500 answers during a Neon outage, Stripe disables the endpoint `[the window is unverified]`. The next tick calls `update` with `disabled: false`; Stripe retries the queued events; nothing alerts. A second disable within 24 hours pauses checkout and alerts `webhook-disabled:<incident-start>` once; `confirm` still issues keys, and reconciliation marks paid rows daily.

**The request quota.** A post reaches a front page and visits pass 50,000 in a day. Static assets keep serving the Daily; at the cap the API routes and the Sentinel stop; the client shows "Checkout is paused" for the rest of the UTC day. At 00:05 UTC the Sentinel reads a `last_probe_at` gap of hours and alerts `quota` once, naming the Workers Paid upgrade. The 01:00 tick, hours old itself, sends no `sentinel-dead`. Nothing broke, nothing billed.

### 8.3 Deployment health, rollback, freeze, restore, pin

`/api/ready` reports the commit SHA, injected at build time from the Workers Builds commit variable `[unverified: the variable name; S00 confirms]`, and the version id from the version metadata binding. A new version starts a Probation of three deep probes at five-minute spacing. Each deep probe carries the `PROBE_SECRET` header, so it runs during a Checkout Pause; it creates one Checkout Session with `expires_at` thirty minutes out and `probe` metadata, which reconciliation and the webhook ignore; and it fetches `/` and the hashed bundle that `/` names, asserting 200 on both and the build's commit marker in the bundle. Once per Probation the Sentinel also renders `/` through the Browser Rendering REST API and asserts `data-game-ready`, so a bundle that throws on load fails before a visitor sees it `[unverified: Browser Rendering on Workers Free; S00 checks; without it the zero-`boot_ok` rule of §8.2 is the only load-failure check]`. Three green probes push the version and commit onto Green History, capped at ten. Two consecutive failures inside Probation first replay the deep probe against the newest Green History version at its preview URL `[unverified on Free; S00 checks; the fallback holds when the new version's shallow probe is green and the deep failure names Stripe or Neon]`. An equal failure there is an upstream fault: Probation holds, checkout pauses under `probe`, nothing rolls back, one alert `probe:<incident-start>` goes out. A green pass makes the new version the fault, and the chain runs, in order:

1. Rollback by a deployment to the newest Green History entry through `POST /accounts/{account_id}/workers/scripts/{script_name}/deployments` with `versions: [{ percentage: 100, version_id }]` (Cloudflare deployments API; the token permission is Workers Scripts Write).
2. Checkout Pause under `probation`.
3. `deploy_freeze` with the bad commit, the green commit, and the time.
4. The restore commit, only when every commit between the green commit and `main` is Renovate's, in its fixed message format: the tree is the green tree plus a Pin in `renovate.json` for each bumped package. A human commit in the range stops the restore; the rollback, freeze, and alert stand, and the human who merged is present to fix it. One restore per incident. A push the `main` ruleset rejects alerts `restore-failed:<commit>` and leaves the freeze and the pause in place.
5. One alert, `deploy-rollback:<version>`.

The `anomaly` flag from the tick runs the same chain against the Green History entry before the current version, fingerprint `anomaly-rollback:<version>`. Two guards stop loops: a rollback whose target tree equals the failed version's tree alerts `restore-loop` once and stops; a freeze older than six hours without a green restore alerts `freeze-stuck` once. The gate script `scripts/check-deploy-gate.mjs` reads `deploy_freeze` and the green lock-file SHA from KV through the Cloudflare API with `CF_KV_READ_TOKEN`, which answers even on a quota day. Under a freeze it passes only when `git hash-object package-lock.json` equals the green SHA; at all times it fails on a version above a Pin unless the PR carries Renovate's `security` label; it fails when KV is unreachable, because a gate that cannot read the freeze must not ship. Rollback reaches the 100 most recent versions (Cloudflare rollbacks page), three to six months at 15 to 30 Renovate merges a month; every Green History target is newer.

### 8.4 What the owner does after launch

Reads the alert inbox. Nothing else. §10.4 defines the test.

### 8.5 The Vercel fallback

If S00 finds that Cloudflare Free forbids commercial use or that a mechanism above has no Cloudflare path, the plan moves to Vercel Pro with these substitutions and no other change: Vercel cron for the tick and a second cron for the Sentinel as a separate project, Edge Config for the KV keys, a Postgres counter table for the beacons, `POST /v1/projects/{projectId}/rollback/{deploymentId}` for rollback, the Vercel check run for the build gate, Spend Management at $45 per month with the production pause at 100%, and the Firewall rate limit for `/api/*`. Fixed cost becomes $21 per month and §3.6 holds.

## 9. Programmes and slices

One PR per slice, in this order. Each slice passes `npm run check`, the local review, and CodeRabbit before merge. UI slices also pass the impeccable detector. The pipeline is the one in the owner's instructions: grill, spec, tickets, implement, audit loop, PR.

The order follows one rule: settle the unknowns, remove before you add, secure the money before you paint. S00 answers the provider questions on which §3, §7, and §8 rest. P1 deletes first, so every later slice lands on a smaller codebase. P2 replaces the entitlement on the current platform, then moves it, so no Clerk route is ported. P3 and P4 give the free front and the trust that it never breaks. P5 builds the operations the hands-off test measures. P6 follows P5 so the visual rebuild never blocks the money path. P7 and P8 follow under the one-builder rule. P9 is the owner's one day.

Twenty-one slices at one PR each, with the CodeRabbit refill at about one review per 40 minutes, take about 21 review slots plus fix rounds; calendar time depends on the builder's hours and is not estimated. The three visual slices carry the research estimate of two to three weeks `[estimate]`; the rest carries none, because every earlier estimate in this repository was wrong in the same direction.

Production between slices. Each merged slice deploys. Through S05 the app stays on Vercel with the public-checkout flag `false`; from S06 it runs on Cloudflare with `paused:prelaunch` in KV; either way `/api/checkout` refuses every session until S18. S01 to S03 delete features that have no public users, which is safe because public checkout has never been enabled. Pilot Accounts keep their Clerk sign-in through S04 and receive their Run Keys on the day S05 deploys (§7.5). The Sentinel goes live at S11; from then on a merge that fails Probation is rolled back, which the builder reads as red. Renovate automerge waits for S16, after the Sentinel, so no unattended merge lands before the rollback chain exists.

### P0 Spike

| Slice | Acceptance | Metric | Self-correction |
| --- | --- | --- | --- |
| S00 Go or no-go, no application code. Stripe: Managed Payments eligibility for the owner's account and location; its fee; `customer_creation` and Session metadata under it; whether the business can read the Customer email and the Charge last four, call `refunds.create`, and receive dispute events; which identifiers the Link receipt shows; `checkout.sessions.list` filtered by `customer_details.email`; `webhookEndpoints.update` with `disabled: false` in test mode; the product tax code. Cloudflare: the Free terms on commercial use; `@neondatabase/serverless` over HTTP and `pg` under `nodejs_compat`; the Workers Builds commit variable, whether a failed build command blocks deploy, and the Builds free minutes; version preview URLs and Browser Rendering on Free; whether a Worker-to-zone fetch passes Bot Fight Mode; the `send_email` binding and its price. Stripe again: the balance transaction under Managed Payments. GitHub: Renovate automerge on a Workers Builds check run; the label Renovate sets on a vulnerability PR; the fine-grained token with no expiration | a one-page record under `docs/solutions/platform/rebuild-v3-spike.md` with a yes or no per question and the fallback taken for each no | none | none |

A no on Managed Payments takes fallback D4: Paddle as merchant of record, which replaces S04 and S05 with the Paddle checkout and webhook at the same Run Key model, and the Paddle fee of 5% + $0.50 `[unverified]` replaces the Stripe lines in §3.4. A no on Cloudflare Free takes §8.5.

### P1 Cut

| Slice | Acceptance | Metric | Self-correction |
| --- | --- | --- | --- |
| S01 Remove Classroom, Class Expedition, constellation, public email domains, their routes, scripts, and tests | the four `/class` routes return 404; `npm run check` green; 21 + 6 + 2 files gone | lines removed | none needed |
| S02 Remove offline continuity, service worker, receipts, audit chain, S3; add the PWA manifest only | `public/sw.js` gone; no `AUDIT_*` or `OFFLINE_*` variable read anywhere | lines removed | browser cache alone serves repeat visits |
| S03 Remove scoreboard, replays, fossils, Tactics Lab, journal and quest sync, Postcards, questions and the Warden Challenge, RBAC, admin, OTel, PostHog; the Warden contact rule of §5.2; cut `main.js` to the Run shell; one migration drops the feature tables | a Run plays end to end with a Warden contact that costs one Vitality and sends the Warden home; the DDL is in the PR body; Clerk sign-in and Run Access still work for Pilot Accounts; the owner has exported each Pilot Account first | `src/` under 12,000 lines after S03 | none needed |

### P2 Entitlement and platform

| Slice | Acceptance | Metric | Self-correction |
| --- | --- | --- | --- |
| S04 Run Key issue on Vercel: `run_keys`, `/api/checkout` with a `pending` row, `confirm` on the return page, webhook `paid` and revocation, the narrowed inbox, the Financial Fact on confirm or webhook | a test-mode purchase shows the key on the return page once, and one in a second currency does the same with its currency on the Financial Fact; a second `confirm` answers `issued`; a test refund revokes it; a processing failure answers 500; production checkout stays closed | `paid` count | `confirm` delivers without the webhook; Stripe retries on 500 |
| S05 `/api/key` activate, check, restore, refund, link; Ed25519 token with device eviction; the KV-backed `check` (Edge Config until S06); `/key` page with the buy line; free boundary in the browser; `npm run backfill:run-keys`; delete Clerk, Run Access, Run Grants, guest metering, and the account tables; the public-checkout flag stays and stays `false`; the Lifetime Membership glossary entry rewritten | activation on two devices works; the eleventh activation evicts the oldest device; restore with the wrong second factor fails; a refund with the key and email alone fails; a refund inside 48 hours succeeds once and the client locks at its next `check`; the backfill is idempotent and covers admin-grant rows; Pilot Accounts have their keys | devices per key, refunds | the client keeps a token on a network error and locks only on `revoked` |
| S06 Move to Cloudflare: static assets with the 400-day prerender, the Worker with the five routes, KV with `paused:prelaunch`, the public-checkout flag and the flag matrix removed under it, the Durable Object, Workers Builds on `main`, `.node-version`, the compatibility date, DNS; Vercel project kept until S18 | production serves from Cloudflare; `/api/ready` reports commit and version; the Workers Builds check run appears on a PR; `npm run check` runs in the build; a test purchase on the Workers deployment issues a key | none | none |

### P3 Daily and share

| Slice | Acceptance | Metric | Self-correction |
| --- | --- | --- | --- |
| S07 Daily on `/`: UTC seed, weekday table, day number, unlimited Runs with the revealed chart kept, the best-Run headline, chart par, result block, Share String, `/d/<date>` with the 7-day window, the signed Seed Link, days logged; glossary entries rewritten | two browsers get the same Labyrinth; the Share String matches §5.4; a Seed Link opens the same Labyrinth on both on any weekday; a second Run keeps the revealed chart and resets the Wardens; an edited Seed Link fails its signature | `daily_complete`, `share_copy` | the Daily runs with no server |
| S08 Free Play, Echo Atlas ladder, Trail Twists, size 9 to 25, archive browser, progress code, share card image; glossary entries rewritten | the 100-row table generates 100 valid Labyrinths; a progress code round-trips | Atlas completions (client only) | none |

### P4 Generator trust

| Slice | Acceptance | Metric | Self-correction |
| --- | --- | --- | --- |
| S09 Validator with the Intercept-radius spawn rule, hashed retry seeds, generator version in links, property test over 10,000 seeds at three sizes, the build-time preflight over 400 days | no seed in the test needs more than two retries; the test runs under 60 s in the gate; the preflight fails a build on a planted bad seed | retries per 10,000 seeds | the retry seed |

### P5 Operations

| Slice | Acceptance | Metric | Self-correction |
| --- | --- | --- | --- |
| S10 Ops Tick in the `scheduled` handler: lease, beacon drain with the flood check, webhook status and re-enable, inbox retry, reconciliation by Session id across ticks, refund-rate check, prune, Sentinel liveness, per-class pause and resume, alerts over HTTP with incident-start fingerprints and the `send_email` fallback; CPU per step measured | a simulated paid Session with a `pending` row is marked `paid` on the next tick; 501 Sessions in a day pause under `flood`; a pause of one class survives a resume of another; a disabled test endpoint is re-enabled once; a second disable pauses checkout; the pause lifts after three green runs; the third pause in 24 hours holds for 24 hours and alerts once; a 10% refund rate pauses; every step runs under 10 ms CPU at 100 objects | mismatches repaired per day | the whole slice |
| S11 Sentinel Worker: shallow probe, deep probe with `PROBE_SECRET` and the page and bundle check, Probation on two failures with the green replay, Green History, rollback through the deployments API, freeze, restore commit with Pins on a Renovate-only range, loop guards, tick-dead, freeze-stuck, vulnerability-PR check, Sentry over HTTP, `send_email` fallback; the `main` ruleset with the Sentinel's token as bypass actor and no signature requirement; `scripts/check-deploy-gate.mjs` in `npm run check` reading KV | a red Probation on a test Worker rolls back once, freezes, restores `main` with a Pin in a test repository, and the restore passes the gate; a failure the green version shares holds without a rollback; a human commit in the range gets no restore commit; a rollback to an equal tree alerts `restore-loop` and stops; a push the ruleset rejects alerts `restore-failed`; a bundle that throws on load fails Probation; the gate fails a build with a version above a Pin and fails when KV is unreachable; the Sentinel bundle has zero dependencies; the deep probe succeeds during a pause; one deliberate alert reaches the inbox through Sentry and one through `send_email` | rollbacks per month (target 0) | the whole slice |
| S12 Beacons: the Durable Object counter, the `<img>` visit beacon, the batched script beacon, per-address credit per event type, the anomaly check on its three rules, the `anomaly` flag | synthetic counts set the flag on each of the three rules at its floor and not above or below it; a `visit` without `boot_ok` moves no ratio; a flood from one address stops at 50 per event type; the Sentinel acts on the flag in the test setup | beacons per visit | the whole slice |

### P6 Visual identity

| Slice | Acceptance | Metric | Self-correction |
| --- | --- | --- | --- |
| S13 Tokens, type, the twelve symbols, and the canvas painters for Pilot Chart; night table; the phone viewport above size 13; the accessibility floor; the Warden thumbnail test | the detector exits 0; the Labyrinth renders at 24 px tiles on a 375 px phone; contrast passes WCAG AA on every ramp step; a Run completes on the keyboard with the live region; a Warden reads at 160 px | detector exit code | none |
| S14 Daily, Play, Atlas, Key, and Legend screens; title block; settings strip; no modal but pause | desktop and mobile screenshots of every screen through the browser MCP; the hallmark log entry; `DESIGN.md` rewritten by the documenter | detector exit code; `.hallmark/log.json` entry | none |
| S15 Share card composer, Steam capsule, OG image | the share card renders the Run's Labyrinth in under 2 KB of extra script | none | none |

### P7 Rot flow

| Slice | Acceptance | Metric | Self-correction |
| --- | --- | --- | --- |
| S16 Prune dependencies to six or fewer runtime packages; Renovate config: minor and patch automerge with `minimumReleaseAge: 7 days`, majors disabled, `vulnerabilityAlerts` with `automerge: true`, `minimumReleaseAge: 0`, and the `security` label, a fixed commit message format, a schedule sized to the Builds minutes, Renovate's own automerge on green checks; the Pin check in the gate honours the label | a Renovate patch PR merges with no human action and no GitHub Actions minute; a red PR stays open; a PR for a pinned package never opens, except a labelled vulnerability PR, which does `[unverified: Renovate automerge on a Workers Builds check run; S00 answers]` | open vulnerability PRs over 7 days | the Sentinel's `vuln-pr` alert |

### P8 Steam (optional, kill criterion in §10)

| Slice | Acceptance | Metric | Self-correction |
| --- | --- | --- | --- |
| S17 Electron wrapper at a pinned version with a build-time unlock constant in place of the token check; a Daily-only demo build; store assets from S15 | the build runs offline on Windows, macOS, and Linux; the demo runs the Daily only | Steam wishlists, sales | none; the build never updates |

### P9 Cutover and hands-off test

| Slice | Acceptance | Metric | Self-correction |
| --- | --- | --- | --- |
| S18 Cutover checklist, run once by the owner: Managed Payments on with the tax code, the live webhook endpoint, the restricted Stripe key, the Sentry alert rule on the ops project, the Email Routing destination address verified, the five-year domain prepayment, the Sentinel secrets, the Vercel project deleted, the prelaunch pause cleared | `/api/ready` green in production; one live $5.99 purchase by the owner, refunded through `/key` inside 48 hours; one forced test rollback on a throwaway version, including the restore commit | none | the Sentinel |
| S19 Rewrite `docs/lifetime-membership-operations.md` and `docs/launch-runbook.md` into one page: what the system does by itself, every alert fingerprint of §8.1 with its meaning, and the alert-requested actions with their steps | the page lists every fingerprint and the steps for each requested action | none | none |
| S20 Hands-off test: 30 days | the record in §10.4 | alert emails, manual actions | the record |

## 10. Risks, kill criteria, metrics, hands-off test

### 10.1 Risks

| Id | Risk | Likelihood | Response |
| --- | --- | --- | --- |
| R1 | Visits stay in the hundreds per month and the product earns a few dollars | medium | the kill criterion K1; on Cloudflare Free the loss is bounded at the domain fee |
| R2 | Players clear storage, or read the bundle, and play free forever | high for some, small in money | the leak is unmeasured and `c` in §3.7 absorbs it; the Run Key value a cleared browser still lacks is the Atlas ladder with its marks, the Trail Twists, the sizes, the archive browser, and the progress code; a code reader who takes them was never a buyer |
| R3 | Run Keys are shared | medium | ten devices per key with eviction of the oldest; a dispute or refund revokes; offline devices keep playing; accept the rest |
| R4 | Stripe Managed Payments is unavailable to this account or location, or withholds the Customer and Charge reads that `restore` needs | medium; S00 decides | fallback D4: Paddle; the plan names the replaced slices; a restore fallback is the Session id alone |
| R5 | Renovate does not automerge on a Workers Builds check run | low; S00 decides | PRs stay open, nothing breaks; the fallback is a repository ruleset with the check run required and a bypass for the Sentinel's token, set once |
| R6 | A Sentinel secret leaks (`CF_API_TOKEN`, `GITHUB_TOKEN`) | low | the Cloudflare token can upload an app version that inherits the app's secrets; the GitHub token can write this repository; both are scoped to one account and one repository, the Sentinel is the only holder, and rotation is one action each |
| R7 | A generator bug reaches production | low | the validator, the preflight, and the version string; old links keep `v1` |
| R8 | The Daily flips at UTC midnight, not local midnight | certain | the day number and a "next Daily in hh:mm" line make it legible; same-for-all needs one clock |
| R9 | The Steam build is rejected or sells nothing | medium | kill criterion K3 |
| R10 | Cloudflare changes the Free plan terms | low | the owner reads the email; Workers Paid or §8.5 is one action |
| R11 | Dispute rate rises | low | Stripe handles disputes and monitors the rate under Managed Payments; the refund-rate check pauses checkout at 10%; a rate that ends eligibility is an email, and the fallback is D4 |
| R12 | A privacy request arrives | low | the server stores no personal data outside Stripe: Financial Facts hold no name or email, the inbox holds ids only, and the beacon address hash lives one day; the privacy page states this and points to Stripe for the rest |
| R13 | Sentry web quota exhausted by a client error loop | low | sampling at 10% and spike protection; the organisation quota is shared, so an alert post that Sentry refuses falls to `send_email` (§8.1) |
| R14 | The Sentinel rolls back a good version on a flaky probe | low | Probation fails on two consecutive failed probes, not one; a false rollback costs one alert and one restore commit, and the `restore-loop` guard stops a repeat |
| R15 | `main` moved past the bad commit before the freeze | medium | the restore rewrites `main` only when the range is Renovate's alone; a human commit in the range leaves the freeze to the human, who is present |
| R16 | A Cloudflare outage | low | the Daily is down with it; nothing to correct; admitted in §8.2 |
| R17 | A tick step exceeds 10 ms CPU | medium | pagination at 100 objects; S10 measures; Workers Paid is the alert-requested action if a step cannot fit |

### 10.2 Kill criteria

| Id | Criterion | Action |
| --- | --- | --- |
| K1 | Week-4 median daily completions under 20 and net purchases under 5 in days 31 to 60 | wind down: clear nothing, set the Checkout Pause for good, keep the Worker, KV, Neon Free, the Stripe account, and `/api/key` so that active Run Keys keep activating and restoring; the Daily keeps running |
| K2 | Any manual action that no alert requested, or a third incident, inside the 30-day hands-off test | fix the mechanism that needed it, then restart the 30 days; a third restart ends the test as failed, and the owner chooses between a mechanism rewrite and K1 |
| K3 | The Steam page gets under 500 wishlists in the 30 days after Next Fest, or Valve rejects the build twice | drop P8 |
| K4 | The `refund-rate` alert fires | checkout is already paused by the tick; the owner reads the reasons in Stripe and lifts the pause or not; this is the one planned human read |

### 10.3 First-30-day metrics

| Metric | Source | Read |
| --- | --- | --- |
| M1 Daily completions per day, median of week 4 | `daily_complete` | the habit |
| M2 Share copies per completion | `share_copy / daily_complete` | the virality device |
| M3 Visits per day | `visit` | the top of the funnel |
| M4 Net purchases | `paid - refunded` | the money |
| M5 Alert emails from the ops project | the inbox | reliability |
| M6 Manual actions | the owner's log | the zero-upkeep test |
| M7 Rollbacks, pauses, re-enables, restores | KV history | the self-correction count |

No target for M1 to M4 is a promise. They replace the assumptions in §3.7 at day 30.

### 10.4 Hands-off test

Thirty days from cutover. The owner opens nothing but the alert inbox. The test passes when:

1. Manual actions that no alert requested equal zero.
2. Incidents number two or fewer, each sent one email, each names a failure the system cannot correct by design, and each requested action is one the alert page of S19 lists with its steps.
3. Every automatic action in KV history (pauses, resumes, rollbacks, freezes, restores, re-enables, reconciliation repairs) has a cause the owner can read in the alert page of S19.
4. Every paid Session in Stripe has a `paid`, `active`, or `revoked` row, with no `pending` row older than a day whose Session is not open.

A failed test restarts after the fix (K2).

## 11. Decisions log

| Id | Question | Decision | Reason |
| --- | --- | --- | --- |
| D1 | Rebuild or patch? | Rebuild on the existing generator and money path | 18 human surfaces and 20 unevidenced features cannot be patched into zero upkeep |
| D2 | Keep the name? | Keep Echo Maze | echo sounding fits the chart direction; no equity to lose; no rename cost |
| D3 | Price? | $5.99 once, unchanged | the brief; top of the evidenced band; the $0.30 fixed fee punishes lower prices |
| D4 | Payment provider? | Stripe with Managed Payments, settled in S00; fallback Paddle | the existing Stripe code is tested; Managed Payments removes tax, dispute, and support work; Paddle costs 5% + $0.50 `[unverified]` and a rewrite of two slices |
| D5 | Accounts? | None; a Run Key | Clerk is a provider, a webhook, a bundle, an erasure duty, and a COPPA surface with no retention evidence |
| D6 | Where does the free boundary live? | In the browser | server metering needs a salt, a hash table, a rate table, and a fail-open path; the money gate is the key |
| D7 | How does a buyer recover a lost key? | The return page first; then email plus a second factor on `/key` | no email provider enters the stack; the key never sits in Stripe |
| D8 | Refunds? | Self-serve, full, within 48 hours, once; Stripe's own rules after that | removes the ticket; Managed Payments carries the consumer-protection windows |
| D9 | Disputes? | Stripe handles them under Managed Payments; a dispute revokes, a dispute won restores | every dispute costs more than the sale; evidence is human work; a buyer who wins keeps what they paid for |
| D10 | Learning content and the Warden Challenge? | Deleted | hand-authored content is upkeep; the frame marks the product for children; no one-time parent price is evidenced |
| D11 | Leaderboard? | None | needs a server, anti-cheat, and moderation |
| D12 | Daily clock? | UTC | one Labyrinth for all needs one clock |
| D13 | One counted Run or unlimited? | Unlimited Runs, the revealed chart kept, the Run count in the Share String | the Wordle shape; one Run punishes a first-time player and invites a reload |
| D14 | Streak counter? | Yes, as "days logged", in the browser | the retention device behind daily games; the glossary avoids the word "streak", not the mechanic |
| D15 | Share String or share image first? | String first; image for key holders | text survives every chat app; no evidence that images beat text |
| D16 | Hosting? | Cloudflare Workers Free, settled in S00; Vercel Pro as the fallback | static assets free without a cap; no bill can grow; cron, KV, Durable Objects, and the rollback API inside the free plan |
| D17 | Database? | Neon Free, four tables | the money tables exist; the free tier covers a checkout-only workload |
| D18 | Error tracking? | Sentry, two projects | the ops project is the alert channel; the web project is a digest; OTel and PostHog add packages and no money signal |
| D19 | Dependency updates? | Renovate minor and patch automerge after 7 days behind the build gate; majors disabled; a vulnerability PR automerges at once and overrides a Pin | zero GitHub Actions minutes; the Workers runtime has no forced runtime deprecation; a held major PR becomes routine work, a disabled one does not |
| D20 | Cost cap action? | None needed on Cloudflare Free; the quota stops the API and keeps the Daily | an unbounded bill is worse than a paused checkout; keys verify offline |
| D21 | Auto rollback? | Yes, once per version, to Green History, with freeze, restore commit, and Pin | the brief asks for auto revert; a rollback without a revert re-deploys the fault on the next merge, and a block on one exact version lets the next patch repeat it |
| D22 | Visual direction? | Pilot Chart | ranked first on cost, symbol reuse, thumbnail test, and anti-slop guards; Relief Print is the runner-up |
| D23 | Fonts? | Archivo and Atkinson Hyperlegible Next | OFL, variable, on no slop list, condensed title block fits the Steam capsule |
| D24 | Modals? | Pause only | every feature as a modal was a screenshot finding; pages replace them |
| D25 | Steam? | Yes, as the optional P8 with K3 | the strongest evidenced paid channel at this price; Valve is the merchant of record |
| D26 | Mobile stores? | No | yearly fees and SDK rules force upkeep |
| D27 | Service worker and offline? | Deleted; browser cache only | 7,653 lines with no usage evidence; the client is cacheable without it |
| D28 | Data export and deletion? | Deleted with accounts, after a one-time export of each Pilot Account | the server holds no personal data; Stripe holds the purchase record under its own policy |
| D29 | Order of programmes? | Spike, Cut, Entitlement then Platform, Daily, Generator, Ops, Visual, Rot, Steam, Cutover | unknowns first; the entitlement lands before the platform move so no Clerk route is ported; money and self-correction before paint |
| D30 | Who runs the cutover? | The owner, once, from the S18 checklist | provider settings need the account holder; after that the system runs alone |
| D31 | Token expiry? | Never | an expiring token turns a server outage into a lockout; revocation is best effort and the loss is bounded |
| D32 | Where does operational state live? | Workers KV, not Postgres | a Neon outage must not hide the pause flag or the lease |
| D33 | Who holds the rollback power? | The Sentinel, a separate dependency-free Worker; the tick only raises a flag | a Renovate bump cannot break the thing that undoes Renovate bumps |
| D34 | Which counters trigger a rollback? | `daily_complete / boot_ok`, a zero `boot_ok` with a visit floor, and the `visit` count only | `paid` is too sparse to carry a statistic; a crawler fires `visit` alone, so the ratio rests on script-sent beacons; the zero rule catches a dead page at any traffic |
| D35 | Daily size? | By weekday, 13 to 17 | a size-13 Labyrinth fits a phone without scrolling; the week has a shape |
| D36 | Alert budget? | Two incidents per 30 days, one email each; the web project never alerts | client noise must not spend the hands-off budget |
| D37 | When is the key issued? | At `confirm` on the return page, from the Session id; `restore` for a buyer who never returned | no webhook on the delivery path; no key in Stripe or a URL |
| D38 | How does the probe run during a pause? | The deep form of `/api/ready` with a shared secret, which writes no row | a probe that goes through `/api/checkout` can never see a pause lift |
| D39 | What does a Deploy Freeze block? | Every build whose lock file differs from the green one | a freeze that blocks the restore build never clears |
| D40 | Where does the Block List live? | As Pins in `renovate.json` | a Pin stops the PR before it opens; an exact-version block lets the next patch repeat the fault |
| D41 | How long is a past Daily free? | 7 days by link, then a Run Key | a share link must open for its readers; the archive must keep a paid value |
| D42 | What is the headline score? | The best finished Run's soundings plus the Run count | a cumulative total reads as failure against par; the count carries the scouting cost |
| D43 | What does a Warden contact do? | One Vitality; the Warden goes home, sleeps ten soundings, wakes in Patrol for three | without the Challenge, a Warden that stays adjacent drains a cornered Explorer |
| D44 | What does the webhook inbox store? | Ids only | buyer details rest in Stripe alone; R12 holds |
| D45 | How is a Neon quota exhaustion detected? | By consequence: the tick fails, checkout pauses, one alert | a consumption API needs a sixth secret for one signal |
| D46 | Does the restore commit run when `main` has moved? | Only when every commit in the range is Renovate's; a human commit stops it | the Sentinel never discards a human's work; after launch every merge is Renovate's, so the restore still runs unattended |
| D47 | Pause flag shape? | One KV key per class, `paused:<class>`, written only by its owner; checkout reads all ten | two writers on one eventually consistent key can lose a money-rule pause |
| D48 | Who can refund? | The key holder who also proves the purchase with a second factor | a shared key must not refund a stranger's purchase; an emailed cancel needs the email provider that D7 rejects |
| D49 | Rollback on an upstream outage? | No: the green version is probed first, and an equal failure holds Probation under a `probe` pause | a Stripe or Neon outage during Probation must not spend the rollback, the restore, and three alerts |
| D50 | How is a payment verified? | `payment_status` paid plus the price id, never the amount | Adaptive Pricing localises the amount; today's cents comparison would refuse a EUR buyer |
| D51 | Eleventh device? | Evict the oldest | a refusal locks out a buyer who clears storage; eviction bounds sharing without a lockout |
| D52 | Seed Links and the archive gate? | Seed Links signed by the Worker; `/d/<date>` past 7 days checked in the client | a signature stops URL edits; a server check on `/d/` would cost the Daily its quota immunity (D20), and the seed is derivable either way |
| D53 | Retry seeds? | The hash of `<seed>#<n>` | a suffix collides under the 24-character truncation in `normalizeSeed` |
| D54 | Vulnerability PRs? | Automerge on green with no wait, majors included, overriding Pins | a held vulnerability PR is hand work; a Pin that blocks a fix keeps the hole |
| D55 | What does the deploy gate read? | KV through the management API, failing closed | a gate that skips on an unreachable route ships during a freeze on a quota day |
| D56 | Database driver on Workers? | `@neondatabase/serverless` over HTTP; `pg` is the fallback | a TCP driver pays a TLS handshake per invocation against the 10 ms CPU cap |
| D57 | Alert fingerprint and channel? | Class plus incident start held in KV; both Workers post over HTTP with `send_email` on refusal | a date-keyed fingerprint re-alerts each day of one incident; a refused post must still reach the owner |
| D58 | Store comments? | Off on itch.io and Steam | a comment thread is a moderation surface |

## Revision history

| Round | Critic findings | Revision |
| --- | --- | --- |
| 1 | Critical 5, High 12, Medium 23, Low 16 | All Critical, High, and Medium findings addressed; 15 of 16 Low findings addressed. Changes: operational state moved to KV (C1); the Sentinel Worker takes the probe, rollback, and alert powers out of the app and off Renovate's path (C2, H5, M17); rollback now freezes builds, blocks the bad versions, and restores `main` (C3); slice S00 settles Managed Payments, the Cloudflare terms, and the Stripe re-enable call before code (C4, M12); tokens never expire and devices are counted (C5, M11); the anomaly check acts on `boot_ok` and `daily_complete` ratios with count thresholds and never on `paid` (H1 to H3); Sentry split into a web project and an ops project (H4, M9, M10); Cloudflare static assets keep the Daily running at the quota and a Cloudflare outage is admitted (H6, M15); beacons leave Postgres (H7); the Workers runtime removes the Node deprecation path (H8); the tick re-enables the webhook endpoint through the documented `disabled` parameter (H9); refund and restore need a second factor (H10, M18); the Daily allows unlimited attempts with the revealed chart kept (H11, M20); `/d/<date>` is free for anyone (H12); the pause rule is two failures, three greens, two resumes, then a 24-hour hold (M1); the key never enters Stripe (M2, M3); the secrets table (M4); four tables remain (M5); Pilot Account data export and the named backfill step (M6, M7); activation on `payment_status = 'paid'` and the async events (M8); refund within 48 hours (M13); the Steam build-time unlock (M14); provider emails listed and the five-year domain renewal (M16); the phone viewport above size 13 (M19); the Daily override as a config commit (M21); the Seed Link carries the version (M23); the `-R` suffix, the glyph count, exact par, the Session abandon rule, the buy line on `/key`, the privacy note, the accessibility floor, the dropped time claim, the Neon figures, the cached ready route, keys alive after wind-down, the interim production state, the refund fee, and the weekday table (L1 to L11, L13 to L16). Not taken: L12, which asked for a second alert channel on every alert; the plan sends the email fallback only when Sentry fails, to keep the alert budget readable. |
| 2 | Critical 3, High 6, Medium 20, Low 8 | All findings addressed. Changes: the deep probe runs through `/api/ready` with a shared secret and writes nothing, so Probation can pass during a pause (C1, D38); a Deploy Freeze blocks only builds whose lock file differs from the green one, so the restore build passes (C2, D39); the `visit` beacon is an `<img>` in static HTML and a visit drop of 80% after a deployment counts as a fault (C3); the public `/api/ready` reports Neon from the last tick, so the probe wakes nothing (H1); the tick raises an `anomaly` flag and the Sentinel runs the rollback chain against the green before the current version from a ten-deep Green History (H2); the key is issued at `confirm` from the Session id and the webhook leaves the delivery path (H3, M10, D37); the Block List becomes Pins in `renovate.json` written with the restore commit (H4, D40); the headline is total soundings across attempts (H5, D42); a Warden contact sends the Warden home and the spawn floor sits beyond the Intercept radius (H6, D43); the tick's `sentinel-dead` alert is suppressed after an account stop and the client treats a failed checkout fetch as a pause (M1); the beacon credit is per event type (M2); Bot Fight Mode waits on an S00 test (M3); majors are disabled and the stale-PR alert becomes the Sentinel's vulnerability-PR alert (M4); the entitlement ships on Vercel before the platform move, so no Clerk route is ported (M5, D29); Workers Builds minutes go to S00 and size the Renovate schedule (M6); the preflight moves to the build and every tick step paginates at 100 objects (M7, R17); the Seed Link carries size, Echoes, and version (M8); the build prerenders 400 Daily pages (M9); the Link receipt identifiers join the second factors and S00 reads one (M11); the four Managed Payments reads and the refund call go to S00 (M12); the inbox stores ids only (M13, D44); the Sentinel alerts `tick-dead` (M14); reconciliation computes the refund rate and pauses at 10% (M15); `freeze-stuck` alerts at six hours (M16); Probation fails on two consecutive probes and a same-tree rollback stops with `restore-loop` (M17, R14); the restore always rewrites `main` to the green tree (M18, D46); `check` reads a KV revocation list and `activate` is rate-limited (M19); past Dailies are free for 7 days and the unlock line names the Atlas first (M20, D41); the domain is prepaid with no stored card (L1); the fine-grained token is required and the R5 fallback is a ruleset bypass (L2); the version-window and KV-write figures are corrected (L3); the glossary rewrite joins S07 and S08 (L4); a `pending` row is abandoned only on an `expired` Session and may become `paid` later (L5); the Warden takes a magenta danger circle and a thumbnail test (L6); K1 keeps Neon and Stripe and R6 names the token's reach (L7); §7.5 reads S03 as an owner-authorized migration (L8). |
| 3 | Critical 3, High 9, Medium 13, Low 10 | All findings addressed. Changes: Probation fetches the page and the bundle and renders the page once, and a zero-`boot_ok` rule with a visit floor needs no baseline (C1, M3); one KV key per pause class, each written by its owner, and `/api/checkout` reads all ten (C2, D47); `refund` needs the same second factor as `restore` (C3, D48); a failed Probation replays the probe against the green version and holds on an equal failure (H1, D49); the restore commit runs only on a Renovate-only range (H2, D46, R15); S05 keeps the public-checkout flag closed and S06 removes it under `paused:prelaunch` (H3); reconciliation retrieves each open row by Session id across ticks and a `flood` pause caps Sessions per day (H4); fingerprints carry the incident start stored in KV (H5, D57); `confirm` checks the price id, never the amount, and the Financial Fact stores currency and USD settlement (H6, D50); a won dispute restores the key (H7, D9); Seed Links are signed by the Worker and the archive gate is stated as a client-side lock (H8, D52, R2); retry seeds come from a hash of `<seed>#<n>` (H9, D53); the headline is the best finished Run plus the Run count (M1, D42); the Share String shows three Runs and collapses the rest (M2); `activate` evicts the oldest device (M4, D51); vulnerability PRs automerge without the wait and override Pins (M5, D54, D19); beacons batch into two requests per visit (M6); `check` and `link` are rate-limited and a KV read error answers `ok` for play (M7); the deploy gate reads KV through the API and fails closed (M8, D55); Renovate automerge waits for S16 after the Sentinel (M9); K2 counts incidents and caps restarts at two (M10, D36); S11 sets the `main` ruleset bypass and alerts `restore-failed` on a rejected push (M11); the Neon arithmetic covers purchase wakes (M12); `@neondatabase/serverless` over HTTP is the driver, one dependency for the owner's approval (M13, D56); KV writes fall under 200 per day (L1); a woken Warden patrols three soundings (L2, D43); both Workers post alerts over HTTP with the email fallback on refusal, and S11 sends a deliberate alert by both channels (L3, R13); the deferred-webhook claim carries `[inference]` (L4); the dispute provision is labelled conservative (L5); R2 drops its unsourced rate (L6); Day links carry the date (L7); `/key` strips `session_id` from the URL and from Sentry (L8); the plan uses Labyrinth and Run throughout and S05 rewrites the Lifetime Membership entry (L9); store comments are off on itch.io and Steam (L10, D58). |
