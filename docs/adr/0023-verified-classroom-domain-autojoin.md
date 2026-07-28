# 0023: Auto-join verified school domains through Clerk Membership authority

Date: 2026-07-28

## Status

Accepted

## Context

Classrooms exist as Clerk Organizations and PostgreSQL Classroom Memberships,
but Teachers must invite every Student. Phase 9 calls for school-friendly Google
sign-in and zero-click domain auto-join without weakening the forced-RLS
authority boundary from ADR 0022.

An email-domain match alone is not authority. Public mailbox domains are shared
by unrelated people, unverified email addresses can be attacker-controlled, and
writing a PostgreSQL Membership directly would bypass Clerk's revocation and
webhook history.

## Decision

A Teacher may register one lower-case domain for a Classroom only when the
Teacher's verified primary Clerk email uses that exact domain. Public mailbox
domains are rejected through one tracked provider snapshot enforced in both
JavaScript and PostgreSQL. The snapshot vendors a fixed upstream tarball list
plus reviewed supplements; dependency installation never fetches authorization
data. A database uniqueness constraint permits one Classroom to own a domain at
a time, and auto-join must be explicitly enabled.

Verified `user.created` and `user.updated` Clerk deliveries enter the existing
durable webhook inbox with only the user id, primary verified email domain, and
event timestamp retained. The full email address is discarded before durable
storage. Processing finds an enabled Verified Classroom Domain and asks Clerk
to create an `org:member` Membership. It never writes a Classroom Membership
directly.

Clerk's later `organizationMembership.created` delivery remains the only path
that grants authoritative Student Membership in PostgreSQL. Until that delivery
is processed, Classroom reads and writes fail closed. Repeated user deliveries
are idempotent: an existing Clerk Membership is a successful no-op.

Google OAuth remains Clerk configuration, not custom application OAuth code.
Production setup uses Clerk and Google dashboard credentials. SAML or OIDC
enterprise connections are documented as a later paid-tier option rather than
reimplemented here.

## Consequences

- A matching verified school email can join one Classroom with zero invitation
  clicks, subject to Clerk webhook delivery.
- Personal Play and unmatched sign-ins remain unchanged.
- Public domains cannot claim a Classroom.
- Revocation stays authoritative because Clerk emits the existing Membership
  deletion event.
- Webhook delay may briefly leave a newly signed-in Student outside the
  Classroom, but can never grant broader access.
- Production Google OAuth enablement and credentials remain an external
  deployment step.
