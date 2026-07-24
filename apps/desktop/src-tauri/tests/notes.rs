use bkmrx_lib::notes::NoteService;
use tempfile::TempDir;

#[test]
fn service_round_trips_note_file_operations() {
    let temp = TempDir::new().unwrap();
    let service = NoteService::without_events();
    let created = service
        .create(temp.path().to_str().unwrap(), "one")
        .unwrap();

    service.write(&created, "# changed\n").unwrap();
    assert_eq!(service.read(&created).unwrap(), "# changed\n");

    let renamed = temp.path().join("two.md");
    service
        .rename(&created, renamed.to_str().unwrap())
        .unwrap();
    service.delete(renamed.to_str().unwrap()).unwrap();
    assert!(!renamed.exists());
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
        notes.iter().map(|note| note.title.as_str()).collect::<Vec<_>>(),
        vec!["a", "b"]
    );
}

#[test]
fn missing_note_returns_stable_error() {
    let error = NoteService::without_events()
        .read("/missing/note.md")
        .unwrap_err();

    assert_eq!(error.code(), "note_io_error");
}
