use bkmrx_lib::settings::{load, save, Settings};
use tempfile::TempDir;

#[test]
fn settings_round_trip_at_explicit_app_data_path() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    let settings = Settings {
        notes_dir: Some("/tmp/notes".to_owned()),
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
