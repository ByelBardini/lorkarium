use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::app_origin::AppOrigin;
use crate::chat_window;
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

/// Only the main window has its size and place remembered: the chat window takes the size `window.open` asks.
///
/// Example: `tauri_plugin_window_state::Builder::default().with_filter(main_window::keeps_window_state)`
pub fn keeps_window_state(label: &str) -> bool {
    label == MAIN_WINDOW
}

/// Opens the main window of the app, from `tauri.conf.json` (`create: false`), held to the lorkarium origin.
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
        .on_new_window(on_new_window)
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

/// The guard of every page of the shell: the app and the splash stay, other sites go to the browser.
///
/// Example: `builder.on_navigation(main_window::navigation_guard(app.clone(), origins.clone()))`
pub fn navigation_guard<R: Runtime>(
    app: AppHandle<R>,
    origins: ShellOrigins,
) -> impl Fn(&Url) -> bool + Send + 'static {
    move |url| match navigation_decision(url, &origins) {
        Navigation::Stay => true,
        Navigation::OpenExternal => {
            open_in_browser(&app, url);
            false
        }
        Navigation::Block | Navigation::ChatWindow => {
            eprintln!("navegação bloqueada: {url}");
            false
        }
    }
}

// The one second window the shell opens is the chat; every other `window.open` is refused here.
fn new_window_guard<R: Runtime>(
    app: AppHandle<R>,
    origins: ShellOrigins,
) -> impl Fn(Url, NewWindowFeatures) -> NewWindowResponse<R> + Send + 'static {
    move |url, features| match new_window_decision(&url, &origins) {
        Navigation::ChatWindow => chat_window::open(&app, features, origins.clone()),
        decision => send_new_window_elsewhere(&app, &url, decision),
    }
}

/// Refuses a `window.open` inside the shell, handing it to the default browser when the decision says so.
///
/// Example: `send_new_window_elsewhere(&app, &url, Navigation::OpenExternal) // NewWindowResponse::Deny`
pub fn send_new_window_elsewhere<R: Runtime>(
    app: &AppHandle<R>,
    url: &Url,
    decision: Navigation,
) -> NewWindowResponse<R> {
    match decision {
        Navigation::OpenExternal => open_in_browser(app, url),
        _ => eprintln!("nova janela bloqueada: {url}"),
    }
    NewWindowResponse::Deny
}

fn open_in_browser<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    if let Err(problem) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("não abriu {url} no navegador: {problem}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_window_keeps_its_size_and_place() {
        assert!(keeps_window_state(MAIN_WINDOW));
    }

    #[test]
    fn chat_window_does_not_keep_its_size_and_place() {
        assert!(!keeps_window_state(&chat_window::chat_window_label(1)));
    }
}
