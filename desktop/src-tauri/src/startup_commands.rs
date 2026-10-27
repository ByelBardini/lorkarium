use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

use crate::app_origin::AppOrigin;
use crate::main_window::MAIN_WINDOW;
use crate::startup::{
    check_connection, run_startup, HealthProbe, HealthStatus, PendingUpdate, StartupBegin,
    StartupEvent, StartupGate, StartupOutcome, UpdateSource,
};

// Same name as STARTUP_EVENT in desktop/src/shell-bridge.ts.
const STARTUP_EVENT: &str = "startup";
// A slow or dead release server must never keep anyone from playing.
const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(8);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(5);

/// What the startup commands share: where to go, whether the opening already ran and what to show
/// when the site sent the window back to the splash.
pub struct StartupShell {
    app_origin: AppOrigin,
    health: HttpHealthProbe,
    gate: StartupGate,
}

impl StartupShell {
    /// Example: `app.manage(StartupShell::new(app_origin)?)`
    pub fn new(app_origin: AppOrigin) -> Result<Self, String> {
        let health = HttpHealthProbe::new(&app_origin)?;
        Ok(Self {
            app_origin,
            health,
            gate: StartupGate::default(),
        })
    }
}

/// Called by the splash after it listens to `startup`: the first time runs the opening; after a failed load
/// of the site it delivers "Sem conexão"/"Em manutenção" once; a plain reload of the splash does nothing.
#[tauri::command]
pub async fn begin_startup<R: Runtime>(
    app: AppHandle<R>,
    shell: State<'_, StartupShell>,
) -> Result<(), String> {
    match shell.gate.begin() {
        StartupBegin::AlreadyStarted => Ok(()),
        StartupBegin::Deliver(event) => {
            emit(&app, event);
            Ok(())
        }
        StartupBegin::Run => run_opening(&app, &shell).await,
    }
}

async fn run_opening<R: Runtime>(app: &AppHandle<R>, shell: &StartupShell) -> Result<(), String> {
    let source = UpdaterSource { app: app.clone() };
    let result = run_startup(&source, &shell.health, UPDATE_CHECK_TIMEOUT, &mut |event| {
        emit(app, event)
    })
    .await;
    if let Some(problem) = result.update_problem {
        eprintln!("atualização pulada: {problem}");
    }
    follow(app, &shell.app_origin, result.outcome)
}

/// What a failed load of the site does: remember the view and take the window back to the splash, which
/// asks for it through `begin_startup`. The navigation leaves the WebView2 event handler first.
///
/// Example: `webview2::harden(&window, origins, version, startup_commands::send_back_to_splash(handle, splash))`
pub fn send_back_to_splash<R: Runtime>(
    app: AppHandle<R>,
    splash: Url,
) -> impl Fn(StartupEvent) + Send + 'static {
    move |event| {
        eprintln!("o site não carregou ({event:?}): de volta à splash");
        app.state::<StartupShell>().gate.send_back(event);
        let app = app.clone();
        let splash = splash.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(problem) = navigate_main(&app, splash) {
                eprintln!("a volta à splash falhou: {problem}");
            }
        });
    }
}

fn navigate_main<R: Runtime>(app: &AppHandle<R>, url: Url) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| format!("janela {MAIN_WINDOW:?} não existe"))?;
    window.navigate(url).map_err(|problem| problem.to_string())
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
        StartupOutcome::Navigate => navigate_main(app, app_origin.url().clone()),
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
