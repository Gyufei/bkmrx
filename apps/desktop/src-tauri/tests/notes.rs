use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

#[cfg(unix)]
use std::os::unix::{fs::symlink, fs::PermissionsExt};
#[cfg(target_os = "linux")]
use std::{ffi::OsString, os::unix::ffi::OsStringExt};

use bkmrx_lib::{
    notes::{NotesWorkspace, WorkspaceFileKind},
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
    let settings_file = root.path().join(".test-settings.json");
    let store = Arc::new(SettingsStore::open(settings_file, providers).store);
    let mut settings = store.snapshot().settings;
    settings.common.paths.notes_dir = Some(root.path().to_string_lossy().into_owned());
    store.replace(1, settings).unwrap();
    NotesWorkspace::new(store, Arc::new(|_| {}))
}

fn workspace_with_recording_opener(
    root: &TempDir,
    opened: Arc<Mutex<Vec<PathBuf>>>,
) -> NotesWorkspace {
    workspace(root).with_external_file_opener(Arc::new(move |path| {
        opened.lock().unwrap().push(path.to_path_buf());
        Ok(())
    }))
}

#[test]
fn workspace_round_trips_relative_note_identities() {
    let root = TempDir::new().unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    let created = workspace.create(revision, "", "one").unwrap();
    assert_eq!(created, "one.md");

    let opened = workspace.open_document(revision, &created).unwrap();
    let saved = workspace
        .save_document(&opened.receipt, "# changed\n")
        .unwrap();
    let renamed = workspace
        .rename_document(&saved.receipt, "two.md", None)
        .unwrap();
    assert_eq!(renamed.relative_path, "two.md");
    workspace.delete_document(&renamed.receipt).unwrap();
    assert!(!root.path().join("two.md").exists());
}

#[test]
fn document_receipt_advances_after_a_successful_save() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("note.md"), "old").unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;

    let opened = workspace.open_document(revision, "note.md").unwrap();
    assert_eq!(opened.content, "old");
    let saved = workspace.save_document(&opened.receipt, "new").unwrap();

    assert_ne!(saved.receipt, opened.receipt);
    assert_eq!(
        std::fs::read_to_string(root.path().join("note.md")).unwrap(),
        "new"
    );
}

#[test]
fn stale_document_receipt_cannot_overwrite_external_changes() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("note.md"), "old").unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    let opened = workspace.open_document(revision, "note.md").unwrap();

    std::fs::write(root.path().join("note.md"), "external").unwrap();
    let error = workspace
        .save_document(&opened.receipt, "local")
        .unwrap_err();

    assert_eq!(error.code(), "note_document_conflict");
    assert_eq!(
        std::fs::read_to_string(root.path().join("note.md")).unwrap(),
        "external"
    );
}

#[test]
fn invalid_document_receipt_is_rejected_without_touching_files() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("note.md"), "old").unwrap();
    let workspace = workspace(&root);

    let error = workspace.save_document("not-a-receipt", "new").unwrap_err();

    assert_eq!(error.code(), "invalid_note_document_receipt");
    assert_eq!(
        std::fs::read_to_string(root.path().join("note.md")).unwrap(),
        "old"
    );
}

#[test]
fn rename_document_saves_pending_content_and_returns_a_new_identity() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("note.md"), "old").unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    let opened = workspace.open_document(revision, "note.md").unwrap();

    let renamed = workspace
        .rename_document(&opened.receipt, "renamed.md", Some("draft"))
        .unwrap();

    assert_eq!(renamed.relative_path, "renamed.md");
    assert_eq!(
        workspace
            .open_document(revision, "renamed.md")
            .unwrap()
            .content,
        "draft"
    );
    assert!(workspace.save_document(&renamed.receipt, "next").is_ok());
    assert!(!root.path().join("note.md").exists());
}

#[test]
fn rename_document_conflict_preserves_external_content_and_original_name() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("note.md"), "old").unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    let opened = workspace.open_document(revision, "note.md").unwrap();
    std::fs::write(root.path().join("note.md"), "external").unwrap();

    let error = workspace
        .rename_document(&opened.receipt, "renamed.md", Some("draft"))
        .unwrap_err();

    assert_eq!(error.code(), "note_document_conflict");
    assert_eq!(
        std::fs::read_to_string(root.path().join("note.md")).unwrap(),
        "external"
    );
    assert!(!root.path().join("renamed.md").exists());
}

