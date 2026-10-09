# Echo Maze profitability upgrade plan

Status: reviewed; the owner authorizes plan publication only. Implementation remains unapproved.
Revision: 2026-10-08, America/Chicago.
Baseline: local and deployed commit `472a6ec`.

This revision supersedes the prior approval and go-live claims in this file.
The current instruction permits this revised plan's commit and push to GitHub main only.
Recommended decisions are planning defaults, not implementation authorization.
Application code, tests, configuration, and live operations remain unchanged.

## 1. Product and business outcome

Make Echo Maze a distinct browser puzzle that parents choose to buy.
Keep one price: **$5.99 USD once for one Explorer account**.
Lifetime Membership has no renewal and grants no gameplay power.
Family bundles, school licenses, subscriptions, advertisements, and second prices stay outside this release.

The primary buyer is a parent or homeschool caregiver.
The Explorer plays a Labyrinth adventure with reviewed Warden Questions and visible Quest progress.
The initial promise is practice through play, not proven educational improvement.

Proposed customer description:

> Explore twenty Labyrinths. Recover Echoes and answer Warden Questions to reach each Gate.
> Try one Guest Run, then three free account Runs. Unlock unlimited Personal Runs for $5.99 once.
> No subscription. No paid power.

Review the child-account and consent path before commercial launch.
The current Clerk identity contract does not establish a parent-managed household model.
Keep one account per purchase unless an approved specification changes that contract.

Profit is a measured result, not a guarantee from a redesign.
Success requires net purchases, controlled service costs, and a repeatable source of new adult buyers.
Prioritize those outcomes over a framework or game-engine rewrite.

## 2. Verified baseline and findings

### Current observations

| Surface | Evidence on 2026-10-08 | Meaning |
| --- | --- | --- |
| Public deployment | `https://maze-v2-zeta.vercel.app/api/health`: 200, version `472a6ec` | The public app matches the local commit. |
| Readiness | `/api/ready`: 503; database and Clerk report `ok`; Stripe reports `unconfigured` | Commercial readiness is incomplete. This probe does not prove all migrations exist. |
| Run Access | `/api/access/config`: `enforcementEnabled=false`, `guestDemoEnforcementEnabled=true` | Account Run Access is unmetered at this snapshot. |
| Price | `shared/lifetime-product.js:1` and `:2`: 599 cents, USD | The current single price is verified. |
| Theme | `design.md:8` and live browser crops | The design adopts the reference's grid, pastel fields, islands, and bridge vocabulary. |
| Billing configuration | `server/lifetime-config.js:64` | Only Stripe test keys are accepted. |
| Payment verification | `server/lifetime-domain.js:32`; `server/stripe-lifetime.js:113` and `:194` | Live Checkout and PaymentIntent objects are rejected. Configuration alone cannot enable revenue. |
| Purchase provenance | `server/lifetime-store.js:41`, `:51`, and `:85` | Purchase reuse and active access omit a test/live boundary. Existing rows need classification before commercial cutover. |
| Product events | `server/product-events.js:4` and `:131` | The recorder writes logs. It supplies neither a durable SQL funnel table nor a signup event. |
| Question cost | `server/question-service.js:274`, `:406`, `:439`, and `:556` | A configured provider can reproduce an already reviewed Question through a paid model call. |
| Class Play | `docs/adr/0030-classroom-sponsored-run-grants.md:6` and `:30` | Students use sponsored Classroom Run Grants. Parent purchases cannot replace that contract through copy. |
| Bundle budget | `scripts/check-bundle-budget.mjs:31` | Shared styles have a 13 KB gzip ceiling. The prior 12 KB claim is obsolete. |
| Agent-Reach | `uv tool list`: `agent-reach v1.5.0` | The tool exists outside the repository. Channel health and install provenance remain unverified. |
| Stitch | Authenticated read of project `3244739478942983822` | The project exists. Its active military-console metadata conflicts with the repository's Journey system. |

Scope: the reference, public entry surface, critical commercial paths, domain ADRs, operational docs, and the prior plan.
This is a profitability-plan review, not a complete security audit or fresh full-suite acceptance run.
Historical test counts remain historical evidence in `docs/roadmaps/echo-maze-current-status.md`.
Revenue history, provider invoices, migration state, and channel conversion remain unverified.

