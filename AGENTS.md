# Repository guidance

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical Matt Pocock triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. Read `CONTEXT.md` and relevant ADRs under `docs/adr/` before changing game rules.

## Local validation

GitHub Actions are disabled. Before every push, run:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

Browser-facing changes also require desktop and mobile gameplay checks.
