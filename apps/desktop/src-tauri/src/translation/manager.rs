use std::sync::Arc;

use serde::Serialize;

use crate::{
    providers::{ProviderContext, ProviderDescriptor, ProviderId},
    settings::Settings,
};

use super::{
    ActiveTranslationProvider, ProviderError, TranslationRegistry, TranslationRoute,
    TranslationRuntime,
};

pub struct PreparedTranslationRoute {
    route: Option<TranslationRoute>,
}

impl PreparedTranslationRoute {
    pub(crate) fn disabled() -> Self {
        Self { route: None }
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
    Fallback { position: usize },
}

pub struct TranslationProviderManager {
    registry: TranslationRegistry,
    runtime: Arc<TranslationRuntime>,
    context: ProviderContext,
}

impl TranslationProviderManager {
    pub fn new(
        registry: TranslationRegistry,
        runtime: Arc<TranslationRuntime>,
        context: ProviderContext,
    ) -> Self {
        Self {
            registry,
            runtime,
            context,
        }
    }

    pub fn prepare(&self, settings: &Settings) -> Result<PreparedTranslationRoute, ProviderError> {
        let route = &settings.capabilities.translation;
        let Some(primary_id) = &route.primary_provider else {
            return Ok(PreparedTranslationRoute { route: None });
        };
        let primary = self.active_provider(primary_id, settings)?;
        let fallbacks = route
            .fallback_providers
            .iter()
            .map(|id| self.active_provider(id, settings))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(PreparedTranslationRoute {
            route: Some(TranslationRoute { primary, fallbacks }),
        })
    }

    pub fn commit(&self, prepared: PreparedTranslationRoute) {
        match prepared.route {
            Some(route) => {
                log::info!(
                    "translation_route_published primary_provider={} fallback_count={}",
                    route.primary.id,
                    route.fallbacks.len()
                );
                self.runtime.publish(route);
            }
            None => {
                log::info!("translation_route_disabled");
                self.runtime.disable();
            }
        }
    }

    pub fn statuses(&self, settings: &Settings) -> Vec<ProviderStatusView> {
        let route = &settings.capabilities.translation;
        self.registry
            .statuses(&settings.providers)
            .into_iter()
            .map(|(descriptor, configured)| {
                let id = &descriptor.id;
                let activation = if route.primary_provider.as_ref() == Some(id) {
                    ProviderActivation::Primary
                } else if let Some(position) = route
                    .fallback_providers
                    .iter()
                    .position(|fallback| fallback == id)
                {
                    ProviderActivation::Fallback { position }
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
            .registry
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
    fn activation_exposes_the_zero_based_fallback_position() {
        assert_eq!(
            serde_json::to_value(ProviderActivation::Fallback { position: 2 }).unwrap(),
            serde_json::json!({ "fallback": { "position": 2 } })
        );
    }
}
