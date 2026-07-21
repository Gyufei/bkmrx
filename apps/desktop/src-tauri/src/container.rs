use std::sync::OnceLock;
use bkmr_lib::infrastructure::di::ServiceContainer;
use bkmr_lib::config::Settings;

static CONTAINER: OnceLock<ServiceContainer> = OnceLock::new();
static CONFIG_DB_PATH: OnceLock<String> = OnceLock::new();
static EMBEDDING_AVAILABLE: OnceLock<bool> = OnceLock::new();

pub fn init(config_path: Option<&std::path::Path>) -> Result<(), String> {
    // sqlite-vec 扩展必须在建立任何 SQLite 连接之前注册
    bkmr_lib::infrastructure::repositories::sqlite::register_sqlite_vec();

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
    CONFIG_DB_PATH.set(settings.db_url.clone()).ok();
    let is_embedding_available = container.embedder.dimensions() > 0;
    EMBEDDING_AVAILABLE.set(is_embedding_available).ok();
    CONTAINER.set(container).map_err(|_| "Container already initialized".to_string())?;
    Ok(())
}

pub fn get() -> &'static ServiceContainer {
    CONTAINER.get().expect("Container not initialized")
}

pub fn get_db_path() -> &'static str {
    CONFIG_DB_PATH.get().map(String::as_str).unwrap_or("unknown")
}

pub fn is_embedding_available() -> bool {
    *EMBEDDING_AVAILABLE.get().unwrap_or(&false)
}
