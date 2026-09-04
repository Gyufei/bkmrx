use serde::{Deserialize, Serialize};

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
