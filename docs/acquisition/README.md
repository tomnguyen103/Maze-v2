# Acquisition kit

This kit prepares plan Phase 5 (`docs/plans/profitability-upgrade-plan.md`). It
holds drafts and a log template. It sends nothing.

The owner approves and sends each item. No agent posts, sends, subscribes or
contacts anyone. Start Phase 5 only after launch runbook step 12
(`docs/launch-runbook.md`) passes.

## Contents

| File | Use |
| :-- | :-- |
| `experiment-log.md` | One row per creative and channel window. |
| `reviewer-criteria.md` | The test that a reviewer candidate must pass before outreach. |
| `gameplay-explainer.md` | A truthful script for a reviewer or an owner video. |
| `clip-briefs.md` | Six short clips: exploration, Warden Challenge and the one-time offer. |
| `homeschool-posts.md` | Two use-case posts with a real sample Question. |

## Rules

- The owner approves and sends each item.
- The kit holds no contact data. Keep reviewer names, emails and handles in the
  owner's own records, not in this repository.
- The offer is one price, `$5.99 USD` once, bought by an adult.
- The kit offers no discount, coupon, affiliate commission, free Lifetime grant or second price.
- A claim in a creative must match the game today. Check a claim against the
  landing page before you publish.
- Post only where the group or platform rules permit promotion.
- Show no child's face, voice, name or account in a creative.

## Campaign links

Each link points to the landing page with one Campaign Code: `/?c=<code>` on
the production site. A visit counts only under a code in
`shared/campaign-codes.js`. Any other code counts under the empty campaign.

A Campaign Code identifies a channel, not a creative. To compare two creatives
on one channel, run them in separate windows and record each window as its own
log row.

## Primary channels

Each primary channel compares two creatives. Run creative A for one window,
then creative B for the next window of the same length.

| Channel | Campaign Code | Creative A | Creative B |
| :-- | :-- | :-- | :-- |
| Homeschool groups and newsletters | `newsletter` | Post 1 | Post 2 |
| YouTube Shorts | `youtube` | Clip 1 | Clip 2 |
| Instagram Reels | `instagram` | Clip 1 | Clip 2 |

Clips 3 to 6 are the next batches on the same two video channels: Clip 3
against Clip 4, then Clip 5 against Clip 6.

Reviewer videos use the `partner` code. Each reviewer makes their own video, so
compare reviewers, not creatives. TikTok (`tiktok`) reuses one adult-facing clip
only after the owner confirms account and link eligibility.

## Reading the results

- Treat 100 Qualified Adult Visits on one channel as a learning checkpoint, not
  as statistical proof.
- At zero purchases, inspect payment failures and audience fit before you make
  another batch.
- Scale a channel only after positive Contribution persists across two batches.
- Record the uncertainty of a small sample in the log notes.
- Paid ads, sponsorships and commissions wait for an owner spend cap and a
  measured allowable acquisition cost.

The admin funnel export (`GET /api/admin/funnel`) gives visits per Campaign Code
and total purchases. It does not link a purchase to a code. Compare campaign
visits with total purchases in the same window.
