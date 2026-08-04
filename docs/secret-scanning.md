# Secret scanning

`gitleaks` scans the full commit history, across every ref, for committed
credentials. The A+ audit (run 1) graded Security **B\*** — with a mandatory
asterisk — solely because gitleaks had never executed against this repository.
Nothing else was outstanding on that axis except one confirmed High.

## Running it

```bash
npm run security:secrets
```

gitleaks is local tooling, not a dependency. It is deliberately absent from
`package.json`'s dependency lists — installing it is an operator step:

```powershell
winget install --id gitleaks.gitleaks
```

The `winget` shim lands in `%LOCALAPPDATA%\Microsoft\WinGet\Links`, which is on
`PATH` for new shells. On macOS or Linux, `brew install gitleaks` or the
release binary works the same way.

## Result of record

| | |
|---|---|
| Version | gitleaks 8.30.1 |
| Date | 2026-08-04 |
| Scope | `gitleaks git` — full history, every ref |
| Scanned | 244 commits, 9.03 MB |
| Result | **no leaks found** |

Re-run it before any release and after any history rewrite. The number that
matters is the commit count: a scan of the working tree only (`gitleaks dir`)
proves nothing about what is already in history, and history is what a fork or
a clone carries.

## The two findings that were not secrets

The first run reported two `generic-api-key` hits, both in
`db/migrations/0017_verified_classroom_domains.sql`, both false.

That migration carries the public email-provider denylist — roughly 3,000
single-quoted domain names, twelve to a line — which exists so that a free
mailbox cannot claim a Verified Classroom Domain. The rule treats a domain
containing `api` as a keyword and reads the *next* domain on the line as that
key's value:

```
'aphlog.com', 'api-v1.cc.cd', 'api.qwen3-30b-a3b.xyz', 'api89891.eu.cc',
               ^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^
               "keyword"      read as the secret
```

`.gitleaks.toml` allowlists this, scoped three ways: to that one rule, to
named files, and to values shaped like a domain name. An actual key committed
to either file would still be reported. The allowlist is a statement about
those strings, not a way to make the scan quiet.

This document is the second named file, for the same reason and no other: the
block above quotes the migration line verbatim, so the scan reports on its own
explanation.

## What a real finding means

Stop. A secret in history is not fixed by deleting the line in a new commit —
the old commit still carries it, and so does every clone. Rotate the
credential first, then decide whether history needs rewriting. Rotation is the
part that actually protects anything.
