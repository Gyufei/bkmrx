# Desktop Application

The desktop application owns the user's local data and the configuration that controls its runtime behaviour.

## Language

**Application Settings**:
The complete, versioned configuration that the user expects the desktop application to persist.
_Avoid_: config, preferences

**Settings Snapshot**:
An immutable view of Application Settings and derived provider statuses at one Settings Revision.
_Avoid_: current config, provider state

**Settings Revision**:
A monotonically increasing process-local version identifying a Settings Snapshot and preventing stale replacements.
_Avoid_: version, schema version

**Provider Configuration**:
The values and credentials required to construct a provider; being configured does not mean the provider is active.
_Avoid_: provider settings, provider state

**Provider Route**:
The ordered selection of a primary provider and fallback providers for a capability.
_Avoid_: active provider, provider list

**RSSHub Configuration**:
The validated RSSHub origin and optional access key used for RSS requests.
_Avoid_: RSSHub settings, RSS service config

**Notes Workspace**:
The notes directory selected by Application Settings, addressed through relative note identities at a specific Settings Revision.
_Avoid_: scanned directory, notes root

**Document Session**:
The active note draft together with its load, autosave, retry, and transition coordination state.
_Avoid_: editor state, note hook

**Bookmark**:
The single source of truth for a saved website, whether it is found through search or presented in Navigation.
_Avoid_: navigation item, shortcut link

**Navigation Category**:
A user-managed, ordered, single-level group that presents Bookmarks for frequent access. A Bookmark may belong to multiple Navigation Categories.
_Avoid_: folder, tag

**Navigation Placement**:
The membership of a Bookmark in a Navigation Category, ordered by when that membership was established. Removing a Navigation Placement does not itself remove the Bookmark.
_Avoid_: navigation bookmark, category bookmark

**Bookmark Dataset**:
The portable snapshot of Bookmarks, Tags, Navigation Categories, and Navigation Placements. It excludes todos, RSS data, notes, and Application Settings.
_Avoid_: database backup, application backup

**Bookmark Initialization**:
Populating an empty bookmark domain from a Bookmark Dataset. It is not a merge and is unavailable when Bookmarks or Navigation Categories already exist.
_Avoid_: bookmark import, restore merge

**Entity ID**:
The stable UUID v7 identity used by desktop domain entities and every relationship between them. Database row numbers are internal implementation details and never identify domain entities.
_Avoid_: database ID, numeric ID, row ID
