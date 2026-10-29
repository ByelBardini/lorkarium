use std::sync::atomic::{AtomicU32, Ordering};

use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::window::Color;
use tauri::{AppHandle, Runtime, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use url::Url;

use crate::main_window::{navigation_guard, send_new_window_elsewhere};
use crate::navigation::{new_window_decision, Navigation, ShellOrigins};

pub const CHAT_WINDOW_TITLE: &str = "Chat · Lorkarium";
const CHAT_WINDOW_LABEL_PREFIX: &str = "chat-";
// The size the client asks for; `window.open` features (when sent) win over it.
const CHAT_WINDOW_SIZE: (f64, f64) = (420.0, 720.0);
const CHAT_WINDOW_MIN_SIZE: (f64, f64) = (320.0, 400.0);
// Same as `backgroundColor` of the main window in tauri.conf.json: no white flash before the portal draws.
const CHAT_WINDOW_BACKGROUND: Color = Color(0x10, 0x12, 0x16, 0xff);

// A label per window: a second chat (another table, or the first one still closing) never collides.
static NEXT_CHAT_WINDOW: AtomicU32 = AtomicU32::new(1);

/// The Tauri label of the n-th chat window opened in this run.
///
/// Example: `chat_window_label(1) // "chat-1"`
pub fn chat_window_label(sequence: u32) -> String {
    format!("{CHAT_WINDOW_LABEL_PREFIX}{sequence}")
}

/// Answers the WebView2's `window.open` of the chat page with a native window of the same environment, so the
/// page keeps `window.opener` and the client's React portal draws the chat into it.
///
/// Example: `Navigation::ChatWindow => chat_window::open(&app, features, origins.clone())`
pub fn open<R: Runtime>(
    app: &AppHandle<R>,
    features: NewWindowFeatures,
    origins: ShellOrigins,
) -> NewWindowResponse<R> {
    match build(app, features, origins) {
        Ok(window) => NewWindowResponse::Create { window },
        Err(problem) => {
            eprintln!("janela do chat não abriu: {problem}");
            NewWindowResponse::Deny
        }
    }
}

// The opener draws the title bar and invokes the narrowly scoped auxiliary controls.
fn build<R: Runtime>(
    app: &AppHandle<R>,
    features: NewWindowFeatures,
    origins: ShellOrigins,
) -> tauri::Result<WebviewWindow<R>> {
    let label = chat_window_label(NEXT_CHAT_WINDOW.fetch_add(1, Ordering::Relaxed));
    // about:blank is not loaded by the runtime: WebView2 navigates the new window to the requested page itself.
    let blank = WebviewUrl::External(Url::parse("about:blank").expect("URL fixa about:blank"));
    let marker = format!(
        "Object.defineProperty(window, '__LORKARIUM_CHAT_WINDOW_LABEL__', {{ value: {label:?} }}); Object.defineProperty(window, '__LORKARIUM_DETACHED_TITLE_BAR__', {{ value: true }});"
    );
    let window = WebviewWindowBuilder::new(app, label, blank)
        .title(CHAT_WINDOW_TITLE)
        .decorations(false)
        .inner_size(CHAT_WINDOW_SIZE.0, CHAT_WINDOW_SIZE.1)
        .min_inner_size(CHAT_WINDOW_MIN_SIZE.0, CHAT_WINDOW_MIN_SIZE.1)
        .theme(Some(Theme::Dark))
        .background_color(CHAT_WINDOW_BACKGROUND)
        .disable_drag_drop_handler()
        .zoom_hotkeys_enabled(false)
        .window_features(features)
        .initialization_script(marker)
        .on_navigation(navigation_guard(app.clone(), origins.clone()))
        .on_new_window(nested_window_guard(app.clone(), origins.clone()))
        .build()?;
    harden(&window, &origins);
    Ok(window)
}

// A chat page asked from inside the chat window would be a window with no React behind it: blocked.
fn nested_window_guard<R: Runtime>(
    app: AppHandle<R>,
    origins: ShellOrigins,
) -> impl Fn(Url, NewWindowFeatures) -> NewWindowResponse<R> + Send + 'static {
    move |url, _features| match new_window_decision(&url, &origins) {
        Navigation::ChatWindow => send_new_window_elsewhere(&app, &url, Navigation::Block),
        decision => send_new_window_elsewhere(&app, &url, decision),
    }
}

// F5 would reload the empty page and drop the portal; the browser menu and shortcuts go like in the main window.
#[cfg(windows)]
fn harden<R: Runtime>(window: &WebviewWindow<R>, origins: &ShellOrigins) {
    let hardened =
        crate::webview2::harden_chat(window, origins.app.clone(), env!("CARGO_PKG_VERSION"));
    if let Err(problem) = hardened {
        eprintln!("ajuste do WebView2 do chat falhou: {problem}");
    }
}

#[cfg(not(windows))]
fn harden<R: Runtime>(_window: &WebviewWindow<R>, _origins: &ShellOrigins) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_window_label_carries_the_sequence() {
        assert_eq!(chat_window_label(1), "chat-1");
        assert_eq!(chat_window_label(12), "chat-12");
    }

    #[test]
    fn chat_window_label_is_never_the_main_window() {
        assert_ne!(chat_window_label(0), crate::main_window::MAIN_WINDOW);
    }
}
