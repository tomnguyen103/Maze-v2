# Issue tracker: GitHub

Issues and specs for this repository live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- Create: `gh issue create --title "..." --body-file <path>`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."`
- Close: `gh issue close <number> --comment "..."`

Infer the repository from the `origin` remote.

## Pull requests as a triage surface

PRs as a request surface: no.

## Publishing

When a skill says to publish a spec or ticket, create a GitHub issue and apply the `ready-for-agent` label.

Use GitHub issue dependencies when available. Otherwise include a `Blocked by` section with issue references.
