use std::{
    collections::BTreeMap,
    env,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};

const NIUTRANS_API_URL: &str = "https://api.niutrans.com/v2/text/translate";
const MAX_TEXT_LENGTH: usize = 5_000;

#[derive(Debug, Clone, Deserialize)]
pub struct TranslationRequest {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Translation {
    pub text: String,
    pub source_language: String,
    pub provider: String,
}

#[derive(Debug, thiserror::Error)]
pub enum TranslationError {
    #[error("Translation service is not configured")]
    Unavailable,
    #[error("{0}")]
    InvalidRequest(String),
    #[error("Translation provider request failed")]
    ProviderRequest,
    #[error("Translation provider returned an invalid response")]
    InvalidResponse,
    #[error("Translation provider rejected the request")]
    ProviderRejected,
}

impl TranslationError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Unavailable => "translation_unavailable",
            Self::InvalidRequest(_) => "translation_validation_error",
            Self::ProviderRequest | Self::InvalidResponse | Self::ProviderRejected => {
                "translation_failed"
            }
        }
    }
}

pub trait TranslationProvider: Send + Sync {
    fn name(&self) -> &'static str;

    fn translate<'a>(
        &'a self,
        request: &'a TranslationRequest,
    ) -> BoxFuture<'a, Result<Translation, TranslationError>>;
}

#[derive(Clone)]
pub struct TranslationService {
    provider: Option<Arc<dyn TranslationProvider>>,
}

impl TranslationService {
    pub fn new(provider: Arc<dyn TranslationProvider>) -> Self {
        Self {
            provider: Some(provider),
        }
    }

    pub fn unavailable() -> Self {
        Self { provider: None }
    }

    pub fn from_env() -> Self {
        load_local_env();
        match NiuTransProvider::from_env() {
            Some(provider) => Self::new(Arc::new(provider)),
            None => Self::unavailable(),
        }
    }

    pub async fn translate(
        &self,
        request: TranslationRequest,
    ) -> Result<Translation, TranslationError> {
        validate_request(&request)?;
        let provider = self
            .provider
            .as_ref()
            .ok_or(TranslationError::Unavailable)?;
        provider.translate(&request).await
    }

    pub fn provider_name(&self) -> Option<&'static str> {
        self.provider.as_ref().map(|provider| provider.name())
    }
}

fn load_local_env() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|desktop_dir| desktop_dir.join(".env.local"));
    if let Some(path) = path {
        let _ = dotenvy::from_path(path);
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

struct NiuTransProvider {
    client: reqwest::Client,
    api_key: String,
    app_id: String,
}

impl NiuTransProvider {
    fn from_env() -> Option<Self> {
        let api_key = env::var("NIUTRANS_API_KEY").ok()?.trim().to_owned();
        let app_id = env::var("NIUTRANS_APP_ID").ok()?.trim().to_owned();
        if api_key.is_empty() || app_id.is_empty() {
            return None;
        }
        Some(Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .ok()?,
            api_key,
            app_id,
        })
    }

    fn signed_request<'a>(
        &'a self,
        text: &'a str,
    ) -> Result<NiuTransRequest<'a>, TranslationError> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| TranslationError::ProviderRequest)?
            .as_millis()
            .to_string();
        let auth_str = sign(&self.api_key, &self.app_id, text, &timestamp, "auto", "zh");
        Ok(NiuTransRequest {
            from: "auto",
            to: "zh",
            src_text: text,
            app_id: &self.app_id,
            timestamp,
            auth_str,
        })
    }
}

impl TranslationProvider for NiuTransProvider {
    fn name(&self) -> &'static str {
        "niutrans"
    }

    fn translate<'a>(
        &'a self,
        request: &'a TranslationRequest,
    ) -> BoxFuture<'a, Result<Translation, TranslationError>> {
        Box::pin(async move {
            let payload = self.signed_request(&request.text)?;
            let response = self
                .client
                .post(NIUTRANS_API_URL)
                .json(&payload)
                .send()
                .await
                .map_err(|_| TranslationError::ProviderRequest)?;
            if !response.status().is_success() {
                return Err(TranslationError::ProviderRequest);
            }
            let body = response
                .json::<NiuTransResponse>()
                .await
                .map_err(|_| TranslationError::InvalidResponse)?;
            if body.error_code.is_some() {
                return Err(TranslationError::ProviderRejected);
            }
            let text = body.tgt_text.ok_or(TranslationError::InvalidResponse)?;
            let source_language = body.from.ok_or(TranslationError::InvalidResponse)?;
            Ok(Translation {
                text,
                source_language,
                provider: self.name().to_owned(),
            })
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NiuTransRequest<'a> {
    from: &'static str,
    to: &'static str,
    src_text: &'a str,
    app_id: &'a str,
    timestamp: String,
    auth_str: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NiuTransResponse {
    from: Option<String>,
    tgt_text: Option<String>,
    error_code: Option<String>,
}

fn sign(api_key: &str, app_id: &str, text: &str, timestamp: &str, from: &str, to: &str) -> String {
    let params = BTreeMap::from([
        ("apikey", api_key),
        ("appId", app_id),
        ("from", from),
        ("srcText", text),
        ("timestamp", timestamp),
        ("to", to),
    ]);
    let value = params
        .into_iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&");
    format!("{:x}", md5::compute(value.as_bytes()))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use futures_util::future::BoxFuture;

    use super::{
        sign, validate_request, Translation, TranslationError, TranslationProvider,
        TranslationRequest, TranslationService,
    };

    struct TestProvider;

    impl TranslationProvider for TestProvider {
        fn name(&self) -> &'static str {
            "test"
        }

        fn translate<'a>(
            &'a self,
            _request: &'a TranslationRequest,
        ) -> BoxFuture<'a, Result<Translation, TranslationError>> {
            Box::pin(async {
                Ok(Translation {
                    text: "你好".to_owned(),
                    source_language: "en".to_owned(),
                    provider: "test".to_owned(),
                })
            })
        }
    }

    #[test]
    fn signs_parameters_in_ascii_name_order() {
        assert_eq!(
            sign("key", "app", "Hello", "123", "auto", "zh"),
            format!(
                "{:x}",
                md5::compute(b"apikey=key&appId=app&from=auto&srcText=Hello&timestamp=123&to=zh")
            )
        );
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

    #[tokio::test]
    async fn service_delegates_to_a_replaceable_provider() {
        let service = TranslationService::new(Arc::new(TestProvider));

        assert_eq!(service.provider_name(), Some("test"));
        assert_eq!(
            service
                .translate(TranslationRequest {
                    text: "Hello".to_owned(),
                })
                .await
                .unwrap(),
            Translation {
                text: "你好".to_owned(),
                source_language: "en".to_owned(),
                provider: "test".to_owned(),
            }
        );
    }
}
