use bkmrx_lib::settings::{load, save, Settings};
use tempfile::TempDir;

#[test]
fn settings_round_trip_at_explicit_app_data_path() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    let settings = Settings {
        schema_version: bkmrx_lib::settings::SETTINGS_SCHEMA_VERSION,
        common: bkmrx_lib::settings::CommonSettings {
            paths: bkmrx_lib::settings::PathSettings {
                notes_dir: Some("/tmp/notes".to_owned()),
                ..Default::default()
            },
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
            common: bkmrx_lib::settings::CommonSettings {
                paths: bkmrx_lib::settings::PathSettings {
                    notes_dir: Some("/tmp/notes".into()),
                    ..Default::default()
                },
            },
            ..Settings::default()
        },
    )
    .unwrap();

    assert_eq!(
        load(&path).unwrap().common.paths.notes_dir.as_deref(),
        Some("/tmp/notes")
    );
    assert_eq!(std::fs::read_dir(app_data.path()).unwrap().count(), 1);
}

#[test]
fn missing_groups_use_defaults() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    std::fs::write(&path, br#"{}"#).unwrap();

    let settings = load(&path).unwrap();

    assert_eq!(settings, Settings::default());
}

#[test]
fn migrates_complete_legacy_niutrans_settings_to_active_provider() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    std::fs::write(
        &path,
        br#"{"services":{"niutrans":{"app_id":"app","api_key":"key"}}}"#,
    )
    .unwrap();

    let settings = load(&path).unwrap();

    assert_eq!(
        settings
            .capabilities
            .translation
            .primary_provider
            .as_ref()
            .map(|provider| provider.as_str()),
        Some("niutrans")
    );
    assert_eq!(
        settings.schema_version,
        bkmrx_lib::settings::SETTINGS_SCHEMA_VERSION
    );
}

#[test]
fn preserves_explicitly_disabled_translation_in_current_schema() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    std::fs::write(
        &path,
        br#"{
            "schema_version": 1,
            "capabilities": {"translation": {"primary_provider": null}},
            "services": {"niutrans": {"app_id": "app", "api_key": "key"}}
        }"#,
    )
    .unwrap();

    let settings = load(&path).unwrap();

    assert!(settings.capabilities.translation.primary_provider.is_none());
}

#[test]
fn rejects_duplicate_translation_route_entries() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    let niutrans = bkmrx_lib::providers::ProviderId::new("niutrans").unwrap();
    let settings = Settings {
        capabilities: bkmrx_lib::settings::CapabilitySettings {
            translation: bkmrx_lib::settings::ProviderRouteSettings {
                primary_provider: Some(niutrans.clone()),
                fallback_providers: vec![niutrans],
            },
        },
        ..Settings::default()
    };

    let error = save(&path, &settings).unwrap_err();

    assert_eq!(error.code(), "settings_invalid_provider_route");
}

#[test]
fn saves_niutrans_credentials_under_providers() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    let settings = Settings {
        providers: bkmrx_lib::settings::ProviderSettings {
            niutrans: bkmrx_lib::settings::NiuTransSettings {
                app_id: Some("app-id".into()),
                api_key: Some("api-key".into()),
            },
        },
        ..Settings::default()
    };

    save(&path, &settings).unwrap();

    let json: serde_json::Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(json["providers"]["niutrans"]["app_id"], "app-id");
    assert_eq!(json["providers"]["niutrans"]["api_key"], "api-key");
    assert!(json["services"].get("niutrans").is_none());
}

#[test]
fn saves_only_the_new_grouped_structure() {
    let app_data = TempDir::new().unwrap();
    let path = app_data.path().join("settings.json");
    let settings = Settings {
        schema_version: bkmrx_lib::settings::SETTINGS_SCHEMA_VERSION,
        common: bkmrx_lib::settings::CommonSettings {
            paths: bkmrx_lib::settings::PathSettings {
                bookmark_export_dir: Some("/tmp/bookmarks".into()),
                todo_export_dir: Some("/tmp/todos".into()),
                notes_dir: Some("/tmp/notes".into()),
            },
        },
        services: bkmrx_lib::settings::ServiceSettings {
            rsshub: bkmrx_lib::settings::RssHubSettings {
                base_url: Some("https://rss.example.com".into()),
                access_key: Some("secret".into()),
            },
        },
        capabilities: Default::default(),
        providers: Default::default(),
    };

    save(&path, &settings).unwrap();

    let json: serde_json::Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(json["common"]["paths"]["todo_export_dir"], "/tmp/todos");
    assert_eq!(
        json["services"]["rsshub"]["base_url"],
        "https://rss.example.com"
    );
    assert!(json.get("bookmark").is_none());
    assert!(json.get("note").is_none());
    assert!(json.get("rss").is_none());
}
