# Launch runbook

This runbook lists plan Phase 4 (`docs/plans/profitability-upgrade-plan.md`) as
twelve owner steps. Run the steps in order. Each step has an evidence slot. A
step is complete only when its slot holds the evidence.

No agent runs a step. An agent prepares the code, the checks and this document.
The owner makes every account, policy, payment and production change.

Record no secret value here. Name the variable, never the value. Record a key,
a webhook secret, a card number or a user's email in no slot.

The detailed Stripe and migration commands are in the Live cutover section of
`docs/lifetime-membership-operations.md`. That section and this runbook use the
same variables.

## Steps

### Step 1: Record provider plans and costs

**Owner:** owner.

**Action:** Fill in the cost sheet below from the current account pages. Record
the plan name, the monthly price and the support contact for each provider.
Confirm that the host plan permits commercial use. Vercel Hobby does not.

**Evidence:** _empty_

### Step 2: Review children's privacy

**Owner:** owner.

**Action:** Complete the children's privacy review below against the actual
data flow. An adult-owned account does not by itself establish compliance.

**Evidence:** _empty_

### Step 3: Publish the terms

**Owner:** owner.

**Action:** Publish the privacy, purchase, refund, support and service-lifetime
terms before the live offer. The terms state one price, `$5.99 USD`, once.

**Evidence:** _empty_

### Step 4: Inspect the migration ledger

**Owner:** owner.

**Action:** Take a recoverable database snapshot. Run
`db/inspect/migration-ledger.sql`. It reads the catalog only and writes nothing.
Apply only the migrations that report `present` false, in file order, after a
review of their dependencies. `docs/migration-safety.md` gives the apply command.

**Evidence:** _empty_

### Step 5: Complete Stripe test-mode acceptance

**Owner:** owner.

**Action:** With `ECHO_MAZE_BILLING_MODE=test`, complete one test purchase and
one test refund. Confirm the one-time `$5.99 USD` Price and the signed webhook
destination. The Stripe test setup section of
`docs/lifetime-membership-operations.md` lists the events.

**Evidence:** _empty_

### Step 6: Configure the commercial host

**Owner:** owner.

**Action:** Select the approved commercial host plan. Set the reviewed live
values in the production environment only. Keep each secret out of the
repository, the pull requests and this runbook.

**Evidence:** _empty_

### Step 7: Reconcile payment provenance

**Owner:** owner.

**Action:** Run Live cutover steps 2 to 5 to classify each stored purchase.
Confirm that a test purchase grants no live access and enters no live Funnel
Count.

**Evidence:** _empty_

### Step 8: Restrict live checkout to the owner pilot

**Owner:** owner.

**Action:** Set `ECHO_MAZE_BILLING_MODE=live`. Set `LIFETIME_PILOT_ACCOUNT_IDS`
to the Clerk user id of each Pilot Account, separated by commas. Keep
`LIFETIME_PUBLIC_CHECKOUT_ENABLED=false` and
`RUN_ACCESS_ENFORCEMENT_ENABLED=false`. Redeploy. Any other Explorer gets the
answer "Lifetime Membership is not on sale yet."

**Evidence:** _empty_

### Step 9: Make the pilot purchase and refund

**Owner:** owner.

**Action:** Sign in with a Pilot Account and open `/play?membership=open`. Buy
with a card you own. This charges real money. Confirm that Lifetime access
activates. Refund the purchase in Stripe. Confirm that the refund blocks the
next new Run. Replay the webhook event and confirm that nothing changes twice.

**Evidence:** _empty_

### Step 10: Complete production acceptance

**Owner:** owner.

**Action:** On the production path, check desktop, mobile, keyboard and screen
reader play. Check a rollback with `RUN_ACCESS_ENFORCEMENT_ENABLED=false`.
Confirm that an existing Lifetime Member keeps access.

**Evidence:** _empty_

### Step 11: Open Public Checkout and enforcement

**Owner:** owner.

**Action:** Start this step only when the steps 9 and 10 receipts pass. Set
`LIFETIME_PUBLIC_CHECKOUT_ENABLED=true` and
`RUN_ACCESS_ENFORCEMENT_ENABLED=true` together in one deploy. The server
refuses live enforcement while Public Checkout is closed, so the order cannot
lock Explorers out.

**Evidence:** _empty_

### Step 12: Confirm readiness after activation

**Owner:** owner.

**Action:** Request `/api/ready` and expect 200. Sign in as an Explorer who is
not a Pilot Account and press Unlock. Confirm that Stripe Checkout opens, then
leave it without a payment. Confirm that the admin funnel export shows the
step 9 purchase and refund.

**Evidence:** _empty_

## Gate removal

The pilot checkout gate is temporary (ADR 0050). After step 12 passes, open a
change that removes `resolveCheckoutGate`, the `checkout_closed` answer and the
two variables `LIFETIME_PILOT_ACCOUNT_IDS` and
`LIFETIME_PUBLIC_CHECKOUT_ENABLED`. Remove both variables from the production
environment after that change deploys.

## Cost sheet

The plan figures in section 7 are illustrations, not invoices. Record each
actual cost from the provider account. Leave a cell empty until an invoice or
an account page shows the figure.

| Provider | Service | Plan | Actual monthly cost | Recurring charge | Support contact |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Stripe | Payments |  |  |  |  |
| Vercel | Host |  |  |  |  |
| Clerk | Sign-in |  |  |  |  |
| Neon | Database |  |  |  |  |
| Google | Gemini API |  |  |  |  |

Record one row for each other service that charges money. A new recurring
charge needs owner approval before it starts.

## Children's privacy review

Use the actual data flow and the
[FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
Answer each question with the evidence that supports the answer.

| Area | Question | Answer and evidence |
| :-- | :-- | :-- |
| Child accounts | Can a child under 13 create an account, and what does the sign-up ask? |  |
| Consent | Who gives consent before a child's data is stored? |  |
| Public profile | What does a scoreboard or profile show to other people? |  |
| Scoreboard | Can a child's name or chosen handle appear in public? |  |
| Telemetry | Which events leave the browser, and what does each one hold? |  |
| Deletion | How does a parent delete a child's account and data? |  |

Record the outcome in the step 2 evidence slot.
