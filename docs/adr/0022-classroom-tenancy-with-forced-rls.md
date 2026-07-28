# 0022: Model Classrooms with Clerk Organizations and forced PostgreSQL RLS

Date: 2026-07-28

## Status

Accepted

## Context

Echo Maze needs teacher-created Classrooms without turning global Admin and
Moderator roles into classroom authority. Application-only filters are not a
sufficient cross-Classroom isolation boundary because one missed predicate
would expose learning data.

## Decision

One Classroom maps to one Clerk Organization. Clerk's `org:admin` role maps to
Teacher and `org:member` maps to Student. The mapping is synchronized through
the durable Clerk webhook inbox, while PostgreSQL `org_memberships` remains the
authoritative permission record used by application reads and writes. A missing
or delayed membership fails closed.

Class Play records carry a nullable Classroom id; `NULL` means Personal Play and
preserves existing behavior. An Explorer may have Personal Play and independent
Class Play in more than one Classroom.

Tenant-scoped tables enable and force row-level security. Every unit of database
work runs in a transaction that sets transaction-local Explorer and Classroom
identifiers. The runtime role cannot own tenant tables or hold `BYPASSRLS`.
Policies admit Personal Play according to the existing account boundary and
Class Play only for the selected Classroom. Teacher aggregates contain counts,
never per-Question timestamps or answer content.

Delivery follows expand-contract in three independently green pull requests:

1. additive organization schema, nullable Classroom columns, transaction
   context, and policies that preserve current Personal Play;
2. Clerk organization synchronization plus Classroom-scoped write paths; and
3. Teacher reads, invitations, and the `/class` experience.

## Consequences

- Global roles remain separate from Classroom Memberships.
- Removing a Classroom Membership cascades that Explorer's Class Play records;
  Personal Play is unaffected.
- Clerk webhooks are eventually consistent, so newly changed membership may
  temporarily deny access but can never grant broader database access.
- Consumer gameplay and Lifetime Membership remain account-scoped and unchanged.
- Direct PostgreSQL isolation tests are part of the feature contract; route-only
  tests cannot prove the RLS claim.