#[test]
fn delete_document_rejects_a_stale_receipt() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("note.md"), "old").unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    let opened = workspace.open_document(revision, "note.md").unwrap();
    std::fs::write(root.path().join("note.md"), "external").unwrap();

    let error = workspace.delete_document(&opened.receipt).unwrap_err();

    assert_eq!(error.code(), "note_document_conflict");
    assert!(root.path().join("note.md").exists());
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
fn list_exposes_a_sorted_workspace_tree_alongside_legacy_notes() {
    let root = TempDir::new().unwrap();
    std::fs::create_dir(root.path().join("a-empty")).unwrap();
    std::fs::create_dir(root.path().join("alpha")).unwrap();
    std::fs::create_dir(root.path().join("Beta")).unwrap();
    std::fs::create_dir(root.path().join(".hidden")).unwrap();
    std::fs::write(root.path().join("Z.HTML"), "<p>external</p>").unwrap();
    std::fs::write(root.path().join("a.md"), "# markdown\n").unwrap();
    std::fs::write(root.path().join("draft.MARKDOWN"), "# draft\n").unwrap();
    std::fs::write(root.path().join("Beta/nested.JSON"), "{}").unwrap();
    std::fs::write(root.path().join(".secret.md"), "hidden").unwrap();
    std::fs::write(root.path().join(".hidden/note.md"), "hidden").unwrap();

    let listing = workspace(&root).list().unwrap();

    assert_eq!(listing.root.relative_path, "");
    assert_eq!(
        listing
            .root
            .directories
            .iter()
            .map(|directory| directory.name.as_str())
            .collect::<Vec<_>>(),
        vec!["a-empty", "alpha", "Beta"]
    );
    assert_eq!(
        listing
            .root
            .files
            .iter()
            .map(|file| (file.name.as_str(), &file.kind))
            .collect::<Vec<_>>(),
        vec![
            ("a.md", &WorkspaceFileKind::Markdown),
            ("draft.MARKDOWN", &WorkspaceFileKind::Markdown),
            ("Z.HTML", &WorkspaceFileKind::External),
        ]
    );
    assert!(listing.root.directories[0].directories.is_empty());
    assert!(listing.root.directories[0].files.is_empty());
    assert_eq!(listing.root.directories[2].files[0].name, "nested.JSON");
    assert_eq!(
        listing.root.directories[2].files[0].relative_path,
        "Beta/nested.JSON"
    );
    assert_eq!(
        listing
            .notes
            .iter()
            .map(|note| note.title.as_str())
            .collect::<Vec<_>>(),
        vec!["a", "draft"]
    );
}

#[cfg(unix)]
#[test]
fn list_excludes_symlinks_without_following_their_targets() {
    let root = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    std::fs::write(outside.path().join("outside.md"), "outside").unwrap();
    symlink(outside.path(), root.path().join("linked-directory")).unwrap();
    symlink(
        outside.path().join("outside.md"),
        root.path().join("linked-file.md"),
    )
    .unwrap();

    let listing = workspace(&root).list().unwrap();

    assert!(listing.root.directories.is_empty());
    assert!(listing.root.files.is_empty());
    assert!(listing.notes.is_empty());
}

#[cfg(target_os = "linux")]
#[test]
fn list_rejects_non_utf8_file_names() {
    let root = TempDir::new().unwrap();
    let invalid_name = OsString::from_vec(vec![b'n', b'o', b't', b'e', 0x80]);
    std::fs::write(root.path().join(invalid_name), "invalid name").unwrap();

    let error = workspace(&root).list().unwrap_err();

    assert_eq!(error.code(), "note_io_error");
    assert!(error.message.contains("不受支持的文件名"));
}

#[cfg(unix)]
#[test]
fn list_fails_when_a_directory_cannot_be_read() {
    let root = TempDir::new().unwrap();
    let blocked = root.path().join("blocked");
    std::fs::create_dir(&blocked).unwrap();
    std::fs::set_permissions(&blocked, std::fs::Permissions::from_mode(0o000)).unwrap();

    let result = workspace(&root).list();

    std::fs::set_permissions(&blocked, std::fs::Permissions::from_mode(0o700)).unwrap();
    let error = result.unwrap_err();
    assert_eq!(error.code(), "note_io_error");
    assert!(!error.message.contains(&root.path().to_string_lossy()[..]));
}

#[test]
fn open_external_file_authorizes_and_delegates_a_regular_file() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("page.HTML"), "<p>page</p>").unwrap();
    let opened = Arc::new(Mutex::new(Vec::new()));
    let workspace = workspace_with_recording_opener(&root, Arc::clone(&opened));
    let revision = workspace.list().unwrap().revision;

    workspace.open_external_file(revision, "page.HTML").unwrap();

    assert_eq!(
        opened.lock().unwrap().as_slice(),
        &[root.path().join("page.HTML").canonicalize().unwrap()]
    );
}

