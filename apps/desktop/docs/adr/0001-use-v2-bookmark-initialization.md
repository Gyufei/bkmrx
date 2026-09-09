# Use V2 bookmark initialization instead of import merging

The desktop application treats bookmark transfer as a portable Bookmark Dataset containing Bookmarks, Tags, Bookmark–Tag Relations, Navigation Categories, and Navigation Placements, while excluding todos, RSS data, notes, and Application Settings. Every entity and relationship in the dataset is expressed using its Entity ID, initialization preserves those UUIDs exactly, and URL is not used as a relationship reference. The only supported format is V2, and it may initialize the bookmark domain only when both Bookmarks and Navigation Categories are empty; V1 compatibility and URL-based merge behaviour are deliberately removed because import is reserved for first-time local initialization, and retaining unused compatibility paths would create ongoing complexity without serving a current workflow.

## Consequences

- V1 files are rejected rather than migrated or merged.
- Invalid, duplicate, or dangling UUID references reject the complete dataset.
- Initialization writes the complete Bookmark Dataset atomically and is unavailable for a non-empty bookmark domain.
- Todo and RSS data share the SQLite database but remain untouched by bookmark initialization.
