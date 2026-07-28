# Google sign-in and Verified Classroom Domain auto-join

Echo Maze delegates Google OAuth and Organization Membership creation to Clerk.
PostgreSQL remains the Classroom authorization authority: a matching email
domain asks Clerk for a Membership, but access starts only after the signed
`organizationMembership.created` webhook is durably processed.

## Release order

1. Apply migrations 0014 through 0017 in order with `DATABASE_ADMIN_URL`.
2. Deploy the application with `CLERK_PUBLISHABLE_KEY`,
   `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and
   `CLERK_WEBHOOK_SIGNING_SECRET`.
3. In Clerk, enable Organizations and retain the default `org:admin` and
   `org:member` roles.
4. Subscribe `/api/clerk-webhook` to `user.created`, `user.updated`,
   `user.deleted`, all three Organization events, and all three Organization
   Membership events listed in `docs/classroom-operations.md`.
5. Add Google on Clerk's SSO connections page. Development instances may use
   Clerk's shared OAuth credentials. Production instances require custom Google
   OAuth credentials, the Clerk-provided redirect URI, and an appropriately
   published Google OAuth app.
6. Keep Google's email-subaddress blocking enabled unless a reviewed product
   decision explicitly accepts the account-alias risk.
7. Test Google sign-in, Classroom Domain registration, auto-join, and revocation
   in the target Clerk instance before presenting them as production-ready.

Official setup references:

- [Clerk: add Google as a social connection](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google)
- [Clerk: create an Organization Membership](https://clerk.com/docs/reference/backend/organization/create-organization-membership)
- [Clerk: webhook overview](https://clerk.com/docs/guides/development/webhooks/overview)

The repository does not mutate a live Clerk or Google dashboard. Those steps
remain explicit operator work for each environment.

## Teacher registration

1. Sign in with a verified primary school email.
2. Create or select the synchronized Classroom at `/class`.
3. Under **Verified school domain**, enter only the domain, such as
   `school.example`, not an email address.
4. Save. The server re-checks Teacher Membership and asks Clerk for the
   Teacher's primary verified email. The entered domain must match exactly.

Migration 0017 permits one enabled domain per Classroom and one Classroom per
domain. Public mailbox providers are blocklisted at both the application and
database boundary from the tracked `data/public-email-domains.json` snapshot.
It vendors the `free-email-domains` 1.9.77 tarball list plus reviewed
supplements, so installs do not fetch authorization data. After deliberately
updating that snapshot, run `npm run sync:public-domains` and commit both files;
contract tests require exact runtime/database parity. Server startup also
recomputes the source's canonical base-list SHA-256 (sorted, lower-case, unique
JSON without whitespace) and verifies every declared supplement is present.
Changing a Classroom's domain replaces its previous mapping; deleting the
Classroom or the registering Teacher Membership removes the mapping through
foreign-key authority.

## Student auto-join sequence

1. Clerk verifies Google sign-in and emits `user.created` or `user.updated`.
2. Echo Maze verifies the webhook signature, discards the full email address,
   and durably stores only the Clerk user id, verified primary email domain, and
   event timestamp.
3. The worker looks up an enabled Classroom Domain.
4. It checks existing Clerk Memberships, then idempotently creates an
   `org:member` Membership when needed.
5. Clerk emits `organizationMembership.created`.
6. Only that signed authority event creates the PostgreSQL Student Membership.

Repeated user events are safe no-ops when Membership already exists. Unmatched
domains and Personal Play are unchanged. A webhook delay may briefly leave a
new Student outside Class Play, but it cannot grant broader access.

## Failure and recovery

- **Domain form rejects the value:** use the exact domain from the Teacher's
  primary verified Clerk email. Public mailbox domains are intentionally
  blocked.
- **409 conflict:** another Classroom owns the domain. Confirm the intended
  owner before changing either Classroom; do not edit `org_domains` by hand.
- **Student does not auto-join:** confirm migration 0017, webhook subscriptions,
  webhook signature secret, verified primary email, and enabled domain mapping.
  Inspect the durable webhook inbox and dead-letter output, then retry the
  original delivery safely.
- **Clerk request failed:** leave the inbox event retryable. Never create a
  PostgreSQL Membership manually.
- **Membership exists in Clerk but Class Play denies access:** wait for or retry
  the signed Organization Membership event. The local database intentionally
  fails closed until it arrives.
- **Email domain changes:** `user.updated` evaluates the new verified primary
  domain and may join its mapped Classroom. It does not silently remove older
  Memberships; handle revocation in Clerk so the existing Membership deletion
  event remains authoritative.
- **Provider outage:** existing synchronized Class Play and Personal Play remain
  available. New auto-joins wait for retry.

## Verification

Run the local gate and focused contracts:

```powershell
npm run check
npx vitest run tests/classroom-domain.test.js tests/classroom-domain-store.test.js tests/classroom-provider.test.js tests/classroom-route.test.js tests/clerk-webhook-route.test.js tests/migration.test.js
```

Before production release, use test identities from a private school domain and
verify: Teacher registration, public-domain rejection, first sign-in auto-join,
idempotent repeat sign-in, Membership webhook synchronization, and Membership
revocation. Never use production Student data for deployment testing.
