# Use UUID v7 as the sole domain entity identity

Bookmark, Bookmark Tag, Todo, Todo Tag, RSS Feed, RSS Entry, Navigation Category, and Navigation Placement use strongly typed UUID v7 Entity IDs across SQLite, Rust, JSON, TypeScript, Tauri commands, HTTP routes, and browser-extension integration. Domain tables store canonical UUID strings as their primary keys and relationships reference those UUIDs; natural keys remain uniqueness constraints, while SQLite and FTS row numbers are private implementation details, because exposing database-local integers prevents identities and relationships from surviving export, initialization, and future data movement.

## Consequences

- The current local database is converted once after a SQLite-consistent backup, using temporary mappings to rebuild relationships and the bookmark FTS index.
- After the cutover, the repository keeps only the new UUID baseline; it retains no runtime migration from the integer schema, dual ID contract, or permanent legacy-ID mapping.
- A database that did not pass through the one-time cutover is rejected by the new application rather than upgraded implicitly.
- New Entity IDs are generated only by the Rust domain layer; Bookmark Initialization is the exception that validates and preserves exported UUIDs.
