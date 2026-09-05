use std::sync::Arc;

use serde::Serialize;

use crate::{
    settings::Settings,
    translation::{
        ActiveTranslationProvider, ProviderError, TranslationRegistry, TranslationRoute,
        TranslationRuntime,
    },
};

use super::{ProviderContext, ProviderDescriptor, ProviderId};

pub struct PreparedProviderRoutes {
    pub(crate) translation: Option<TranslationRoute>,
}

impl PreparedProviderRoutes {
    pub(crate) fn disabled() -> Self {
        Self { translation: None }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderStatusView {
    pub descriptor: ProviderDescriptor,
    pub configured: bool,
    pub activation: ProviderActivation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderActivation {
    Inactive,
    Primary,
    Fallback { priority: usize },
}

pub struct ProviderManager {
    translation_registry: TranslationRegistry,
    translation_runtime: Arc<TranslationRuntime>,
    context: ProviderContext,
}

impl ProviderManager {
    pub fn new(
        translation_registry: TranslationRegistry,
        translation_runtime: Arc<TranslationRuntime>,
        context: ProviderContext,
    ) -> Self {
        Self {
            translation_registry,
            translation_runtime,
            context,
        }
    }

    pub fn prepare(&self, settings: &Settings) -> Result<PreparedProviderRoutes, ProviderError> {
        let route = &settings.capabilities.translation;
        let Some(primary_id) = &route.primary_provider else {
            return Ok(PreparedProviderRoutes { translation: None });
        };
        let primary = self.active_provider(primary_id, settings)?;
        let fallbacks = route
            .fallback_providers
            .iter()
            .map(|id| self.active_provider(id, settings))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(PreparedProviderRoutes {
            translation: Some(TranslationRoute { primary, fallbacks }),
        })
    }

    pub fn commit(&self, prepared: PreparedProviderRoutes) {
        match prepared.translation {
            Some(route) => self.translation_runtime.publish(route),
            None => self.translation_runtime.disable(),
        }
    }

    pub fn statuses(&self, settings: &Settings) -> Vec<ProviderStatusView> {
        let route = &settings.capabilities.translation;
        self.translation_registry
            .statuses(&settings.providers)
            .into_iter()
            .map(|(descriptor, configured)| {
                let id = &descriptor.id;
                let activation = if route.primary_provider.as_ref() == Some(id) {
                    ProviderActivation::Primary
                } else if let Some(priority) = route
                    .fallback_providers
                    .iter()
                    .position(|fallback| fallback == id)
                {
                    ProviderActivation::Fallback { priority }
                } else {
                    ProviderActivation::Inactive
                };
                ProviderStatusView {
                    descriptor,
                    configured,
                    activation,
                }
            })
            .collect()
    }

    fn active_provider(
        &self,
        id: &ProviderId,
        settings: &Settings,
    ) -> Result<ActiveTranslationProvider, ProviderError> {
        let provider = self
            .translation_registry
            .build(id, &settings.providers, &self.context)?;
        Ok(ActiveTranslationProvider {
            id: id.clone(),
            provider,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::ProviderActivation;

    #[test]
    fn activation_keeps_fallback_priority_in_the_wire_format() {
        assert_eq!(
            serde_json::to_value(ProviderActivation::Fallback { priority: 2 }).unwrap(),
            serde_json::json!({ "fallback": { "priority": 2 } })
        );
    }
}
