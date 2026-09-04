use std::sync::Arc;

use crate::providers::ProviderId;

use super::{Translation, TranslationError, TranslationRequest, TranslationRuntime};

const MAX_TEXT_LENGTH: usize = 5_000;

#[derive(Debug, thiserror::Error)]
#[error("{error}")]
pub struct TranslationFailure {
    pub error: TranslationError,
    pub provider: Option<ProviderId>,
}

#[derive(Clone)]
pub struct TranslationService {
    runtime: Arc<TranslationRuntime>,
}

impl TranslationService {
    pub fn new(runtime: Arc<TranslationRuntime>) -> Self {
        Self { runtime }
    }

    pub fn unavailable() -> Self {
        Self::new(Arc::new(TranslationRuntime::default()))
    }

    pub async fn translate(
        &self,
        request: TranslationRequest,
    ) -> Result<Translation, TranslationError> {
        self.translate_with_context(request)
            .await
            .map_err(|failure| failure.error)
    }

    pub async fn translate_with_context(
        &self,
        request: TranslationRequest,
    ) -> Result<Translation, TranslationFailure> {
        validate_request(&request).map_err(|error| TranslationFailure {
            error,
            provider: None,
        })?;
        let route = self.runtime.current().ok_or(TranslationFailure {
            error: TranslationError::Unavailable,
            provider: None,
        })?;
        let provider = route.primary.id.clone();
        route
            .primary
            .provider
            .translate(&request)
            .await
            .map_err(|error| TranslationFailure {
                error,
                provider: Some(provider),
            })
    }

    pub fn provider_name(&self) -> Option<String> {
        self.runtime
            .current()
            .map(|route| route.primary.id.to_string())
    }
}

