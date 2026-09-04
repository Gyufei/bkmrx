use bkmrx_lib::notes::NoteService;
use tempfile::TempDir;

#[test]
fn service_round_trips_note_file_operations() {
    let temp = TempDir::new().unwrap();
    let service = NoteService::without_events();
    service.scan(temp.path().to_str().unwrap()).unwrap();
    let created = service
        .create(temp.path().to_str().unwrap(), "one")
        .unwrap();

    service.write(&created, "# changed\n").unwrap();
    assert_eq!(service.read(&created).unwrap(), "# changed\n");

    let renamed = temp.path().join("two.md");
    service.rename(&created, renamed.to_str().unwrap()).unwrap();
    service.delete(renamed.to_str().unwrap()).unwrap();
    assert!(!renamed.exists());
}

#[test]
fn service_deletes_nested_note_folder_but_not_notes_root() {
    let temp = TempDir::new().unwrap();
    let nested = temp.path().join("nested");
    std::fs::create_dir_all(&nested).unwrap();
    std::fs::write(nested.join("note.md"), "# note\n").unwrap();
    let service = NoteService::without_events();
    service.scan(temp.path().to_str().unwrap()).unwrap();

    service.delete_folder(nested.to_str().unwrap()).unwrap();

    assert!(!nested.exists());
    assert_eq!(
        service
            .delete_folder(temp.path().to_str().unwrap())
            .unwrap_err()
            .code(),
        "note_path_outside_root"
    );
    assert!(temp.path().exists());
}

#[test]
fn scan_returns_nested_markdown_in_title_order() {
    let temp = TempDir::new().unwrap();
    let nested = temp.path().join("nested");
    std::fs::create_dir_all(&nested).unwrap();
    std::fs::write(temp.path().join("b.md"), "# b\n").unwrap();
    std::fs::write(nested.join("a.md"), "# a\n").unwrap();
    std::fs::write(temp.path().join("ignored.txt"), "ignored").unwrap();

    let notes = NoteService::without_events()
        .scan(temp.path().to_str().unwrap())
        .unwrap();

    assert_eq!(
        notes
            .iter()
            .map(|note| note.title.as_str())
            .collect::<Vec<_>>(),
        vec!["a", "b"]
    );
}

#[test]
fn missing_note_returns_stable_error() {
    let temp = TempDir::new().unwrap();
    let service = NoteService::without_events();
    service.scan(temp.path().to_str().unwrap()).unwrap();
    let error = service
        .read(temp.path().join("missing.md").to_str().unwrap())
        .unwrap_err();

    assert_eq!(error.code(), "note_io_error");
}

#[test]
fn file_operations_stay_within_scanned_directory() {
    let notes = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    let outside_note = outside.path().join("outside.md");
    let inside_note = notes.path().join("inside.md");
    std::fs::write(&outside_note, "# outside\n").unwrap();
    std::fs::write(&inside_note, "# inside\n").unwrap();
    let service = NoteService::without_events();
    service.scan(notes.path().to_str().unwrap()).unwrap();

    for error in [
        service.read(outside_note.to_str().unwrap()).unwrap_err(),
        service
            .write(outside_note.to_str().unwrap(), "changed")
            .unwrap_err(),
        service.delete(outside_note.to_str().unwrap()).unwrap_err(),
        service
            .create(outside.path().to_str().unwrap(), "created")
            .unwrap_err(),
        service
            .rename(
                inside_note.to_str().unwrap(),
                outside.path().join("renamed.md").to_str().unwrap(),
            )
            .unwrap_err(),
    ] {
        assert_eq!(error.code(), "note_path_outside_root");
    }
    assert_eq!(
        std::fs::read_to_string(outside_note).unwrap(),
        "# outside\n"
    );
    assert_eq!(std::fs::read_to_string(inside_note).unwrap(), "# inside\n");
}

#[test]
fn create_rejects_names_that_contain_path_components() {
    let temp = TempDir::new().unwrap();
    let service = NoteService::without_events();
    service.scan(temp.path().to_str().unwrap()).unwrap();

    for name in ["../outside", "nested/note", r"nested\note", ".", ".."] {
        let error = service
            .create(temp.path().to_str().unwrap(), name)
            .unwrap_err();
        assert_eq!(error.code(), "invalid_note_name", "name: {name}");
    }
}

#[test]
fn rename_does_not_replace_an_existing_note() {
    let temp = TempDir::new().unwrap();
    let source = temp.path().join("source.md");
    let target = temp.path().join("target.md");
    std::fs::write(&source, "source").unwrap();
    std::fs::write(&target, "target").unwrap();
    let service = NoteService::without_events();
    service.scan(temp.path().to_str().unwrap()).unwrap();

    let error = service
        .rename(source.to_str().unwrap(), target.to_str().unwrap())
        .unwrap_err();

    assert_eq!(error.code(), "note_io_error");
    assert_eq!(std::fs::read_to_string(source).unwrap(), "source");
    assert_eq!(std::fs::read_to_string(target).unwrap(), "target");
}

#[cfg(unix)]
#[test]
fn scan_skips_symbolic_link_directories() {
    use std::os::unix::fs::symlink;

    let temp = TempDir::new().unwrap();
    std::fs::write(temp.path().join("note.md"), "# note\n").unwrap();
    symlink(temp.path(), temp.path().join("loop")).unwrap();

    let notes = NoteService::without_events()
        .scan(temp.path().to_str().unwrap())
        .unwrap();

    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0].title, "note");
}
