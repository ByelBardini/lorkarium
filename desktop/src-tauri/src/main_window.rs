use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::app_origin::AppOrigin;
use crate::navigation::{navigation_decision, new_window_decision, Navigation, ShellOrigins};

pub const MAIN_WINDOW: &str = "main";
// Where Tauri serves the packaged splash on Windows (the default, non-https scheme).
const PACKAGED_SPLASH: &str = "http://tauri.localhost/";

/// The two places the window may show, the splash depending on dev or packaged build.
///
/// Example: `let origins = main_window::shell_origins(app.handle(), app_origin)`
pub fn shell_origins<R: Runtime>(app: &AppHandle<R>, app_origin: AppOrigin) -> ShellOrigins {
    ShellOrigins {
        app: app_origin,
        splash: splash_url(app),
    }
}

/// Opens the one window of the app, from `tauri.conf.json` (`create: false`), held to the lorkarium origin.
///
/// Example: `main_window::create(app.handle(), origins.clone())?`
pub fn create<R: Runtime>(
    app: &AppHandle<R>,
    origins: ShellOrigins,
) -> tauri::Result<WebviewWindow<R>> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW)
        .cloned()
        .expect("tauri.conf.json sem a janela \"main\"");
    let on_navigation = navigation_guard(app.clone(), origins.clone());
    let on_new_window = new_window_guard(app.clone(), origins);
    let window = WebviewWindowBuilder::from_config(app, &config)?
        .on_navigation(on_navigation)
        .on_new_window(move |url, _features| {
            on_new_window(&url);
            NewWindowResponse::Deny
        })
        .build()?;
    hide_on_close(&window);
    Ok(window)
}

// The X only hides the window into the tray; the table stays connected. "Sair" in the tray ends the app.
fn hide_on_close<R: Runtime>(window: &WebviewWindow<R>) {
    let hidden = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = hidden.hide();
        }
    });
}

/// Brings the window back, hidden in the tray or not: the second launch (single-instance plugin) and the tray.
///
/// Example: `tauri_plugin_single_instance::init(|app, _, _| main_window::focus(app))`
pub fn focus<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

fn splash_url<R: Runtime>(app: &AppHandle<R>) -> Url {
    match (tauri::is_dev(), &app.config().build.dev_url) {
        (true, Some(dev_url)) => dev_url.clone(),
        _ => Url::parse(PACKAGED_SPLASH).expect("URL fixa da splash"),
    }
}

fn navigation_guard<R: Runtime>(
    app: AppHandle<R>,
    origins: ShellOrigins,
) -> impl Fn(&Url) -> bool + Send + 'static {
    move |url| match navigation_decision(url, &origins) {
        Navigation::Stay => true,
        Navigation::OpenExternal => {
            open_in_browser(&app, url);
            false
        }
        Navigation::Block => {
            eprintln!("navegação bloqueada: {url}");
            false
        }
    }
}

fn new_window_guard<R: Runtime>(
    app: AppHandle<R>,
    origins: ShellOrigins,
) -> impl Fn(&Url) + Send + 'static {
    move |url| match new_window_decision(url, &origins) {
        Navigation::OpenExternal => open_in_browser(&app, url),
        _ => eprintln!("nova janela bloqueada: {url}"),
    }
}

fn open_in_browser<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    if let Err(problem) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("não abriu {url} no navegador: {problem}");
    }
}