fn validate_request(request: &TranslationRequest) -> Result<(), TranslationError> {
    let length = request.text.chars().count();
    if request.text.trim().is_empty() {
        return Err(TranslationError::InvalidRequest(
            "Translation text must not be empty".to_owned(),
        ));
    }
    if length > MAX_TEXT_LENGTH {
        return Err(TranslationError::InvalidRequest(format!(
            "Translation text must not exceed {MAX_TEXT_LENGTH} characters"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use futures_util::future::BoxFuture;
    use tokio::sync::Notify;

    use crate::providers::ProviderId;

    use super::*;
    use crate::translation::{ActiveTranslationProvider, TranslationProvider, TranslationRoute};

    struct TestProvider {
        id: ProviderId,
    }

    struct ControlledProvider {
        id: ProviderId,
        entered: Arc<Notify>,
        release: Arc<Notify>,
    }

    impl TranslationProvider for TestProvider {
        fn id(&self) -> &ProviderId {
            &self.id
        }

        fn translate<'a>(
            &'a self,
            _request: &'a TranslationRequest,
        ) -> BoxFuture<'a, Result<Translation, TranslationError>> {
            Box::pin(async move {
                Ok(Translation {
                    text: "你好".to_owned(),
                    source_language: "en".to_owned(),
                    provider: self.id.to_string(),
                })
            })
        }
    }

    impl TranslationProvider for ControlledProvider {
        fn id(&self) -> &ProviderId {
            &self.id
        }

        fn translate<'a>(
            &'a self,
            _request: &'a TranslationRequest,
        ) -> BoxFuture<'a, Result<Translation, TranslationError>> {
            Box::pin(async move {
                self.entered.notify_one();
                self.release.notified().await;
                Ok(Translation {
                    text: "你好".to_owned(),
                    source_language: "en".to_owned(),
                    provider: self.id.to_string(),
                })
            })
        }
    }

    fn route(id: &str) -> TranslationRoute {
        let id = ProviderId::new(id).unwrap();
        TranslationRoute {
            primary: ActiveTranslationProvider {
                id: id.clone(),
                provider: Arc::new(TestProvider { id }),
            },
            fallbacks: Vec::new(),
        }
    }

    fn controlled_route(id: &str, entered: Arc<Notify>, release: Arc<Notify>) -> TranslationRoute {
        let id = ProviderId::new(id).unwrap();
        TranslationRoute {
            primary: ActiveTranslationProvider {
                id: id.clone(),
                provider: Arc::new(ControlledProvider {
                    id,
                    entered,
                    release,
                }),
            },
            fallbacks: Vec::new(),
        }
    }

    #[tokio::test]
    async fn service_uses_the_current_provider() {
        let runtime = Arc::new(TranslationRuntime::default());
        let service = TranslationService::new(Arc::clone(&runtime));
        assert!(matches!(
            service
                .translate(TranslationRequest { text: "Hi".into() })
                .await,
            Err(TranslationError::Unavailable)
        ));

        runtime.publish(route("test-a"));
        assert_eq!(service.provider_name().as_deref(), Some("test-a"));
        assert_eq!(
            service
                .translate(TranslationRequest { text: "Hi".into() })
                .await
                .unwrap()
                .provider,
            "test-a"
        );

        runtime.publish(route("test-b"));
        assert_eq!(service.provider_name().as_deref(), Some("test-b"));
        runtime.disable();
        assert_eq!(service.provider_name(), None);
    }

    #[tokio::test]
    async fn in_flight_request_keeps_its_provider_when_route_switches() {
        let runtime = Arc::new(TranslationRuntime::default());
        let service = TranslationService::new(Arc::clone(&runtime));
        let entered = Arc::new(Notify::new());
        let release = Arc::new(Notify::new());
        runtime.publish(controlled_route(
            "test-a",
            Arc::clone(&entered),
            Arc::clone(&release),
        ));

        let in_flight = tokio::spawn({
            let service = service.clone();
            async move {
                service
                    .translate(TranslationRequest { text: "Hi".into() })
                    .await
            }
        });
        entered.notified().await;
        runtime.publish(route("test-b"));

        assert_eq!(
            service
                .translate(TranslationRequest { text: "Hi".into() })
                .await
                .unwrap()
                .provider,
            "test-b"
        );
        release.notify_one();
        assert_eq!(in_flight.await.unwrap().unwrap().provider, "test-a");
    }

    #[tokio::test]
    async fn disabling_does_not_cancel_an_in_flight_request() {
        let runtime = Arc::new(TranslationRuntime::default());
        let service = TranslationService::new(Arc::clone(&runtime));
        let entered = Arc::new(Notify::new());
        let release = Arc::new(Notify::new());
        runtime.publish(controlled_route(
            "test-a",
            Arc::clone(&entered),
            Arc::clone(&release),
        ));

        let in_flight = tokio::spawn({
            let service = service.clone();
            async move {
                service
                    .translate(TranslationRequest { text: "Hi".into() })
                    .await
            }
        });
        entered.notified().await;
        runtime.disable();
        assert!(matches!(
            service
                .translate(TranslationRequest { text: "Hi".into() })
                .await,
            Err(TranslationError::Unavailable)
        ));

        release.notify_one();
        assert_eq!(in_flight.await.unwrap().unwrap().provider, "test-a");
    }

    #[tokio::test]
    async fn provider_failure_reports_the_provider_from_the_request_snapshot() {
        struct FailingProvider {
            id: ProviderId,
        }

        impl TranslationProvider for FailingProvider {
            fn id(&self) -> &ProviderId {
                &self.id
            }

            fn translate<'a>(
                &'a self,
                _request: &'a TranslationRequest,
            ) -> BoxFuture<'a, Result<Translation, TranslationError>> {
                Box::pin(async { Err(TranslationError::ProviderRequest) })
            }
        }

        let runtime = Arc::new(TranslationRuntime::default());
        let service = TranslationService::new(Arc::clone(&runtime));
        let id = ProviderId::new("test-a").unwrap();
        runtime.publish(TranslationRoute {
            primary: ActiveTranslationProvider {
                id: id.clone(),
                provider: Arc::new(FailingProvider { id }),
            },
            fallbacks: Vec::new(),
        });

        let failure = service
            .translate_with_context(TranslationRequest { text: "Hi".into() })
            .await
            .unwrap_err();
        assert_eq!(failure.provider.unwrap().as_str(), "test-a");
    }

    #[test]
    fn validates_translation_text_boundaries() {
        assert!(matches!(
            validate_request(&TranslationRequest { text: " ".into() }),
            Err(TranslationError::InvalidRequest(_))
        ));
        assert!(validate_request(&TranslationRequest {
            text: "Hello".into()
        })
        .is_ok());
        assert!(matches!(
            validate_request(&TranslationRequest {
                text: "x".repeat(5_001)
            }),
            Err(TranslationError::InvalidRequest(_))
        ));
    }
}
