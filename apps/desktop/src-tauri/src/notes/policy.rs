use std::path::Path;

use super::{WorkspaceFileCapabilities, WorkspaceFileKind, WorkspaceFilePrimaryInteraction};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkspaceFilePolicy {
    kind: WorkspaceFileKind,
    capabilities: WorkspaceFileCapabilities,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceFileOperation {
    Edit,
    View,
    SystemOpen,
    Rename,
    Delete,
}

impl WorkspaceFilePolicy {
    pub fn for_path(path: &Path) -> Self {
        match path.extension().and_then(|extension| extension.to_str()) {
            Some(extension)
                if extension.eq_ignore_ascii_case("md")
                    || extension.eq_ignore_ascii_case("markdown") =>
            {
                Self {
                    kind: WorkspaceFileKind::Markdown,
                    capabilities: WorkspaceFileCapabilities {
                        primary_interaction: WorkspaceFilePrimaryInteraction::Edit,
                        can_rename: true,
                        can_delete: true,
                        can_open_with_system: false,
                    },
                }
            }
            Some(extension)
                if extension.eq_ignore_ascii_case("html")
                    || extension.eq_ignore_ascii_case("htm") =>
            {
                Self {
                    kind: WorkspaceFileKind::Html,
                    capabilities: WorkspaceFileCapabilities {
                        primary_interaction: WorkspaceFilePrimaryInteraction::View,
                        can_rename: true,
                        can_delete: true,
                        can_open_with_system: true,
                    },
                }
            }
            _ if is_blocked_launcher(path) => Self {
                kind: WorkspaceFileKind::External,
                capabilities: WorkspaceFileCapabilities {
                    primary_interaction: WorkspaceFilePrimaryInteraction::Unavailable,
                    can_rename: false,
                    can_delete: false,
                    can_open_with_system: false,
                },
            },
            _ => Self {
                kind: WorkspaceFileKind::External,
                capabilities: WorkspaceFileCapabilities {
                    primary_interaction: WorkspaceFilePrimaryInteraction::SystemOpen,
                    can_rename: false,
                    can_delete: false,
                    can_open_with_system: true,
                },
            },
        }
    }

    pub fn allows(self, operation: WorkspaceFileOperation) -> bool {
        match operation {
            WorkspaceFileOperation::Edit => {
                self.capabilities.primary_interaction == WorkspaceFilePrimaryInteraction::Edit
            }
            WorkspaceFileOperation::View => {
                self.capabilities.primary_interaction == WorkspaceFilePrimaryInteraction::View
            }
            WorkspaceFileOperation::SystemOpen => self.capabilities.can_open_with_system,
            WorkspaceFileOperation::Rename => self.capabilities.can_rename,
            WorkspaceFileOperation::Delete => self.capabilities.can_delete,
        }
    }

    pub fn kind(self) -> WorkspaceFileKind {
        self.kind
    }

    pub fn capabilities(self) -> WorkspaceFileCapabilities {
        self.capabilities
    }
}

fn is_blocked_launcher(path: &Path) -> bool {
    const BLOCKED_EXTENSIONS: [&str; 8] =
        ["app", "command", "exe", "com", "bat", "cmd", "msi", "ps1"];
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            BLOCKED_EXTENSIONS
                .iter()
                .any(|blocked| extension.eq_ignore_ascii_case(blocked))
        })
}
