use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde::Serialize;

use crate::{
    error::{AppError, AppResult},
    providers::{Capability, ProviderId},
    translation::{
        PreparedTranslationRoute, ProviderError, ProviderStatusView, TranslationProviderManager,
    },
};

use super::{persistence, RssHubSettings, Settings};

pub type SharedSettingsStore = Arc<SettingsStore>;

#[derive(Debug, Clone, Serialize)]
pub struct SettingsSnapshot {
    pub revision: u64,
    pub settings: Settings,
    pub providers: Vec<ProviderStatusView>,
}

#[derive(Debug, Clone)]
pub struct SettingsStartupWarning {
    pub code: String,
    pub message: String,
}

pub struct SettingsOpen {
    pub store: SettingsStore,
    pub warning: Option<SettingsStartupWarning>,
}

struct SettingsState {
    revision: u64,
    settings: Settings,
    recovery: bool,
}

pub struct SettingsStore {
    path: PathBuf,
    providers: Arc<TranslationProviderManager>,
    state: Mutex<SettingsState>,
}

impl SettingsStore {
    pub fn open(path: PathBuf, providers: Arc<TranslationProviderManager>) -> SettingsOpen {
        let (settings, warning, recovery) = match persistence::load(&path) {
            Ok(settings) => match providers.prepare(&settings) {
                Ok(prepared) => {
                    providers.commit(prepared);
                    (settings, None, false)
                }
                Err(error) => (
                    settings,
                    Some(startup_warning(&provider_error(error))),
                    true,
                ),
            },
            Err(error) => (Settings::default(), Some(startup_warning(&error)), true),
        };
        if recovery {
            providers.commit(PreparedTranslationRoute::disabled());
        }
        SettingsOpen {
            store: Self {
                path,
                providers,
                state: Mutex::new(SettingsState {
                    revision: 1,
                    settings,
                    recovery,
                }),
            },
            warning,
        }
    }

    pub fn snapshot(&self) -> SettingsSnapshot {
        let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        self.snapshot_from(&state)
    }

    pub fn replace(
        &self,
        expected_revision: u64,
        settings: Settings,
    ) -> AppResult<SettingsSnapshot> {
        self.commit_change(expected_revision, settings)
    }

    pub fn activate_provider(
        &self,
        expected_revision: u64,
        capability: Capability,
        provider: ProviderId,
    ) -> AppResult<SettingsSnapshot> {
        let settings = self.settings_at(expected_revision)?;
        let settings = match capability {
            Capability::Translation => Settings {
                capabilities: super::CapabilitySettings {
                    translation: super::ProviderRouteSettings {
                        primary_provider: Some(provider),
                        ..settings.capabilities.translation
                    },
                },
                ..settings
            },
            Capability::Ai => return Err(unsupported_capability()),
        };
        self.commit_change(expected_revision, settings)
    }

    pub fn deactivate_provider(
        &self,
        expected_revision: u64,
        capability: Capability,
    ) -> AppResult<SettingsSnapshot> {
        let settings = self.settings_at(expected_revision)?;
        let settings = match capability {
            Capability::Translation => Settings {
                capabilities: super::CapabilitySettings {
                    translation: super::ProviderRouteSettings {
                        primary_provider: None,
                        ..settings.capabilities.translation
                    },
                },
                ..settings
            },
            Capability::Ai => return Err(unsupported_capability()),
        };
        self.commit_change(expected_revision, settings)
    }

    pub fn rsshub_configuration(&self) -> RssHubSettings {
        self.state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .settings
            .services
            .rsshub
            .clone()
    }

    fn settings_at(&self, expected_revision: u64) -> AppResult<Settings> {
        let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        ensure_revision(expected_revision, state.revision)?;
        Ok(state.settings.clone())
    }

    fn commit_change(
        &self,
        expected_revision: u64,
        settings: Settings,
    ) -> AppResult<SettingsSnapshot> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        ensure_revision(expected_revision, state.revision)?;
        if !state.recovery && state.settings == settings {
            return Ok(self.snapshot_from(&state));
        }
        persistence::validate(&settings)?;
        let prepared = self.providers.prepare(&settings).map_err(provider_error)?;
        persistence::save(&self.path, &settings)?;
        self.providers.commit(prepared);
        *state = SettingsState {
            revision: state.revision + 1,
            settings,
            recovery: false,
        };
        Ok(self.snapshot_from(&state))
    }

    fn snapshot_from(&self, state: &SettingsState) -> SettingsSnapshot {
        SettingsSnapshot {
            revision: state.revision,
            settings: state.settings.clone(),
            providers: self.providers.statuses(&state.settings),
        }
    }
}

fn ensure_revision(expected: u64, actual: u64) -> AppResult<()> {
    if expected == actual {
        Ok(())
    } else {
        Err(AppError::settings_revision_conflict(expected, actual))
    }
}

fn unsupported_capability() -> AppError {
    AppError::settings_error(
        "settings_unsupported_capability",
        "AI providers are not supported yet",
    )
}

