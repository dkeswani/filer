# Filer Bundled Templates

This directory contains the curated starter template library that ships with `@filer/cli`.

## Structure

```
templates/
├── security/         — Secrets, injection, PII, authorization
├── migrations/       — Destructive migrations, idempotency, rate limits
├── error-handling/   — Swallowed errors, typed error classes
├── data-access/      — N+1 queries, repository pattern, sync I/O
├── api/              — Controller hygiene, secrets, ID stability
├── meta/             — Self-describing template about this pack
└── manifest.json     — Category index
```

## Format

Every template is a single JSON file containing one valid `AnyNode` that passes `AnyNodeSchema.parse()`. All templates ship with `verified: false` and a generic `scope` — adapt them to your codebase, then run `filer verify <id>`.

## Contributing a new template

1. Choose the appropriate category folder (or create a new one).
2. Name the file using kebab-case matching the node `id` slug.
3. Write a JSON file following the conventions in `HANDOFF-templates.md` (section 5).
4. Add the entry to `manifest.json` under the correct category.
5. Run `npm test` — every template must pass `AnyNodeSchema.parse()` without modification.
6. Open a PR. The test suite validates your template automatically.

## Conventions

| Field | Value |
|---|---|
| `verified` | Always `false` — user marks verified after adapting |
| `stale_risk` | `0` |
| `indexed_by` | `"@filer/templates@1.0.0"` |
| `confidence` | `0.85` non-security, `0.92` security |
| `created_at` / `updated_at` | `"2026-04-25T00:00:00.000Z"` (clean diffs) |