#[test]
fn open_external_file_rejects_markdown_directories_and_launchers() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("note.md"), "note").unwrap();
    std::fs::create_dir(root.path().join("folder")).unwrap();
    for extension in ["app", "CoMmAnD", "exe", "com", "bat", "cmd", "msi", "ps1"] {
        std::fs::write(root.path().join(format!("run.{extension}")), "launcher").unwrap();
    }
    let opened = Arc::new(Mutex::new(Vec::new()));
    let workspace = workspace_with_recording_opener(&root, Arc::clone(&opened));
    let revision = workspace.list().unwrap().revision;

    for path in [
        "note.md",
        "folder",
        "run.app",
        "run.CoMmAnD",
        "run.exe",
        "run.com",
        "run.bat",
        "run.cmd",
        "run.msi",
        "run.ps1",
    ] {
        assert_eq!(
            workspace
                .open_external_file(revision, path)
                .unwrap_err()
                .code(),
            "external_file_not_allowed"
        );
    }
    assert!(opened.lock().unwrap().is_empty());
}

#[test]
fn open_external_file_returns_a_sanitized_adapter_error() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("page.html"), "page").unwrap();
    let workspace = workspace(&root).with_external_file_opener(Arc::new(|_| {
        Err("failed to open /private/secret/page.html".into())
    }));
    let revision = workspace.list().unwrap().revision;

    let error = workspace
        .open_external_file(revision, "page.html")
        .unwrap_err();

    assert_eq!(error.code(), "external_file_open_failed");
    assert!(!error.message.contains("/private/secret"));
}

#[test]
fn open_external_file_rejects_stale_and_outside_identities() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("data.json"), "{}").unwrap();
    let opened = Arc::new(Mutex::new(Vec::new()));
    let workspace = workspace_with_recording_opener(&root, Arc::clone(&opened));
    let revision = workspace.list().unwrap().revision;

    assert_eq!(
        workspace
            .open_external_file(revision - 1, "data.json")
            .unwrap_err()
            .code(),
        "notes_workspace_changed"
    );
    for path in ["../outside.html", "/tmp/outside.html"] {
        assert_eq!(
            workspace
                .open_external_file(revision, path)
                .unwrap_err()
                .code(),
            "note_path_outside_root"
        );
    }
    assert!(opened.lock().unwrap().is_empty());
}

#[cfg(unix)]
#[test]
fn open_external_file_rejects_symlinks() {
    let root = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    std::fs::write(outside.path().join("outside.html"), "outside").unwrap();
    symlink(
        outside.path().join("outside.html"),
        root.path().join("linked.html"),
    )
    .unwrap();
    let opened = Arc::new(Mutex::new(Vec::new()));
    let workspace = workspace_with_recording_opener(&root, Arc::clone(&opened));
    let revision = workspace.list().unwrap().revision;

    assert_eq!(
        workspace
            .open_external_file(revision, "linked.html")
            .unwrap_err()
            .code(),
        "external_file_not_allowed"
    );
    assert!(opened.lock().unwrap().is_empty());
}

#[test]
fn open_external_file_rejects_hidden_workspace_entries() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join(".secret.html"), "secret").unwrap();
    std::fs::create_dir(root.path().join(".private")).unwrap();
    std::fs::write(root.path().join(".private/page.html"), "private").unwrap();
    let opened = Arc::new(Mutex::new(Vec::new()));
    let workspace = workspace_with_recording_opener(&root, Arc::clone(&opened));
    let revision = workspace.list().unwrap().revision;

    for path in [".secret.html", ".private/page.html"] {
        assert_eq!(
            workspace
                .open_external_file(revision, path)
                .unwrap_err()
                .code(),
            "external_file_not_allowed"
        );
    }
    assert!(opened.lock().unwrap().is_empty());
}

#[cfg(unix)]
#[test]
fn open_external_file_rejects_a_symlinked_parent_directory() {
    let root = TempDir::new().unwrap();
    let target = root.path().join("target");
    std::fs::create_dir(&target).unwrap();
    std::fs::write(target.join("page.html"), "page").unwrap();
    symlink(&target, root.path().join("linked-directory")).unwrap();
    let opened = Arc::new(Mutex::new(Vec::new()));
    let workspace = workspace_with_recording_opener(&root, Arc::clone(&opened));
    let revision = workspace.list().unwrap().revision;

    assert_eq!(
        workspace
            .open_external_file(revision, "linked-directory/page.html")
            .unwrap_err()
            .code(),
        "external_file_not_allowed"
    );
    assert!(opened.lock().unwrap().is_empty());
}

#[test]
fn operations_reject_absolute_and_parent_paths() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("inside.md"), "inside").unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;

    for path in ["../outside.md", "/tmp/outside.md"] {
        assert_eq!(
            workspace.open_document(revision, path).unwrap_err().code(),
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
        workspace
            .open_document(revision - 1, "note.md")
            .unwrap_err()
            .code(),
        "notes_workspace_changed"
    );
}

