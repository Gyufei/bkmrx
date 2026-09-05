use std::{
    net::SocketAddr,
    sync::{Arc, Mutex, RwLock},
    time::Duration,
};

use axum::Router;
use serde::Serialize;
use tokio::{sync::oneshot, task::JoinHandle};

use crate::logging::{sanitize_error, Operation};

#[derive(Debug, Clone, Copy)]
pub struct HttpServerOptions {
    pub address: SocketAddr,
    pub graceful_shutdown_timeout: Duration,
}

impl Default for HttpServerOptions {
    fn default() -> Self {
        Self {
            address: SocketAddr::from(([127, 0, 0, 1], 8733)),
            graceful_shutdown_timeout: Duration::from_secs(5),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HttpServerPhase {
    Running,
    Failed,
    Stopping,
    Stopped,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub url: String,
    pub phase: HttpServerPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

#[derive(Debug, Clone)]
pub struct HttpStartupWarning {
    pub code: String,
    pub message: String,
}

pub struct HttpServerLaunch {
    pub server: Arc<LocalHttpServer>,
    pub warning: Option<HttpStartupWarning>,
}

pub type SharedLocalHttpServer = Arc<LocalHttpServer>;

pub struct LocalHttpServer {
    state: Arc<RwLock<ServerStatus>>,
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
    task: tokio::sync::Mutex<Option<JoinHandle<()>>>,
    graceful_shutdown_timeout: Duration,
}

impl LocalHttpServer {
    pub async fn launch(options: HttpServerOptions, router: Router) -> HttpServerLaunch {
        let operation = Operation::start();
        log::info!(
            "http_server_start_started operation_id={} address={}",
            operation.id(),
            options.address
        );
        let listener = match tokio::net::TcpListener::bind(options.address).await {
            Ok(listener) => listener,
            Err(error) => {
                let message = sanitize_error(&error.to_string());
                log::error!(
                    "http_server_start_failed operation_id={} address={} elapsed_ms={} error={:?}",
                    operation.id(),
                    options.address,
                    operation.elapsed_ms(),
                    message
                );
                let server = Arc::new(Self::failed(
                    options.address,
                    options.graceful_shutdown_timeout,
                    "http_server_bind_failed",
                ));
                return HttpServerLaunch {
                    server,
                    warning: Some(HttpStartupWarning {
                        code: "http_server_bind_failed".to_owned(),
                        message: "本地 HTTP 接口启动失败，浏览器扩展暂时无法连接。".to_owned(),
                    }),
                };
            }
        };
        let address = listener.local_addr().unwrap_or(options.address);
        let url = format!("http://{address}");
        let state = Arc::new(RwLock::new(ServerStatus {
            running: true,
            url: url.clone(),
            phase: HttpServerPhase::Running,
            error_code: None,
        }));
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let task_state = Arc::clone(&state);
        let task = tokio::spawn(async move {
            let result = axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                })
                .await;
            let mut status = task_state
                .write()
                .unwrap_or_else(|error| error.into_inner());
            status.running = false;
            if let Err(error) = result {
                status.phase = HttpServerPhase::Failed;
                status.error_code = Some("http_server_serve_failed".to_owned());
                log::error!(
                    "http_server_failed error={:?}",
                    sanitize_error(&error.to_string())
                );
            } else {
                status.phase = HttpServerPhase::Stopped;
                log::info!("http_server_stopped");
            }
        });
        log::info!(
            "http_server_started operation_id={} address={} elapsed_ms={}",
            operation.id(),
            address,
            operation.elapsed_ms()
        );
        HttpServerLaunch {
            server: Arc::new(Self {
                state,
                shutdown: Mutex::new(Some(shutdown_tx)),
                task: tokio::sync::Mutex::new(Some(task)),
                graceful_shutdown_timeout: options.graceful_shutdown_timeout,
            }),
            warning: None,
        }
    }

    pub fn status(&self) -> ServerStatus {
        self.state
            .read()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    pub async fn shutdown(&self) -> ServerStatus {
        if let Some(sender) = self
            .shutdown
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take()
        {
            let mut status = self
                .state
                .write()
                .unwrap_or_else(|error| error.into_inner());
            if status.phase == HttpServerPhase::Running {
                status.running = false;
                status.phase = HttpServerPhase::Stopping;
            }
            drop(status);
            let _ = sender.send(());
        }
        let mut task = self.task.lock().await;
        if let Some(mut task) = task.take() {
            if tokio::time::timeout(self.graceful_shutdown_timeout, &mut task)
                .await
                .is_err()
            {
                log::warn!("http_server_shutdown_timed_out");
                task.abort();
                let _ = task.await;
                let mut status = self
                    .state
                    .write()
                    .unwrap_or_else(|error| error.into_inner());
                status.running = false;
                status.phase = HttpServerPhase::Stopped;
            }
        }
        self.status()
    }

    fn failed(address: SocketAddr, graceful_shutdown_timeout: Duration, code: &str) -> Self {
        Self {
            state: Arc::new(RwLock::new(ServerStatus {
                running: false,
                url: format!("http://{address}"),
                phase: HttpServerPhase::Failed,
                error_code: Some(code.to_owned()),
            })),
            shutdown: Mutex::new(None),
            task: tokio::sync::Mutex::new(None),
            graceful_shutdown_timeout,
        }
    }
}

impl Drop for LocalHttpServer {
    fn drop(&mut self) {
        if let Some(sender) = self
            .shutdown
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take()
        {
            let _ = sender.send(());
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc, time::Duration};

    use axum::{routing::get, Router};
    use tokio::sync::Notify;

    use super::{HttpServerOptions, HttpServerPhase, LocalHttpServer};

    fn test_router() -> Router {
        Router::new().route("/health", get(|| async { "ok" }))
    }

    #[tokio::test]
    async fn launch_reports_the_bound_address_only_after_it_is_running() {
        let launched = LocalHttpServer::launch(
            HttpServerOptions {
                address: "127.0.0.1:0".parse().unwrap(),
                ..HttpServerOptions::default()
            },
            test_router(),
        )
        .await;

        assert!(launched.warning.is_none());
        let status = launched.server.status();
        assert!(status.running);
        assert_eq!(status.phase, HttpServerPhase::Running);
        assert_ne!(status.url, "http://127.0.0.1:0");

        launched.server.shutdown().await;
    }

    #[tokio::test]
    async fn occupied_address_is_reported_as_a_failed_launch() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();

        let launched = LocalHttpServer::launch(
            HttpServerOptions {
                address,
                ..HttpServerOptions::default()
            },
            test_router(),
        )
        .await;

        assert_eq!(launched.server.status().phase, HttpServerPhase::Failed);
        assert_eq!(
            launched.server.status().error_code.as_deref(),
            Some("http_server_bind_failed")
        );
        assert!(launched.warning.is_some());
    }

    #[tokio::test]
    async fn shutdown_is_idempotent_and_waits_until_stopped() {
        let launched = LocalHttpServer::launch(
            HttpServerOptions {
                address: "127.0.0.1:0".parse().unwrap(),
                ..HttpServerOptions::default()
            },
            test_router(),
        )
        .await;

        assert_eq!(
            launched.server.shutdown().await.phase,
            HttpServerPhase::Stopped
        );
        assert_eq!(
            launched.server.shutdown().await.phase,
            HttpServerPhase::Stopped
        );
    }

    #[tokio::test]
    async fn shutdown_waits_for_an_in_flight_request() {
        let request_started = Arc::new(Notify::new());
        let release_request = Arc::new(Notify::new());
        let started = Arc::clone(&request_started);
        let release = Arc::clone(&release_request);
        let router = Router::new().route(
            "/slow",
            get(move || {
                let started = Arc::clone(&started);
                let release = Arc::clone(&release);
                async move {
                    started.notify_one();
                    release.notified().await;
                    "done"
                }
            }),
        );
        let launched = LocalHttpServer::launch(
            HttpServerOptions {
                address: "127.0.0.1:0".parse().unwrap(),
                ..HttpServerOptions::default()
            },
            router,
        )
        .await;
        let url = format!("{}/slow", launched.server.status().url);
        let request = tokio::spawn(async move { reqwest::get(url).await.unwrap().text().await });
        request_started.notified().await;
        let server = Arc::clone(&launched.server);
        let mut shutdown = tokio::spawn(async move { server.shutdown().await });

        assert!(
            tokio::time::timeout(Duration::from_millis(20), &mut shutdown)
                .await
                .is_err()
        );
        release_request.notify_one();

        assert_eq!(request.await.unwrap().unwrap(), "done");
        assert_eq!(shutdown.await.unwrap().phase, HttpServerPhase::Stopped);
    }

    #[tokio::test]
    async fn shutdown_aborts_a_request_after_the_grace_period() {
        let request_started = Arc::new(Notify::new());
        let started = Arc::clone(&request_started);
        let router = Router::new().route(
            "/stuck",
            get(move || {
                let started = Arc::clone(&started);
                async move {
                    started.notify_one();
                    std::future::pending::<&'static str>().await
                }
            }),
        );
        let launched = LocalHttpServer::launch(
            HttpServerOptions {
                address: "127.0.0.1:0".parse().unwrap(),
                graceful_shutdown_timeout: Duration::from_millis(20),
            },
            router,
        )
        .await;
        let url = format!("{}/stuck", launched.server.status().url);
        let request = tokio::spawn(async move { reqwest::get(url).await });
        request_started.notified().await;

        let status = tokio::time::timeout(Duration::from_secs(1), launched.server.shutdown())
            .await
            .expect("shutdown must be bounded");

        assert_eq!(status.phase, HttpServerPhase::Stopped);
        request.abort();
    }
}
