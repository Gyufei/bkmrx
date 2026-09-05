use std::{
    collections::BTreeMap,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};

use crate::{
    logging::{sanitize_error, sanitize_url, Operation},
    providers::{Capability, ProviderContext, ProviderDescriptor, ProviderId},
    settings::ProviderSettings,
};

use super::super::{
    ProviderError, Translation, TranslationError, TranslationProvider, TranslationProviderFactory,
    TranslationRequest,
};

const NIUTRANS_API_URL: &str = "https://api.niutrans.com/v2/text/translate";

pub struct NiuTransProviderFactory;

impl TranslationProviderFactory for NiuTransProviderFactory {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: ProviderId::new("niutrans").expect("static provider ID must be valid"),
            capability: Capability::Translation,
            display_name: "小牛翻译",
            description: "小牛机器翻译服务",
        }
    }

    fn is_configured(&self, settings: &ProviderSettings) -> bool {
        settings
            .niutrans
            .app_id
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
            && settings
                .niutrans
                .api_key
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
    }

    fn build(
        &self,
        settings: &ProviderSettings,
        context: &ProviderContext,
    ) -> Result<Arc<dyn TranslationProvider>, ProviderError> {
        let provider_id = self.descriptor().id;
        let api_key = settings
            .niutrans
            .api_key
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                ProviderError::invalid_configuration(
                    provider_id.clone(),
                    "NiuTrans API key is required",
                )
            })?;
        let app_id = settings
            .niutrans
            .app_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                ProviderError::invalid_configuration(
                    provider_id.clone(),
                    "NiuTrans app ID is required",
                )
            })?;
        Ok(Arc::new(NiuTransProvider {
            id: provider_id,
            client: context.http_client.clone(),
            api_key: api_key.to_owned(),
            app_id: app_id.to_owned(),
        }))
    }
}

struct NiuTransProvider {
    id: ProviderId,
    client: reqwest::Client,
    api_key: String,
    app_id: String,
}

impl NiuTransProvider {
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
    fn id(&self) -> &ProviderId {
        &self.id
    }

    fn translate<'a>(
        &'a self,
        request: &'a TranslationRequest,
    ) -> BoxFuture<'a, Result<Translation, TranslationError>> {
        Box::pin(async move {
            let operation = Operation::start();
            log::debug!(
                "outbound_request_started operation_id={} kind=translation provider={} method=POST url={:?}",
                operation.id(), self.id, sanitize_url(NIUTRANS_API_URL)
            );
            let payload = self.signed_request(&request.text)?;
            let response = self.client.post(NIUTRANS_API_URL).json(&payload).send().await
                .map_err(|error| {
                    log::warn!(
                        "outbound_request_failed operation_id={} kind=translation provider={} error_code=request_failed elapsed_ms={} error={:?}",
                        operation.id(), self.id, operation.elapsed_ms(), sanitize_error(&error.to_string())
                    );
                    TranslationError::ProviderRequest
                })?;
            let status = response.status();
            log::info!(
                "outbound_request_completed operation_id={} kind=translation provider={} status={} elapsed_ms={}",
                operation.id(), self.id, status.as_u16(), operation.elapsed_ms()
            );
            if !status.is_success() {
                return Err(TranslationError::ProviderRequest);
            }
            let body = response
                .json::<NiuTransResponse>()
                .await
                .map_err(|_| TranslationError::InvalidResponse)?;
            if body.error_code.is_some() {
                return Err(TranslationError::ProviderRejected);
            }
            Ok(Translation {
                text: body.tgt_text.ok_or(TranslationError::InvalidResponse)?,
                source_language: body.from.ok_or(TranslationError::InvalidResponse)?,
                provider: self.id.to_string(),
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

#[cfg(test)]
mod configuration_tests {
    use crate::{
        settings::{NiuTransSettings, ProviderSettings},
        translation::{providers::NiuTransProviderFactory, TranslationProviderFactory},
    };

    #[test]
    fn configuration_requires_non_blank_app_id_and_api_key() {
        let factory = NiuTransProviderFactory;
        for niutrans in [
            NiuTransSettings::default(),
            NiuTransSettings {
                app_id: Some("app".into()),
                api_key: None,
            },
            NiuTransSettings {
                app_id: Some("  ".into()),
                api_key: Some("key".into()),
            },
            NiuTransSettings {
                app_id: Some("app".into()),
                api_key: Some("\t".into()),
            },
        ] {
            assert!(!factory.is_configured(&ProviderSettings { niutrans }));
        }

        assert!(factory.is_configured(&ProviderSettings {
            niutrans: NiuTransSettings {
                app_id: Some(" app ".into()),
                api_key: Some(" key ".into()),
            },
        }));
    }
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
    use super::sign;

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
}