#[test]
fn workspace_deletes_nested_folder_but_not_root() {
    let root = TempDir::new().unwrap();
    std::fs::create_dir(root.path().join("nested")).unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    let summary = workspace
        .preflight_folder_deletion(revision, "nested")
        .unwrap();
    workspace.delete_folder(&summary.receipt).unwrap();
    assert!(!root.path().join("nested").exists());
    assert_eq!(
        workspace
            .preflight_folder_deletion(revision, "")
            .unwrap_err()
            .code(),
        "note_path_outside_root"
    );
}

#[test]
fn folder_deletion_rejects_a_directory_replaced_after_preflight() {
    let root = TempDir::new().unwrap();
    std::fs::create_dir(root.path().join("nested")).unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    let summary = workspace
        .preflight_folder_deletion(revision, "nested")
        .unwrap();
    std::fs::rename(root.path().join("nested"), root.path().join("original")).unwrap();
    std::fs::create_dir(root.path().join("nested")).unwrap();

    assert_eq!(
        workspace
            .delete_folder(&summary.receipt)
            .unwrap_err()
            .code(),
        "notes_folder_changed"
    );
    assert!(root.path().join("nested").exists());
    assert!(root.path().join("original").exists());
}

#[test]
fn folder_deletion_rejects_descendants_added_after_preflight() {
    let root = TempDir::new().unwrap();
    std::fs::create_dir(root.path().join("nested")).unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    let summary = workspace
        .preflight_folder_deletion(revision, "nested")
        .unwrap();
    std::fs::write(
        root.path().join("nested/.added-after-confirmation"),
        "hidden",
    )
    .unwrap();

    assert_eq!(
        workspace
            .delete_folder(&summary.receipt)
            .unwrap_err()
            .code(),
        "notes_folder_changed"
    );
    assert!(root
        .path()
        .join("nested/.added-after-confirmation")
        .exists());
}

#[cfg(unix)]
#[test]
fn folder_deletion_rejects_a_symlink_replacement_after_preflight() {
    let root = TempDir::new().unwrap();
    std::fs::create_dir(root.path().join("nested")).unwrap();
    std::fs::create_dir(root.path().join("other")).unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    let summary = workspace
        .preflight_folder_deletion(revision, "nested")
        .unwrap();
    std::fs::remove_dir(root.path().join("nested")).unwrap();
    symlink(root.path().join("other"), root.path().join("nested")).unwrap();

    assert_eq!(
        workspace
            .delete_folder(&summary.receipt)
            .unwrap_err()
            .code(),
        "note_path_outside_root"
    );
    assert!(root.path().join("other").exists());
    assert!(root.path().join("nested").is_symlink());
}

#[cfg(unix)]
#[test]
fn folder_deletion_preflight_counts_all_descendants_and_invisible_entries() {
    let root = TempDir::new().unwrap();
    let folder = root.path().join("nested");
    std::fs::create_dir_all(folder.join("child")).unwrap();
    std::fs::create_dir_all(folder.join(".hidden")).unwrap();
    std::fs::write(folder.join("visible.md"), "visible").unwrap();
    std::fs::write(folder.join("child/data.json"), "{}").unwrap();
    std::fs::write(folder.join(".secret"), "secret").unwrap();
    std::fs::write(folder.join(".hidden/deep.js"), "hidden").unwrap();
    symlink(root.path().join("outside"), folder.join("linked")).unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;

    let summary = workspace
        .preflight_folder_deletion(revision, "nested")
        .unwrap();

    assert_eq!(summary.file_count, 4);
    assert_eq!(summary.directory_count, 2);
    assert_eq!(summary.invisible_entry_count, 4);
    assert!(!summary.receipt.is_empty());
    assert_eq!(
        workspace
            .preflight_folder_deletion(revision, "")
            .unwrap_err()
            .code(),
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
            .rename_document(
                &workspace
                    .open_document(revision, "note.md")
                    .unwrap()
                    .receipt,
                "../outside",
                None,
            )
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
            .rename_document(
                &workspace
                    .open_document(revision, "source.md")
                    .unwrap()
                    .receipt,
                "target.md",
                None,
            )
            .unwrap_err()
            .code(),
        "note_io_error"
    );
}

#[test]
fn dirty_rename_collision_does_not_save_pending_content() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join("source.md"), "source").unwrap();
    std::fs::write(root.path().join("target.md"), "target").unwrap();
    let workspace = workspace(&root);
    let revision = workspace.list().unwrap().revision;
    let opened = workspace.open_document(revision, "source.md").unwrap();

    let error = workspace
        .rename_document(&opened.receipt, "target.md", Some("draft"))
        .unwrap_err();

    assert_eq!(error.code(), "note_io_error");
    assert_eq!(
        std::fs::read_to_string(root.path().join("source.md")).unwrap(),
        "source"
    );
    assert_eq!(
        std::fs::read_to_string(root.path().join("target.md")).unwrap(),
        "target"
    );
}
