use serde::{Deserialize, Serialize};

mod manager;

pub use manager::{
    PreparedProviderRoutes, ProviderActivation, ProviderManager, ProviderStatusView,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(transparent)]
pub struct ProviderId(String);

impl ProviderId {
    pub fn new(value: impl Into<String>) -> Result<Self, ProviderIdError> {
        let value = value.into();
        let valid = (1..=64).contains(&value.len())
            && value
                .bytes()
                .next()
                .is_some_and(|first| first.is_ascii_lowercase())
            && value
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
        if !valid {
            return Err(ProviderIdError);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for ProviderId {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for ProviderId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::new(value).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, thiserror::Error)]
#[error("Provider ID is invalid")]
pub struct ProviderIdError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    Translation,
    Ai,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProviderDescriptor {
    pub id: ProviderId,
    pub capability: Capability,
    pub display_name: &'static str,
    pub description: &'static str,
}

#[derive(Clone)]
pub struct ProviderContext {
    pub http_client: reqwest::Client,
}

impl ProviderContext {
    pub fn new(http_client: reqwest::Client) -> Self {
        Self { http_client }
    }
}

#[cfg(test)]
mod tests {
    use super::ProviderId;

    #[test]
    fn validates_provider_ids() {
        for valid in ["niutrans", "openai", "provider-2"] {
            assert!(ProviderId::new(valid).is_ok());
        }
        for invalid in ["", "NiuTrans", " provider", "1provider", "provider_name"] {
            assert!(ProviderId::new(invalid).is_err());
        }
    }

    #[test]
    fn rejects_invalid_provider_ids_during_deserialization() {
        assert!(serde_json::from_str::<ProviderId>(r#""NiuTrans""#).is_err());
    }
}
