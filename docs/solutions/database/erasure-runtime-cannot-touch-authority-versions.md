---
title: Account erasure failed because the runtime cannot touch the authority versions
category: database
trigger: Account deletion fails with "permission denied for table classroom_authority_versions", or the user-deletion database lane test fails.
---

# Account erasure failed because the runtime cannot touch the authority versions

## Problem

Every account deletion rolled back with "permission denied". No account could
be erased, so a Clerk `user.deleted` event and the admin erasure both failed.

## Root cause

The deletion store ran `DELETE FROM classroom_authority_versions` as the
runtime role. Migration 0015 revokes every runtime privilege on that table.
The unit tests use a fake client, so only the database lane can show the
failure, and the lane runs only on request.

The verification of that delete was also empty. It ran after the Memberships
were deleted, so its join back to the Explorer matched no row and always
reported success.

## Fix

- Migration 0036 adds `erase_membership_authority_versions(text)`, a
  `SECURITY DEFINER` function that the tenant owner owns. It deletes the
  Membership versions of one Explorer and returns `TRUE` when none remain.
- The function raises an exception for an Explorer other than the tenant
  context Explorer, so the runtime cannot erase the versions of another
  Explorer.
- The store calls the function before the Memberships are deleted, and the
  verification query asserts the function result.
- A runtime grant on the table is rejected, because it lets the runtime
  delete the versions of any Explorer.

## How to recognise it again

A store that writes a table under a revoked runtime grant passes every unit
test. Run `npm run test:db` on a scratch cluster after a change to a store
that touches a table which a migration revokes from the runtime. Apply
migration 0036 before the release that calls the function.