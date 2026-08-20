use bkmrx_lib::settings::{load, save, Settings};
use tempfile::TempDir;

#[test]
fn settings_round_trip_at_explicit_app_data_path() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    let settings = Settings {
        note: bkmrx_lib::settings::NoteSettings {
            notes_dir: Some("/tmp/notes".to_owned()),
        },
        ..Settings::default()
    };

    save(&path, &settings).unwrap();

    assert_eq!(load(&path).unwrap(), settings);
    assert!(path.exists());
}

#[test]
fn missing_settings_use_defaults_without_touching_legacy_home_path() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");

    let settings = load(&path).unwrap();

    assert_eq!(settings, Settings::default());
    assert!(!path.exists());
    assert!(!app_data.path().join(".bkmr/settings.json").exists());
}

#[test]
fn invalid_settings_return_stable_error_code() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    std::fs::write(&path, b"{").unwrap();

    let error = load(&path).unwrap_err();

    assert_eq!(error.code(), "settings_invalid");
}

#[test]
fn save_replaces_settings_without_leaving_temp_files() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    save(&path, &Settings::default()).unwrap();
    save(
        &path,
        &Settings {
            note: bkmrx_lib::settings::NoteSettings {
                notes_dir: Some("/tmp/notes".into()),
            },
            ..Settings::default()
        },
    )
    .unwrap();

    assert_eq!(
        load(&path).unwrap().note.notes_dir.as_deref(),
        Some("/tmp/notes")
    );
    assert_eq!(std::fs::read_dir(app_data.path()).unwrap().count(), 1);
}

#[test]
fn loads_legacy_flat_settings_and_saves_grouped_json() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    std::fs::write(&path, br#"{"backup_dir":"/backup","notes_dir":"/notes"}"#).unwrap();

    let settings = load(&path).unwrap();
    assert_eq!(settings.bookmark.backup_dir.as_deref(), Some("/backup"));
    assert_eq!(settings.note.notes_dir.as_deref(), Some("/notes"));
    save(&path, &settings).unwrap();

    let json = std::fs::read_to_string(path).unwrap();
    assert!(json.contains("\"bookmark\""));
    assert!(json.contains("\"note\""));
    assert!(!json.contains("\"backup_dir\": null"));
}
