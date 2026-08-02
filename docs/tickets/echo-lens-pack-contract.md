# Ticket: publish revision-bound Echo Lens explanation pack

Parent spec: [#170](https://github.com/tomnguyen103/Maze-v2/issues/170)  
Ticket issue: [#171](https://github.com/tomnguyen103/Maze-v2/issues/171)  
PR batch: F  
Blocked by: none

## Slice

Expand the reviewed Lens catalog from its current single entry to an explicit
pack covering all six supported visual primitive kinds. Add a coverage and
publish verifier that proves exact Reviewed Question Revision binding and
truthfully leaves unsupported revisions without a Lens.

## Acceptance

- The launched pack contains at least one reviewed entry for each supported
  primitive kind.
- Every entry is bound to the exact reviewed revision it explains.
- Editing any Question content invalidates the old pairing rather than silently
  reusing the Lens.
- Unknown fields, unsafe text, out-of-range geometry, duplicate nodes, and
  malformed primitive models are rejected.
- No generated or generic explanation is created for unsupported revisions.

## Verification receipt

Before implementation, record the observed failing content-coverage test and
failure line in the commit body or ticket closing comment. The first green
receipt must include the exact pack count and primitive-kind coverage.
