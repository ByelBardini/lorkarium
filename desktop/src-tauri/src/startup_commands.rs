use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

use crate::app_origin::AppOrigin;
use crate::main_window::MAIN_WINDOW;
use crate::startup::{
    check_connection, run_startup, HealthProbe, HealthStatus, PendingUpdate, StartupEvent,
    StartupOutcome, UpdateSource,
};

// Same name as STARTUP_EVENT in desktop/src/shell-bridge.ts.
const STARTUP_EVENT: &str = "startup";
// A slow or dead release server must never keep anyone from playing.
const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(8);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(5);

/// What the startup commands share: where to go and whether the opening already ran.
pub struct StartupShell {
    app_origin: AppOrigin,
    health: HttpHealthProbe,
    started: AtomicBool,
}

impl StartupShell {
    /// Example: `app.manage(StartupShell::new(app_origin)?)`
    pub fn new(app_origin: AppOrigin) -> Result<Self, String> {
        let health = HttpHealthProbe::new(&app_origin)?;
        Ok(Self {
            app_origin,
            health,
            started: AtomicBool::new(false),
        })
    }
}

/// Called once by the splash after it listens to `startup`; a reload of the splash never reruns the update.
#[tauri::command]
pub async fn begin_startup<R: Runtime>(
    app: AppHandle<R>,
    shell: State<'_, StartupShell>,
) -> Result<(), String> {
    if shell.started.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let source = UpdaterSource { app: app.clone() };
    let result = run_startup(&source, &shell.health, UPDATE_CHECK_TIMEOUT, &mut |event| {
        emit(&app, event)
    })
    .await;
    if let Some(problem) = result.update_problem {
        eprintln!("atualização pulada: {problem}");
    }
    follow(&app, &shell.app_origin, result.outcome)
}

/// The splash's "Tentar de novo" after `offline` or `server-unavailable`.
#[tauri::command]
pub async fn retry_connection<R: Runtime>(
    app: AppHandle<R>,
    shell: State<'_, StartupShell>,
) -> Result<(), String> {
    let outcome = check_connection(&shell.health, &mut |event| emit(&app, event)).await;
    follow(&app, &shell.app_origin, outcome)
}

fn emit<R: Runtime>(app: &AppHandle<R>, event: StartupEvent) {
    if let Err(problem) = app.emit_to(MAIN_WINDOW, STARTUP_EVENT, &event) {
        eprintln!("evento {event:?} não chegou à splash: {problem}");
    }
}

fn follow<R: Runtime>(
    app: &AppHandle<R>,
    app_origin: &AppOrigin,
    outcome: StartupOutcome,
) -> Result<(), String> {
    match outcome {
        StartupOutcome::Restart => app.restart(),
        StartupOutcome::WaitForRetry => Ok(()),
        StartupOutcome::Navigate => {
            let window = app
                .get_webview_window(MAIN_WINDOW)
                .ok_or_else(|| format!("janela {MAIN_WINDOW:?} não existe"))?;
            window
                .navigate(app_origin.url().clone())
                .map_err(|problem| problem.to_string())
        }
    }
}

struct UpdaterSource<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> UpdateSource for UpdaterSource<R> {
    type Update = UpdaterUpdate;

    async fn check(&self) -> Result<Option<UpdaterUpdate>, String> {
        // `pnpm desktop:dev` has no release to compare against.
        if tauri::is_dev() {
            return Ok(None);
        }
        let updater = self.app.updater().map_err(|problem| problem.to_string())?;
        let found = updater
            .check()
            .await
            .map_err(|problem| problem.to_string())?;
        Ok(found.map(UpdaterUpdate))
    }
}

struct UpdaterUpdate(tauri_plugin_updater::Update);

impl PendingUpdate for UpdaterUpdate {
    async fn download(
        &self,
        mut on_chunk: impl FnMut(u64, Option<u64>) + Send,
    ) -> Result<Vec<u8>, String> {
        self.0
            .download(|chunk, total| on_chunk(chunk as u64, total), || {})
            .await
            .map_err(|problem| problem.to_string())
    }

    fn install(&self, bytes: Vec<u8>) -> Result<(), String> {
        self.0.install(bytes).map_err(|problem| problem.to_string())
    }
}

/// `GET <origin>/api/health` from Rust: a `fetch` from the splash is another origin and could not read the 503.
struct HttpHealthProbe {
    client: reqwest::Client,
    url: Url,
}

impl HttpHealthProbe {
    fn new(app_origin: &AppOrigin) -> Result<Self, String> {
        // reqwest is built without a TLS provider so it shares the updater's ring instead of pulling aws-lc.
        let _ = rustls::crypto::ring::default_provider().install_default();
        let client = reqwest::Client::builder()
            .timeout(HEALTH_TIMEOUT)
            .build()
            .map_err(|problem| format!("cliente HTTP do health falhou: {problem}"))?;
        let url = app_origin.url().join("api/health").map_err(|problem| {
            format!(
                "URL do health inválida a partir de {}: {problem}",
                app_origin.url()
            )
        })?;
        Ok(Self { client, url })
    }
}

impl HealthProbe for HttpHealthProbe {
    async fn probe(&self) -> HealthStatus {
        match self.client.get(self.url.clone()).send().await {
            Ok(response) if response.status().is_success() => HealthStatus::Healthy,
            Ok(_) => HealthStatus::Unavailable,
            Err(_) => HealthStatus::Unreachable,
        }
    }
}
