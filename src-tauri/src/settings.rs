use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub backup_dir: Option<String>,
    pub notes_dir: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            backup_dir: None,
            notes_dir: None,
        }
    }
}

fn settings_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".bkmr").join("settings.json")
}

pub fn load() -> Settings {
    let path = settings_path();
    if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        Settings::default()
    }
}

pub fn save(settings: &Settings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}
