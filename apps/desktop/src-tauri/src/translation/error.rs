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
