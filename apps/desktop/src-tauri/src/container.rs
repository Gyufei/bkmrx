use std::sync::OnceLock;
use bkmr_lib::infrastructure::di::ServiceContainer;
use bkmr_lib::config::Settings;

static CONTAINER: OnceLock<ServiceContainer> = OnceLock::new();

pub fn init(config_path: Option<&std::path::Path>) -> Result<(), String> {
    let settings = match config_path.filter(|p| p.exists()) {
        Some(path) => bkmr_lib::config::load_settings(Some(path))
            .map_err(|e| format!("加载配置失败: {e}"))?,
        None => {
            let db_path = dirs::home_dir()
                .map(|h| h.join(".config/bkmr/bkmr.db"))
                .unwrap_or_else(|| std::path::PathBuf::from("bkmr.db"));
            Settings {
                db_url: db_path.to_string_lossy().to_string(),
                ..Default::default()
            }
        }
    };
    let container = ServiceContainer::new(&settings)
        .map_err(|e| format!("初始化服务失败: {e}"))?;
    CONTAINER.set(container).map_err(|_| "Container already initialized".to_string())?;
    Ok(())
}

pub fn get() -> &'static ServiceContainer {
    CONTAINER.get().expect("Container not initialized")
}
