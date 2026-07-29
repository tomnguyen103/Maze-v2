# 0030: Sponsor assigned Class Play through Classroom Run Grants

- Status: Accepted
- Date: 2026-07-29

Students are not required to purchase individual Lifetime Membership to
complete assigned Class Play. Each distinct assigned Run instead receives one
idempotent Classroom Run Grant scoped to the Student, authoritative Classroom
Membership, Class Expedition, and stable Run identifier. The Grant authorizes
assigned Class Play only; it never changes Personal Play allowance, Lifetime
Membership, Question rules, Warden behavior, score, or any other gameplay
power. The access, funding shape, capacity, revocation, refund, closure, and
offline boundaries are resolved below. Production activation still requires a
documented cost model, complete Stripe test-mode proof, migration and abuse
controls, support operations, and separate authorization for live billing.

One Class Expedition assigns one four-Labyrinth Atlas Region and therefore
requires four idempotent Classroom Run Grants per participating Student. It
ends at that Region's Gate Warden; continuing to another Region requires
another Class Expedition rather than silently expanding the original Grant
scope.

Authoritative Classroom Membership is stronger than an issued Classroom Run
Grant. Once Membership removal is recorded, further Class Play reads and writes
fail closed, the client stops the assigned Run when it learns of removal, and
its local Active Run Recovery is deleted. Personal Play remains unaffected.
This ADR supersedes ADR 0007's “an already authorized Run may finish” rule only
for Classroom-scoped Runs whose Membership authority has been revoked.

Funding uses one non-recurring Class Expedition License purchased by a Teacher
or school sponsor for one Classroom, one assigned Atlas Region, and 30 assigned
Students. It funds four assignment-scoped Run Grants per eligible Student.
One-time capacity extensions add 5 seats each, and multiple extensions may
apply to the same Expedition. Students never see a paywall, and the model
introduces neither a subscription nor a reusable credit or energy balance.
Pricing requires a separate cost model, and live Stripe activation remains an
external authorization.

The dollar price is intentionally not guessed in this decision. Before it is
set, a cost model must measure payment fees, database and replay-verification
cost, support and refund burden, and school purchasing friction. The complete
purchase, extension, refund, and dispute flow must pass in Stripe test mode.
Changing the future list price never changes an already purchased Class
Expedition. Live billing still requires separate explicit authorization.

A Student consumes one declared-capacity seat when their first Classroom Run
Grant is issued for that Class Expedition. Students who join later may use
capacity that has never been assigned. Once assigned, a seat is not recycled
when that Student is removed or stops participating. If every declared seat is
assigned, the sponsor must purchase one or more 5-seat, one-time capacity
extensions scoped to the same Class Expedition before another Student can
begin; existing Students and their Grants remain unaffected.

A Class Expedition License is eligible for a full refund only before its first
Student receives a Classroom Run Grant. A capacity extension follows the same
rule and is refundable only before its first added seat is assigned. Once
Class Play has started, neither purchase receives an automatic or prorated
refund. Billing disputes are handled through sponsor support and never
automatically revoke Class Play, delete Student progress, or alter Personal
Play.

Explicit assignment closure is graceful and reversible. It stops new Classroom
Run Grants and new Labyrinth starts, but a Student may finish or recover a
Labyrinth that already started while the assignment was open; its result still
contributes to aggregate progress. Reopening restores access to remaining
assignment Grants without resetting progress, assigned capacity, or previously
issued Grants. Authoritative Classroom Membership removal remains the only
classroom action that force-stops an active Class Run.

Class Play uses the assigned Atlas Region's fixed Trail Twist from its first
Labyrinth under the same rules as Personal Play. A Teacher may select Quest
Level and a published Learning Deck revision but cannot disable, replace, or
randomize the Region's Twist. Verified Daily remains separate under Classic
Rules.

Classroom Run Grants never receive Offline Continuity Receipts. A disconnected
client cannot prove that authoritative Classroom Membership and assignment
status remain active, so network loss preserves the Class Run only as paused
local recovery. Class Play resumes after reconnecting and successfully
rechecking both authorities.