### Findings and dispositions

| ID | Severity | Confidence | Finding | Disposition |
| --- | --- | --- | --- | --- |
| P01 | High | High | The prior plan asserts approval despite the current approval hold. | Reset status and automatic implementation instructions. |
| P02 | High | High | Live payments fail at configuration and verification boundaries. | Add strict end-to-end production billing support. |
| P03 | High | High | Four sales cover only an idealized $20 host bill, not complete business costs. | Include refunds, acquisition, service provision, owner time, and accumulated members. |
| P04 | High | High | Parent-paid Class Play contradicts ADR 0030. | Keep Classroom authority separate; defer new Classroom sales. |
| P05 | Medium | High | A SQL view cannot supply funnel stages absent from durable data. | Define persistence, deduplication, attribution, and honest denominators. |
| P06 | Medium | High | Paid template reproduction adds cost without new reviewed content. | Serve reviewed Questions directly on the commercial gameplay path. |
| P07 | Medium | High | The proposed Lantern Maze name already identifies other games. | Keep Echo Maze for launch; require clearance before a future rename. |
| P08 | Medium | High | The theme repeats the reference's distinctive visual vocabulary. | Replace that vocabulary across all app surfaces. |
| P09 | Medium | High | Provider limits, bundle budgets, and review timing were treated as fixed facts. | Use actual account evidence, repository gates, and the local review protocol. |
| P10 | Medium | Medium | Viral views do not prove willingness to buy this app. | Run small channel experiments with purchase and cost outcomes. |
| P11 | High | High | Stored test purchases and entitlements can cross the proposed live-mode boundary. | Persist mode provenance and complete a controlled cutover before commercial activation. |
| P12 | Medium | High | Public payment and enforcement must wait for live acceptance. | Complete a restricted owner pilot before public activation. |
| P13 | Medium | High | Account deletion cascades to purchase records through the access table. | Separate required financial facts from erasable account data before durable revenue metrics depend on them. |

Findings are unfiltered. Implementation follows dependency order, not severity alone.

## 3. Evidence-based market position

Public evidence supports a narrow parent-facing experiment.
It does not establish the most profitable channel for Echo Maze.

