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
