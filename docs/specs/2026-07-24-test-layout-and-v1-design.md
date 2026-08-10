# Frontend Test Layout and v1.0.0 Design

## Scope

This change only reorganizes existing frontend tests and synchronizes the App
version. It does not alter product behavior, add release automation, or change
the database schema.

## Frontend test layout

Move the three existing frontend test files into one flat directory:

```text
src/test/
├── BookmarkView.test.tsx
├── ResultList.test.tsx
└── bookmarks.api.test.ts
```

Tests import production modules through the existing `@/` alias. No production
module moves, compatibility wrappers, or additional test directory hierarchy
are introduced. Vitest continues to discover files by the existing
`*.test.ts(x)` convention.

## Version synchronization

Set the product version to `1.0.0` in:

- `package.json`;
- the root importer metadata in `pnpm-lock.yaml`, if represented there;
- `src-tauri/Cargo.toml`;
- the `bkmrx` package entry in `src-tauri/Cargo.lock`;
- `src-tauri/tauri.conf.json`.

Dependency versions are not changed.

## Verification

The change is complete when:

1. no frontend test remains outside `src/test/`;
2. all three moved test files run successfully;
3. frontend TypeScript and production builds pass;
4. Rust tests and strict Clippy pass;
5. every product-version source reports `1.0.0`;
6. Git diff contains no unrelated changes.