| Evidence | Source | Decision |
| --- | --- | --- |
| YouTube and Facebook reach adults across age groups. Facebook use is especially strong among ages 30–49. | [Pew adult social-media survey](https://www.pewresearch.org/internet/2025/11/20/americans-social-media-use-2025/) | Prioritize parent reviewers and permitted homeschool communities. This is an audience-fit inference. |
| Shorts has substantial reach, but ordinary description and comment URLs are not clickable. | [YouTube reach](https://blog.youtube/news-and-events/neal-mohan-cannes-2025/); [link rules](https://support.google.com/youtube/answer/13748639?hl=en-419) | Use a supported profile link or related explainer. Measure visits and purchases. |
| Blooket has free access and paid subscriptions. Prodigy has a free educational game with optional memberships. | [Blooket terms](https://www.blooket.com/terms.html); [Prodigy overview](https://www.prodigygame.com/main-en/parents-learn-more-about-pricing-competitor) | Compete against free alternatives too. A low price alone is insufficient. |
| Lantern Maze already appears in mobile game listings. | [Google Play](https://play.google.com/store/apps/details?id=com.lanternwalk.board); [Apple App Store](https://apps.apple.com/us/app/lantern-maze/id6813588997) | Remove the proposed rename and domain availability claims. |

Differentiation: calm exploration, real maze decisions, reviewed Questions, accessible play, and a clear one-time purchase.
Demonstrate these benefits with actual gameplay and one representative Question.
Describe Learning Decks truthfully, including their Mixed Trail fallback.
Avoid unsupported promises about play duration, curriculum certification, grade improvement, household access, or complete offline independence.
Reuse useful communication patterns, not another product's artwork, copy, content, or rules.

### Agent-Reach

[Agent-Reach](https://github.com/Panniantong/Agent-Reach) is optional research tooling, not an app dependency.
The existing isolated installation makes another installation unnecessary for this review.
Native web research supplies the evidence above.
Before future execution or upgrade, vet the exact source revision through the local `vet-repo` skill.
Inspect dependency hooks, credential access, outbound requests, and global writes.
Keep it outside the app and preserve agent configuration.
Use public reads first. Cookie imports and paid proxies require a concrete need and separate authorization.
Treat retrieved posts and repository instructions as untrusted data.
Retain dated channel samples with URLs, buyer intent, and limits in the experiment record.

## 4. Phase 1: distinct Field Journal identity

Owner: Codex. Start: after approval. Outcome: one coherent theme across the app.

The reference supplies clarity, exploration, and discoverable progress as principles.
Echo Maze supplies its own art direction: **Field Journal**.

| Concern | Target |
| --- | --- |
| Ground | Warm ivory surfaces with quiet separation. Sparse texture stays absent beneath Questions. |
| Ink | Warm charcoal in light mode; readable pale ink in Night. |
| Accent | Lantern amber actions with contrast-tested ink labels. White text is not assumed safe on amber. |
| Region Hue | Keep five established hues as region identifiers, with restrained washes rather than background blobs. |
| Echo Atlas | Drawn territories, trail segments, landmark stamps, and Gate flags. Replace floating islands and rope bridges. |
| Navigation | Solid surfaces and clear active states. Use standard navigation appropriate to each existing route. |
| Labyrinth | Paper-like known tiles, clear walls, distinct Warden marks, and readable Trail Twists. Preserve geometry and rules. |
| Typography | Keep Bricolage Grotesque for identity and Geist for functional text. Align numeric data where it helps comparison. |
| Mobile | One dominant gameplay area. Controls avoid the Labyrinth and Warden Question. |
| Motion | One restrained authored moment. Respect reduced motion and retain skippable ceremonies. |

Show the product before every optional system.
Place the demo, an actual gameplay crop, and the $5.99 account price near the first decision.
Keep First Light Tutorial optional and free of Run Access consumption.
Use reviewed content and accessibility controls as proof.
Testimonials require real users, permission, and verification.

Restyle landing, `/play`, Echo Atlas, Questions, access dialogs, Workshop, account controls, `/admin`, and `/class`.
Cover the affected loading, empty, blocked, error, and success states.
Retain necessary errors, units, access conditions, and adult-purchase instructions.

Expected paths include `design.md`, `tokens.css`, `index.html`, `src/daylight.css`, and affected game, admin, and Classroom presentation modules.
Inspect ownership before the spec fixes the file list.
Preserve Quest Progress, Run Records, Question revision identity, recovery, and Theme Choice.
Update the Journey definition in `GLOSSARY.md` and applicable presentation ADRs when the approved theme replaces the island vocabulary.
Keep game-rule terms unchanged.

Resolve applicable installed design skills through `skill-library` and follow `instructions/design.md`.
Apply the shell contract, Hallmark, Impeccable, and relevant token and accessibility skills.
Use design-recon for a new composition that needs arrangement evidence.
Lock the revised `design.md`, then reconcile the paired Stitch project's conflicting metadata.
Obtain desktop and mobile visual references from that project.
An authenticated read does not complete the visual preflight.

Acceptance:

- The app has distinct composition and visual vocabulary beyond a palette swap.
- Affected routes use canonical tokens and consistent Theme Choice.
- Contrast, focus, keyboard access, Trail Compass, and Read Aloud remain usable.
- Evidence covers 1920×1080 and 390×844, light and Night, plus the System transition.
- Crop inspections cover the Atlas, Warden Question, payment state, and mobile controls.
- The Impeccable detector and repository bundle gate pass without broad suppression.
- Storage failure, browser-bar color, hue mixes, and lazy CSS preserve the relevant solution-note contracts.

## 5. Phases 2–4: commercial acceptance

Start these phases after the Phase 1 theme is complete.
Prepare live-account operations as reviewable steps under section 10.

### Phase 2: dependable payments and low-cost play

Owner: Codex for code; owner for financial accounts.

Add an explicit test/live billing mode that matches the Stripe key and deployment.
Default to test. Local and preview environments reject live mode.
Production requires an explicit live selection before commercial checkout becomes available.

Bind Price, Checkout Session, PaymentIntent, and webhook verification to that mode.
Retain fixed amount, currency, quantity, ownership, signature, and idempotency checks.
Reject mode mismatch and incomplete configuration without access or a healthy readiness claim.
Persist verified billing mode with purchases, entitlements, and financial event provenance.
Partition pending purchase reuse, access projection, refunds, disputes, and idempotency keys by mode.
Test purchases never supply commercial access or revenue counts.
Recover mode for existing records from verified Session or PaymentIntent provenance before cutover.
Preserve legitimate purchased access. Unclassified records block cutover; never silently relabel or delete them.
Keep test and live state distinct through the schema and environment contract.
Preserve three free Personal Run starts and completion of an authorized Personal Run after an access change.
Preserve ADR 0007 refund and dispute behavior.
Keep Class Expedition billing unavailable for this release.

Expected source includes billing configuration, domain verification, Stripe integration, purchase and access stores, migrations, composition roots, readiness, and their tests.
Record the test-only revenue boundary in `docs/solutions/` after the fix, with verified source references.

Serve the resolved Reviewed Question Revision directly during commercial gameplay.
Remove paid template reproduction from that path rather than another fallback layer.
Preserve deck selection, freshness, Capstone Questions, Echo Lens, Quest II, and immutable revisions.
Any retained author-side AI tool supplies a draft for human review before publication.
It has separate cost authorization and receives no child-specific play data.

Acceptance covers purchase, cancel, delayed confirmation, duplicate returns and webhooks, refund, dispute, and restart recovery.
Wrong mode, ownership, Price, amount, quantity, or signature must fail closed.
Test-to-live acceptance covers pending, active, refunded, and disputed stored purchases.
Test Checkout Sessions are never reused in live mode; test events cannot change live entitlements or commercial counts.
Stored active Lifetime Membership remains usable during Stripe downtime.
Normal gameplay makes zero paid LLM requests with the reviewed content contract intact.

### Phase 3: durable funnel and cost evidence

Owner: Codex. Define events and denominators before implementation.
Existing logs are diagnostic evidence, not a durable funnel database.
Use authoritative account and purchase records where available.
Persist only the extra counters and deduplication keys the metrics require.

Terms specific to this plan:

- **Campaign Code**: one allowlisted source label for an adult offer, not a visitor identifier.
- **Qualified Adult Visit**: a non-bot request on that adult offer from a target channel, with no claim of unique identity.
- **Net Purchase**: one verified new paid account after full refunds and unresolved disputes are excluded.
- **Contribution**: sale proceeds less payment, refund, acquisition, and allocated service costs before fixed costs and owner labor.

| Metric | Source | Boundary |
| --- | --- | --- |
| Adult offer visits by campaign | Explicit adult entry surface and fixed campaign allowlist | Aggregate requests, not unique people; no fingerprint or child trail. |
| New account cohort | Verified Clerk lifecycle or server-owned first-account record | Existing account ID and date; no contact details in analytics. |
| Personal Run activation | First committed, nonduplicate Personal Run Grant | Guest, Classroom, and practice activity remain separate. |
| Checkout creation | First valid Checkout Session per purchase | Reused sessions and repeated buttons do not inflate purchases. |
| Net purchases | Verified purchase state reconciled with refunds and disputes | One paid account once; a browser return is not revenue. |
| Cost and support | Invoices, resource usage, support minutes, and refunds | Separate cash expenses, future service provision, and owner time. |

Use account-cohort rates only when records support the denominator.
Commercial purchase and refund metrics include verified live-mode transactions only.
Do not claim unique Guest-to-signup conversion without lawful, defined linkage.
Treat visits-to-purchases as an aggregate diagnostic ratio until attribution limits are explicit.
Capture a bounded campaign code on an adult entry path.
Unattributed purchases stay unattributed.
Child Questions, answers, identities, and raw actions stay outside campaign data.

Define retention and deletion in the spec; proposed event deduplication retention is 30 days.
Payment records follow the applicable financial retention policy instead.
Account deletion currently removes purchase rows through `player_access` (`server/user-deletion-store.js:91`; `db/migrations/0003_lifetime_membership.sql:9`).
Define privacy-minimized financial facts independently of erasable account records before metrics depend on purchase retention.
Acceptance covers account deletion, retained totals, and reconciliation of a subsequent refund without restoration of the deleted profile.
Raw URLs, emails, IP addresses, public usernames, and arbitrary fields stay outside analytics.
Cover atomic duplicates and concurrency.
Analytics failure never blocks a purchase, Run Grant, or entitlement.
Purchase and refund totals remain recoverable after a counter outage.

Use an admin-only export or table first.
Add metric cards only when they help the owner make a channel decision.
Introduce no analytics vendor by default.
Inspect the optional PostHog forwarder and live configuration before any privacy claim.

### Phase 4: production launch

Owner: Codex for technical evidence; owner for accounts, policies, and financial actions.

1. Record actual provider plans, usage, support contact, and commercial-host permission.
2. Review child-account, consent, public profile, scoreboard, telemetry, and deletion behavior against the intended audience.
3. Publish accurate privacy, purchase, refund, support, and service-lifetime terms before the live offer.
4. Inspect the production migration ledger. Apply only required pending migrations after a recoverable snapshot.
5. Complete Stripe test-mode acceptance. Verify the one-time USD Price and signed webhook destination.
6. Select the approved commercial host plan and configure reviewed live settings. Keep secrets outside repository artifacts.
7. Reconcile stored payment provenance and confirm that test state cannot grant live access or enter commercial metrics.
8. Restrict live checkout to the authorized owner pilot. Keep public checkout closed and public Run Access enforcement off.
9. Complete the owner-operated purchase and refund. Verify entitlement activation, subsequent access change, and replay recovery.
10. Complete desktop, mobile, keyboard, assistive-technology, rollback, and member-continuity acceptance on the production path.
11. Enable public checkout and Run Access enforcement only after the pilot and production acceptance receipts pass.
12. Confirm readiness 200 and the same verified commercial behavior after public activation.

The owner-only release gate is temporary. It prevents public payment before production proof.
Remove it after the accepted pilot receipt permits public activation.

The prior claim that migrations `0018` through `0030` are absent remains unverified.
Inspect the ledger and dependencies, including migrations after `0030`, before an operation plan names a range.
Verified Daily, offline receipts, and Classroom require acceptance if exposed or advertised.
An optional unready feature stays explicitly unavailable rather than silently partial.

A database `ok`, a payment return URL, or a green local suite alone cannot close commercial acceptance.
Calling the account adult-owned does not establish children's privacy compliance.
Use the actual data flow and the [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) for the launch review.

## 6. Phase 5: acquisition experiments

Owner: Codex prepares assets; owner approves and publishes outreach.
Start after payment and measurement acceptance.
Optimize for adult buyers at positive contribution, not maximum reach.

| Priority | Route | Experiment | Evidence |
| --- | --- | --- | --- |
| 1 | Parent and homeschool YouTube reviewers | Ten relevant reviewer candidates and one truthful gameplay explainer. Owner-authorized outreach asks for review permission. | Adult visits, net purchases, and total asset or referral cost. |
| 1 | Homeschool groups and newsletters | Two practical use-case posts with a real sample Question, only where promotion is permitted. | Purchases, objections, and support time. |
| 2 | Shorts and Instagram Reels | Six clips with three demonstrations: exploration, Warden Challenge, and the one-time offer. | Visits through supported links, then purchases. |
| 2 | TikTok | Reuse one suitable adult-facing clip after account and link eligibility are clear. | Incremental visits and purchases. |
| 3 | Search and teacher referrals | One useful parent guide. Teachers share the ordinary Personal Play demo without a Class Play promise. | Organic adult visits and purchases over a longer window. |
| Later | Product Hunt, portals, app stores, ESA marketplaces | Reconsider after a profitable channel exists and its rules and costs are verified. | Incremental margin after approval, fees, and support. |

Reviewer access uses the existing trial until a safe authorized access mechanism exists.
Discount codes, affiliates, and free Lifetime Membership grants are not assumed to work.
A disclosed review-access exception requires its own entitlement contract.
Keep the public purchase price unchanged.

Record creative, audience, date, campaign code, visits, purchases, refunds, cash cost, and owner minutes.
Compare two creatives per primary channel.
Use 100 qualified adult visits as a learning checkpoint, not statistical proof.
At zero purchases, inspect payment failures and audience fit before another asset batch.
Scale only after positive contribution persists across two batches.
Record uncertainty for small samples.

Paid ads, sponsorships, and commissions wait for a spend cap and measured allowable acquisition cost.
No messages, posts, subscriptions, contacts, or marketplace applications are sent during this review.

## 7. Unit economics and lifetime obligations

The US domestic-card example uses Stripe's published 2.9% plus $0.30 fee.
Other methods, jurisdictions, taxes, disputes, and services change the result.
[Stripe pricing](https://stripe.com/pricing); [refund fee treatment](https://support.stripe.com/questions/understanding-fees-for-refunded-payments).

| Per new paid account | Illustrative USD |
| --- | ---: |
| Gross price | 5.99 |
| Domestic-card fee | 0.47 |
| Net before other costs | 5.52 |
| Expected refund loss at an assumed 3% full-refund rate | 0.18 |
| Incremental service and support provision | 0.25 |
| Future Lifetime Membership service provision | 0.75 |
| Contribution before acquisition and fixed costs | 4.34 |
| Proposed acquisition ceiling | 1.00 |
| Contribution after that acquisition cost | 3.34 |

Refund rate and provisions are assumptions, not measurements.
Original fees remain charged when payments receive refunds.
Use exact receipt cents; the explanatory table rounds amounts.
The illustration counts original successful payments before their refund outcomes.
Actual reports subtract recorded refunds once, rather than both actual loss and the illustrative refund provision.
Track dispute losses separately.
Allocate fixed and incremental costs once, so the provision does not duplicate a provider invoice.

Let `F` be monthly fixed cash costs and `C` the measured contribution per new paid account.
Cash break-even is `ceil(F / C)` when `C > 0`.

| Fixed monthly cost scenario | New purchases at $3.34 contribution |
| --- | ---: |
| $20 | 6 |
| $60 | 18 |
| $120 | 36 |

These scenarios are not verified invoices.
At 100 new purchases and $60 fixed costs, the illustration leaves about $274 after acquisition and the stated provisions.
It excludes owner labor, development-cost recovery, taxes, exceptional disputes, and unmodeled usage.
It is not full business profit.

Track actual owner hours and an explicit hourly value.
At an illustrative $25 per hour, four monthly hours add $100 of economic cost.
A $1,000 monthly surplus with $60 fixed costs needs about 318 new purchases at the illustrated contribution.
At an assumed 2% visit-to-purchase ratio, that requires about 15,900 qualified adult visits monthly.
Neither that conversion nor traffic is established.

Keep separate cash and economic-profit reports.
Track free users and accumulated Lifetime Members, not only new buyers.
Model zero-new-sale months and 12- and 24-month service demand.
Refresh provisions from cohort usage. The $0.75 assumption does not fund an unlimited lifetime by itself.
Keep unused service provision separate from acquisition funds.
Reduce waste before any change to purchased access.
Permanent Run Access cannot become a quota or renewal to repair margin.

### Current provider facts and recurring charges

- Vercel reserves Hobby for non-commercial personal use. Pro starts at a listed $20 monthly price with usage terms.
  [Commercial use](https://vercel.com/docs/limits/fair-use-guidelines); [price](https://vercel.com/pricing).
- Clerk lists 50,000 monthly retained users on Hobby. Organization limits and add-ons differ from personal authentication.
  Verify the account before a Classroom promise. [Clerk pricing](https://clerk.com/pricing).
- Neon reports 1 GB Free storage per project. Storage alone does not establish compute cost or production fit.
  [Neon announcement](https://neon.com/blog/neon-free-plan-1-gb-per-project).
- Google publishes Gemini 3.8 Flash introductory rates and a 2027 increase. Direct reviewed Questions remove that gameplay dependency.
  [Google pricing](https://ai.google.dev/gemini-api/docs/pricing).

Vercel Pro creates a recurring charge.
Paid database tiers, identity add-ons, observability plans, and research services require concrete cost records and approval.
Use the current commercial-capable stack where it fits.
Evaluate another host only when measured cost or reliability justifies migration.

## 8. Milestones and business decisions

Estimates begin after approval and required account access.
Milestones close on evidence, not a promised week or fixed PR count.

| Milestone | Owner | Completion criterion |
| --- | --- | --- |
| M1: identity | Codex | Phase 1 UI receipt passes across affected surfaces. |
| M2: revenue path | Codex | Billing-mode regressions and direct reviewed-Question acceptance pass. |
| M3: measurement | Codex | Durable counts and reconciliation survive retries and analytics failure. |
| M4: launch | Owner and Codex | Policy, migration, billing, accessibility, and live purchase acceptance close. |
| M5: first 30 launch days | Owner with Codex analysis | Target: 20 net new paid accounts, two channel batches, actual cost and objection records. |
| M6: day-90 review | Owner with Codex analysis | Target: 100 net new paid accounts in the latest 30 days and positive measured cash contribution. |

Targets are goals, not forecasts.
Start the launch clock at commercial acceptance.
Report counts beside rates and include unattributed purchases.
Distinguish zero traffic, broken payment, and weak demand.

Continue when acquisition and service costs leave positive contribution.
Pause paid expansion when cost per buyer exceeds allowable contribution.
If qualified traffic does not buy, revise benefit proof, offer clarity, or channel before a broad rebuild.
If service costs still exceed revenue, present an explicit business decision.
The day-90 review cannot add another price or revoke purchased access.

## 9. Implementation and review after approval

Use the current checkout and preserve unrelated work.
Separate identity, billing, Question cost, measurement, and operations into reviewable slices.
A complete application audit identifies further necessary fixes before release.
Each rewrite names a proven defect, its business effect, and a smaller alternative.
Replace a subsystem only when the smaller fix cannot meet acceptance.

Read the shared pipeline, runtime, review, and design instructions at their trigger points.
Use the glossary and relevant `docs/solutions/` before each spec.
Use the GitHub Issue tracker for approved specs and tickets.
Print grill questions with recommended answers adopted.
An unresolved runtime claim receives a bounded experiment, not a fabricated answer.

Each slice names writable paths, scenarios, and local gates.
Billing and persistence require negative, duplicate, and concurrency tests.
UI polish uses browser acceptance without redundant implementation-mirror tests.
At milestones, use a fresh-context read-only verifier with an explicit response length.
Review prompts ask: "Are there bugs or vulnerabilities in this code?"
Record every finding's severity, confidence, evidence, and disposition.

Before pushes, run `npm run check` and applicable UI detector and gameplay checks.
Use repository bundle limits and the correct e2e build mode.
Refresh affected desktop, mobile, adverse-state, and accessibility evidence after fixes.

Merge to `main` through local review and CodeRabbit.
Engine 2 uses `gpt-6.1-sol` with `medium` reasoning effort.
Follow documented 60-second polls, 15-minute diagnosis, and bot-verified rate-limit rules.
Pending review is not a merge exception.
Print the merge receipt, merge, clean up the merged branch, and verify deployed behavior.
The current publication contains this plan only. Application implementation requires separate explicit authorization.

## 10. Recommended decisions and approval envelope

| Decision | Recommended answer adopted for this plan |
| --- | --- |
| D1: Name | Keep Echo Maze for launch. Remove the colliding Lantern Maze proposal. |
| D2: Theme | Field Journal: amber and ink, drawn territories, and clear functional surfaces. |
| D3: Buyer and price | Parent-led Personal Play; $5.99 once per Explorer account; one public price. |
| D4: Scope | Correct commercial blockers and redundant cost paths. Preserve dependable rules and data contracts. |
| D5: Classroom | Preserve authority boundaries. Defer new license sales and parent-paid Class Play conversion. |
| D6: Research | Native research now; vet existing Agent-Reach before execution or upgrade. |
| D7: Channels | Parent YouTube and permitted homeschool communities first; short-form platforms as measured tests. |
| D8: Costs | Direct reviewed Questions, minimal first-party metrics, and no new paid service without cost approval. |
| D9: Publication | Publish this revised plan to main now. Implementation needs separate approval; promotion needs specific send or publish authorization. |

Approval can authorize local implementation, tests, review, PRs, and merge to main within this plan.
It does not itself authorize recurring bills, live-data migrations, real charges, or outreach.
Prepare those actions with exact targets, costs, recovery steps, and acceptance evidence before the final owner action.
The current authorization covers plan publication only, under the owner's latest instruction.
The shared pipeline's external-action rules also apply to any later implementation authorization.

Next action after publication: obtain explicit implementation approval.
After that approval, start Phase 1 and complete the authorized phases in dependency order.
Publication of this plan does not start implementation or commercial launch.
