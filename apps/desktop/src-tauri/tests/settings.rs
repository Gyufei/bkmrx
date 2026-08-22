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
fn old_grouped_settings_default_the_services_section() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    std::fs::write(&path, br#"{"common":{},"bookmark":{},"note":{},"rss":{}}"#).unwrap();

    let settings = load(&path).unwrap();

    assert_eq!(settings.services, Default::default());
}

#[test]
fn saves_niutrans_credentials_under_services() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    let settings = Settings {
        services: bkmrx_lib::settings::ServiceSettings {
            niutrans: bkmrx_lib::settings::NiuTransSettings {
                app_id: Some("app-id".into()),
                api_key: Some("api-key".into()),
            },
        },
        ..Settings::default()
    };

    save(&path, &settings).unwrap();

    let json: serde_json::Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(json["services"]["niutrans"]["app_id"], "app-id");
    assert_eq!(json["services"]["niutrans"]["api_key"], "api-key");
}
