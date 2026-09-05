# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root: it points to the `CONTEXT.md` for each relevant application context.
- **`docs/adr/`**: system-wide architectural decisions.
- **`apps/desktop/docs/adr/`**: desktop-specific decisions.
- **`apps/chrome-extension/docs/adr/`**: browser-extension-specific decisions.

If any of these files don't exist, proceed silently. The `/domain-modeling` skill creates them lazily when terminology or decisions are resolved.

## File structure

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                              ← system-wide decisions
└── apps/
    ├── desktop/
    │   ├── CONTEXT.md
    │   └── docs/adr/                      ← desktop-specific decisions
    └── chrome-extension/
        ├── CONTEXT.md
        └── docs/adr/                      ← extension-specific decisions
```

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined in the relevant `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If the required concept is absent, reconsider whether the term belongs to the project or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface the conflict explicitly rather than silently overriding it.
