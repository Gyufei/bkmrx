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
The directory selected by Application Settings whose folders and regular files are exposed through relative Workspace Entry identities at a specific Settings Revision.
_Avoid_: scanned directory, notes root

**Workspace Entry**:
A folder or regular file contained by the Notes Workspace and identified by its path relative to that workspace.
_Avoid_: note identity, scanned item

**Markdown Document**:
A Markdown Workspace Entry that the desktop application opens and edits through a Document Session.
_Avoid_: text file, external file

**External File**:
A non-Markdown Workspace Entry that the desktop application lists but delegates to the operating system for opening.
_Avoid_: attachment, note

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

**Calendar Day**:
The aggregate of all calendar information attached to one local civil date, including Holiday Annotations, Calendar Events, and Calendar Todos.
_Avoid_: date cell, day item

**Holiday Annotation**:
A normalized holiday or adjusted-workday fact shown on a Calendar Day, retaining its source and semantic day type.
_Avoid_: holiday event, holiday label

**Calendar Event**:
A user-facing occurrence categorized by its meaning, such as work, personal life, or an anniversary. Recurrence is a separate future concern.
_Avoid_: holiday, repeated event

**Calendar Todo**:
A Todo projected onto a Calendar Day through a specific date role, such as its start date or due date.
_Avoid_: calendar event, dated event

**Calendar Source**:
A stable string-identified origin that contributes normalized calendar information without exposing its provider-specific retrieval rules to callers.
_Avoid_: calendar type, holiday provider enum
