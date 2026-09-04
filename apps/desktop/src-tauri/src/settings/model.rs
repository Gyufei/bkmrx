use serde::{Deserialize, Serialize};

use crate::providers::ProviderId;

pub const SETTINGS_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct Settings {
    #[serde(default = "legacy_schema_version")]
    pub schema_version: u32,
    pub common: CommonSettings,
    pub capabilities: CapabilitySettings,
    pub providers: ProviderSettings,
    pub services: ServiceSettings,
}

fn legacy_schema_version() -> u32 {
    0
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            common: CommonSettings::default(),
            capabilities: CapabilitySettings::default(),
            providers: ProviderSettings::default(),
            services: ServiceSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct CapabilitySettings {
    pub translation: ProviderRouteSettings,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct ProviderRouteSettings {
    pub primary_provider: Option<ProviderId>,
    pub fallback_providers: Vec<ProviderId>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct CommonSettings {
    pub paths: PathSettings,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct PathSettings {
    pub bookmark_export_dir: Option<String>,
    pub todo_export_dir: Option<String>,
    pub notes_dir: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct ServiceSettings {
    pub rsshub: RssHubSettings,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct ProviderSettings {
    pub niutrans: NiuTransSettings,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct RssHubSettings {
    pub base_url: Option<String>,
    pub access_key: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct NiuTransSettings {
    pub app_id: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SystemInfo {
    pub app_data_dir: String,
    pub sqlite_db_path: String,
    pub schema_version: i64,
    pub search_backend: String,
    pub app_version: String,
}