fn provider_error(error: ProviderError) -> AppError {
    let code = match error {
        ProviderError::AlreadyRegistered { .. } => "settings_provider_already_registered",
        ProviderError::NotRegistered { .. } => "settings_provider_not_registered",
        ProviderError::InvalidConfiguration { .. } => "settings_provider_invalid_configuration",
        ProviderError::BuildFailed { .. } => "settings_provider_build_failed",
    };
    AppError::settings_error(code, error.to_string())
}

fn startup_warning(error: &AppError) -> SettingsStartupWarning {
    SettingsStartupWarning {
        code: error.code().to_owned(),
        message:
            "设置文件无法完整应用。原文件已保留，应用已使用临时设置启动；请检查并重新保存设置。"
                .to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tempfile::TempDir;

    use super::SettingsStore;
    use crate::{
        providers::ProviderContext,
        settings::{CommonSettings, PathSettings, Settings},
        translation::{TranslationProviderManager, TranslationRegistry, TranslationRuntime},
    };

    fn provider_manager() -> Arc<TranslationProviderManager> {
        Arc::new(TranslationProviderManager::new(
            TranslationRegistry::default(),
            Arc::new(TranslationRuntime::default()),
            ProviderContext::new(reqwest::Client::new()),
        ))
    }

    #[test]
    fn missing_file_opens_at_revision_one_without_writing() {
        let directory = TempDir::new().unwrap();
        let path = directory.path().join("settings.json");

        let opened = SettingsStore::open(path.clone(), provider_manager());

        assert!(opened.warning.is_none());
        assert_eq!(opened.store.snapshot().revision, 1);
        assert_eq!(opened.store.snapshot().settings, Settings::default());
        assert!(!path.exists());
    }

    #[test]
    fn successful_replace_advances_revision_and_persists_snapshot() {
        let directory = TempDir::new().unwrap();
        let path = directory.path().join("settings.json");
        let opened = SettingsStore::open(path.clone(), provider_manager());
        let settings = Settings {
            common: CommonSettings {
                paths: PathSettings {
                    notes_dir: Some("/tmp/notes".into()),
                    ..Default::default()
                },
            },
            ..Settings::default()
        };

        let snapshot = opened.store.replace(1, settings.clone()).unwrap();

        assert_eq!(snapshot.revision, 2);
        assert_eq!(snapshot.settings, settings);
        assert!(path.exists());
    }

    #[test]
    fn stale_replace_does_not_change_the_current_snapshot() {
        let directory = TempDir::new().unwrap();
        let opened =
            SettingsStore::open(directory.path().join("settings.json"), provider_manager());

        let error = opened.store.replace(0, Settings::default()).unwrap_err();

        assert_eq!(error.code(), "settings_revision_conflict");
        assert_eq!(opened.store.snapshot().revision, 1);
    }

    #[test]
    fn normal_no_op_keeps_revision_and_does_not_create_the_file() {
        let directory = TempDir::new().unwrap();
        let path = directory.path().join("settings.json");
        let opened = SettingsStore::open(path.clone(), provider_manager());

        let snapshot = opened.store.replace(1, Settings::default()).unwrap();

        assert_eq!(snapshot.revision, 1);
        assert!(!path.exists());
    }

    #[test]
    fn recovery_preserves_the_bad_file_until_a_successful_save() {
        let directory = TempDir::new().unwrap();
        let path = directory.path().join("settings.json");
        std::fs::write(&path, b"{").unwrap();
        let opened = SettingsStore::open(path.clone(), provider_manager());

        assert!(opened.warning.is_some());
        assert_eq!(std::fs::read(&path).unwrap(), b"{");

        let snapshot = opened.store.replace(1, Settings::default()).unwrap();

        assert_eq!(snapshot.revision, 2);
        assert_eq!(
            crate::settings::persistence::load(&path).unwrap(),
            Settings::default()
        );
    }

    #[test]
    fn unregistered_provider_starts_in_recovery_without_changing_the_file() {
        let directory = TempDir::new().unwrap();
        let path = directory.path().join("settings.json");
        let missing = crate::providers::ProviderId::new("missing-provider").unwrap();
        let settings = Settings {
            capabilities: crate::settings::CapabilitySettings {
                translation: crate::settings::ProviderRouteSettings {
                    primary_provider: Some(missing),
                    fallback_providers: Vec::new(),
                },
            },
            ..Settings::default()
        };
        let original = serde_json::to_vec_pretty(&settings).unwrap();
        std::fs::write(&path, &original).unwrap();
        let runtime = Arc::new(TranslationRuntime::default());
        let manager = Arc::new(TranslationProviderManager::new(
            TranslationRegistry::default(),
            Arc::clone(&runtime),
            ProviderContext::new(reqwest::Client::new()),
        ));

        let opened = SettingsStore::open(path.clone(), manager);

        assert_eq!(
            opened.warning.as_ref().map(|warning| warning.code.as_str()),
            Some("settings_provider_not_registered")
        );
        assert_eq!(opened.store.snapshot().settings, settings);
        assert!(runtime.current().is_none());
        assert_eq!(std::fs::read(path).unwrap(), original);
    }
}
