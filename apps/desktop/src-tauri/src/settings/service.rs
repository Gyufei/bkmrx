use std::{path::PathBuf, sync::Arc};

use crate::{
    error::{AppError, AppResult},
    providers::{Capability, ProviderId, ProviderManager, ProviderStatusView},
    translation::ProviderError,
};

use super::{load, save, Settings};

pub struct SettingsService {
    path: PathBuf,
    providers: Arc<ProviderManager>,
}

impl SettingsService {
    pub fn new(path: PathBuf, providers: Arc<ProviderManager>) -> Self {
        Self { path, providers }
    }

    pub fn initialize(&self) -> AppResult<()> {
        let settings = self.load()?;
        let prepared = self.prepare(&settings)?;
        self.providers.commit(prepared);
        Ok(())
    }

    pub fn load(&self) -> AppResult<Settings> {
        load(&self.path)
    }

    pub fn update(&self, settings: Settings) -> AppResult<()> {
        let prepared = self.prepare(&settings)?;
        save(&self.path, &settings)?;
        self.providers.commit(prepared);
        Ok(())
    }

    pub fn provider_statuses(&self) -> AppResult<Vec<ProviderStatusView>> {
        Ok(self.providers.statuses(&self.load()?))
    }

    pub fn activate_provider(&self, capability: Capability, provider: ProviderId) -> AppResult<()> {
        let settings = self.load()?;
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
            Capability::Ai => {
                return Err(AppError::settings_error(
                    "settings_unsupported_capability",
                    "AI providers are not supported yet",
                ));
            }
        };
        self.update(settings)
    }

    pub fn deactivate_provider(&self, capability: Capability) -> AppResult<()> {
        let settings = self.load()?;
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
            Capability::Ai => {
                return Err(AppError::settings_error(
                    "settings_unsupported_capability",
                    "AI providers are not supported yet",
                ));
            }
        };
        self.update(settings)
    }

    fn prepare(&self, settings: &Settings) -> AppResult<crate::providers::PreparedProviderRoutes> {
        self.providers.prepare(settings).map_err(provider_error)
    }
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

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tempfile::TempDir;

    use crate::{
        providers::{ProviderContext, ProviderId, ProviderManager},
        translation::{
            providers::NiuTransProviderFactory, TranslationRegistry, TranslationRuntime,
        },
    };

    use super::*;

    fn fixture() -> (TempDir, Arc<TranslationRuntime>, SettingsService) {
        let directory = TempDir::new().unwrap();
        let runtime = Arc::new(TranslationRuntime::default());
        let mut registry = TranslationRegistry::default();
        registry
            .register(Arc::new(NiuTransProviderFactory))
            .unwrap();
        let context = ProviderContext::new(reqwest::Client::builder().build().unwrap());
        let manager = Arc::new(ProviderManager::new(
            registry,
            Arc::clone(&runtime),
            context,
        ));
        let service = SettingsService::new(directory.path().join("settings.json"), manager);
        (directory, runtime, service)
    }

    fn active_settings() -> Settings {
        Settings {
            capabilities: super::super::CapabilitySettings {
                translation: super::super::ProviderRouteSettings {
                    primary_provider: Some(ProviderId::new("niutrans").unwrap()),
                    fallback_providers: Vec::new(),
                },
            },
            providers: super::super::ProviderSettings {
                niutrans: super::super::NiuTransSettings {
                    app_id: Some("app".into()),
                    api_key: Some("key".into()),
                },
            },
            ..Settings::default()
        }
    }

    #[test]
    fn update_prepares_saves_and_then_publishes() {
        let (_directory, runtime, service) = fixture();
        service.update(active_settings()).unwrap();
        assert_eq!(runtime.current().unwrap().primary.id.as_str(), "niutrans");

        service.update(Settings::default()).unwrap();
        assert!(runtime.current().is_none());
        assert!(service
            .load()
            .unwrap()
            .capabilities
            .translation
            .primary_provider
            .is_none());
    }

    #[test]
    fn failed_prepare_preserves_disk_and_runtime_state() {
        let (_directory, runtime, service) = fixture();
        let current = active_settings();
        service.update(current.clone()).unwrap();

        let invalid = Settings {
            providers: super::super::ProviderSettings {
                niutrans: super::super::NiuTransSettings {
                    api_key: None,
                    ..current.providers.niutrans.clone()
                },
            },
            ..current.clone()
        };
        let error = service.update(invalid).unwrap_err();
        assert_eq!(error.code(), "settings_provider_invalid_configuration");

        assert_eq!(service.load().unwrap(), current);
        assert_eq!(runtime.current().unwrap().primary.id.as_str(), "niutrans");
    }

    #[test]
    fn unknown_provider_has_a_stable_error_code() {
        let (_directory, _runtime, service) = fixture();
        let settings = Settings {
            capabilities: super::super::CapabilitySettings {
                translation: super::super::ProviderRouteSettings {
                    primary_provider: Some(ProviderId::new("missing").unwrap()),
                    fallback_providers: Vec::new(),
                },
            },
            ..Settings::default()
        };

        let error = service.update(settings).unwrap_err();
        assert_eq!(error.code(), "settings_provider_not_registered");
    }
}
