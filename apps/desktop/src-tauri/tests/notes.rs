use std::sync::Arc;

use bkmrx_lib::{
    notes::NotesWorkspace,
    providers::ProviderContext,
    settings::SettingsStore,
    translation::{TranslationProviderManager, TranslationRegistry, TranslationRuntime},
};
use tempfile::TempDir;

fn workspace(root: &TempDir) -> NotesWorkspace {
    let providers = Arc::new(TranslationProviderManager::new(
        TranslationRegistry::default(),
        Arc::new(TranslationRuntime::default()),
        ProviderContext::new(reqwest::Client::new()),
    ));
    let settings_file = root.path().join("settings.json");
    let store = Arc::new(SettingsStore::open(settings_file, providers).store);
    let mut settings = store.snapshot().settings;
    settings.common.paths.notes_dir = Some(root.path().to_string_lossy().into_owned());
    store.replace(1, settings).unwrap();
    NotesWorkspace::new(store, Arc::new(|_| {}))
}

#[test]
fn workspace_round_trips_relative_note_identities() {
    let root = TempDir::new().unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    let created = workspace.create(revision, "", "one").unwrap();
    assert_eq!(created, "one.md");

    workspace.write(revision, &created, "# changed\n").unwrap();
    assert_eq!(workspace.read(revision, &created).unwrap(), "# changed\n");
    let renamed = workspace.rename(revision, &created, "two.md").unwrap();
    assert_eq!(renamed, "two.md");
    workspace.delete(revision, &renamed).unwrap();
    assert!(!root.path().join("two.md").exists());
}

#[test]
fn list_returns_nested_markdown_in_title_order() {
    let root = TempDir::new().unwrap();
    std::fs::create_dir(root.path().join("nested")).unwrap();
    std::fs::write(root.path().join("b.md"), "# b\n").unwrap();
    std::fs::write(root.path().join("nested/a.md"), "# a\n").unwrap();
    std::fs::write(root.path().join("ignored.txt"), "ignored").unwrap();

    let listing = workspace(&root).list().unwrap();
    assert_eq!(
        listing
            .notes
            .iter()
            .map(|note| note.title.as_str())
            .collect::<Vec<_>>(),
        vec!["a", "b"]
    );
}

#[test]
fn operations_reject_absolute_and_parent_paths() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("inside.md"), "inside").unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;

    for path in ["../outside.md", "/tmp/outside.md"] {
        assert_eq!(
            workspace.read(revision, path).unwrap_err().code(),
            "note_path_outside_root"
        );
    }
}

#[test]
fn stale_workspace_revision_is_rejected() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("note.md"), "note").unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;

    assert_eq!(
        workspace.read(revision - 1, "note.md").unwrap_err().code(),
        "notes_workspace_changed"
    );
}

#[test]
fn workspace_deletes_nested_folder_but_not_root() {
    let root = TempDir::new().unwrap();
    std::fs::create_dir(root.path().join("nested")).unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    workspace.delete_folder(revision, "nested").unwrap();
    assert!(!root.path().join("nested").exists());
    assert_eq!(
        workspace.delete_folder(revision, "").unwrap_err().code(),
        "note_path_outside_root"
    );
}

#[test]
fn create_and_rename_reject_path_components() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("note.md"), "note").unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    for name in ["../outside", "nested/note", r"nested\note", ".", ".."] {
        assert_eq!(
            workspace.create(revision, "", name).unwrap_err().code(),
            "invalid_note_name"
        );
    }
    assert_eq!(
        workspace
            .rename(revision, "note.md", "../outside")
            .unwrap_err()
            .code(),
        "invalid_note_name"
    );
}

#[test]
fn rename_does_not_replace_existing_note() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("source.md"), "source").unwrap();
    std::fs::write(root.path().join("target.md"), "target").unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    assert_eq!(
        workspace
            .rename(revision, "source.md", "target.md")
            .unwrap_err()
            .code(),
        "note_io_error"
    );
}
