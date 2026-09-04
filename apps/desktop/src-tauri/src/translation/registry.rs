use std::{collections::HashMap, sync::Arc};

use crate::{
    providers::{ProviderContext, ProviderDescriptor, ProviderId},
    settings::ProviderSettings,
};

use super::TranslationProvider;

#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("Provider '{provider}' is already registered")]
    AlreadyRegistered { provider: ProviderId },
    #[error("Translation provider '{provider}' is not registered")]
    NotRegistered { provider: ProviderId },
    #[error("Provider '{provider}' configuration is invalid: {message}")]
    InvalidConfiguration {
        provider: ProviderId,
        message: String,
    },
    #[error("Provider '{provider}' could not be built: {message}")]
    BuildFailed {
        provider: ProviderId,
        message: String,
    },
}

impl ProviderError {
    pub fn invalid_configuration(provider: ProviderId, message: impl Into<String>) -> Self {
        Self::InvalidConfiguration {
            provider,
            message: message.into(),
        }
    }
}

pub trait TranslationProviderFactory: Send + Sync {
    fn descriptor(&self) -> ProviderDescriptor;

    fn is_configured(&self, settings: &ProviderSettings) -> bool;

    fn build(
        &self,
        settings: &ProviderSettings,
        context: &ProviderContext,
    ) -> Result<Arc<dyn TranslationProvider>, ProviderError>;
}

#[derive(Default)]
pub struct TranslationRegistry {
    factories: HashMap<ProviderId, Arc<dyn TranslationProviderFactory>>,
}

impl TranslationRegistry {
    pub fn register(
        &mut self,
        factory: Arc<dyn TranslationProviderFactory>,
    ) -> Result<(), ProviderError> {
        let id = factory.descriptor().id;
        if self.factories.contains_key(&id) {
            return Err(ProviderError::AlreadyRegistered { provider: id });
        }
        self.factories.insert(id, factory);
        Ok(())
    }

    pub fn descriptors(&self) -> Vec<ProviderDescriptor> {
        let mut descriptors = self
            .factories
            .values()
            .map(|factory| factory.descriptor())
            .collect::<Vec<_>>();
        descriptors.sort_by(|left, right| left.id.as_str().cmp(right.id.as_str()));
        descriptors
    }

    pub fn statuses(&self, settings: &ProviderSettings) -> Vec<(ProviderDescriptor, bool)> {
        let mut statuses = self
            .factories
            .values()
            .map(|factory| (factory.descriptor(), factory.is_configured(settings)))
            .collect::<Vec<_>>();
        statuses.sort_by(|left, right| left.0.id.as_str().cmp(right.0.id.as_str()));
        statuses
    }

    pub fn build(
        &self,
        id: &ProviderId,
        settings: &ProviderSettings,
        context: &ProviderContext,
    ) -> Result<Arc<dyn TranslationProvider>, ProviderError> {
        self.factories
            .get(id)
            .ok_or_else(|| ProviderError::NotRegistered {
                provider: id.clone(),
            })?
            .build(settings, context)
    }
}

#[cfg(test)]
mod tests {
    use futures_util::future::BoxFuture;

    use crate::{
        providers::{Capability, ProviderContext},
        settings::ProviderSettings,
        translation::{Translation, TranslationError, TranslationRequest},
    };

    use super::*;

    struct TestFactory;
    struct TestProvider {
        id: ProviderId,
    }

    impl TranslationProviderFactory for TestFactory {
        fn descriptor(&self) -> ProviderDescriptor {
            ProviderDescriptor {
                id: ProviderId::new("test").unwrap(),
                capability: Capability::Translation,
                display_name: "Test",
                description: "Test provider",
            }
        }

        fn is_configured(&self, _settings: &ProviderSettings) -> bool {
            true
        }

        fn build(
            &self,
            _settings: &ProviderSettings,
            _context: &ProviderContext,
        ) -> Result<Arc<dyn TranslationProvider>, ProviderError> {
            Ok(Arc::new(TestProvider {
                id: ProviderId::new("test").unwrap(),
            }))
        }
    }

    impl TranslationProvider for TestProvider {
        fn id(&self) -> &ProviderId {
            &self.id
        }

        fn translate<'a>(
            &'a self,
            _request: &'a TranslationRequest,
        ) -> BoxFuture<'a, Result<Translation, TranslationError>> {
            Box::pin(async { Err(TranslationError::Unavailable) })
        }
    }

    #[test]
    fn registers_discovers_and_builds_factories() {
        let mut registry = TranslationRegistry::default();
        registry.register(Arc::new(TestFactory)).unwrap();
        assert!(registry.register(Arc::new(TestFactory)).is_err());
        assert_eq!(registry.descriptors()[0].id.as_str(), "test");

        let context = ProviderContext::new(reqwest::Client::builder().build().unwrap());
        let provider = registry
            .build(
                &ProviderId::new("test").unwrap(),
                &ProviderSettings::default(),
                &context,
            )
            .unwrap();
        assert_eq!(provider.id().as_str(), "test");
        assert!(registry
            .build(
                &ProviderId::new("missing").unwrap(),
                &ProviderSettings::default(),
                &context,
            )
            .is_err());
    }
}
