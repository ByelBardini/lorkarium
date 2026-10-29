use tauri::ipc::CapabilityBuilder;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use url::Url;

use crate::app_origin::AppOrigin;
use crate::main_window::MAIN_WINDOW;
use crate::navigation::CHAT_WINDOW_PATH;
use crate::window_controls::remote_url_pattern;

const CHAT_CONTROL_PERMISSION: &str = "allow-set-chat-always-on-top";

#[derive(serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DetachedWindowAction {
    Close,
    Minimize,
    ToggleMaximize,
    IsMaximized,
}

/// Controls only an auxiliary window belonging to the requesting main page.
/// Example: `invoke("control_detached_window", { label: "chat-1", action: "minimize" })`
#[tauri::command]
pub async fn control_detached_window<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    label: String,
    action: DetachedWindowAction,
) -> Result<bool, String> {
    let target = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("auxiliary window {label:?} does not exist"))?;
    let requester_url = window.url().map_err(|problem| problem.to_string())?;
    let target_url = target.url().map_err(|problem| problem.to_string())?;
    if !chat_control_allowed(window.label(), &requester_url, &label, &target_url) {
        return Err(format!(
            "window {label:?} at {target_url} refused; expected the app's auxiliary window"
        ));
    }
    match action {
        DetachedWindowAction::Close => target.close().map(|()| false),
        DetachedWindowAction::Minimize => target.minimize().map(|()| false),
        DetachedWindowAction::ToggleMaximize => target
            .is_maximized()
            .and_then(|maximized| {
                if maximized {
                    target.unmaximize()
                } else {
                    target.maximize()
                }
            })
            .map(|()| false),
        DetachedWindowAction::IsMaximized => target.is_maximized(),
    }
    .map_err(|problem| problem.to_string())
}

/// Only the main page may pin an actual chat window from the same app origin.
///
/// Example: `chat_control_allowed("main", &app_url, "chat-1", &chat_url)`
pub fn chat_control_allowed(
    requester: &str,
    requester_url: &Url,
    target: &str,
    target_url: &Url,
) -> bool {
    let chat_label = target.strip_prefix("chat-").is_some_and(|suffix| {
        !suffix.is_empty() && suffix.bytes().all(|digit| digit.is_ascii_digit())
    });
    requester == MAIN_WINDOW
        && chat_label
        && matches!(requester_url.scheme(), "http" | "https")
        && requester_url.origin() == target_url.origin()
        && target_url.path() == CHAT_WINDOW_PATH
}

/// Changes only the chat window named by the native marker, never the main window.
///
/// Example: `invoke("set_chat_always_on_top", { label: "chat-1", enabled: true })`
#[tauri::command]
pub async fn set_chat_always_on_top<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    label: String,
    enabled: bool,
) -> Result<(), String> {
    let target = app.get_webview_window(&label).ok_or_else(|| {
        format!("chat window {label:?} does not exist; expected an open chat window")
    })?;
    let requester_url = window.url().map_err(|problem| problem.to_string())?;
    let target_url = target.url().map_err(|problem| problem.to_string())?;
    if !chat_control_allowed(window.label(), &requester_url, &label, &target_url) {
        return Err(format!(
            "window {label:?} at {target_url} refused; expected the app's chat window"
        ));
    }
    target
        .set_always_on_top(enabled)
        .map_err(|problem| problem.to_string())
}

/// Gives the remote main page one narrowly checked chat command, without core window setters.
///
/// Example: `chat_window_controls::install(app, &app_origin)?`
pub fn install<R: Runtime>(app: &AppHandle<R>, origin: &AppOrigin) -> tauri::Result<()> {
    app.add_capability(
        CapabilityBuilder::new("chat-window-controls")
            .remote(remote_url_pattern(origin))
            .local(false)
            .window(MAIN_WINDOW)
            .permission(CHAT_CONTROL_PERMISSION)
            .permission("allow-control-detached-window"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(requester: &str, target: &str, raw: &str) -> bool {
        chat_control_allowed(
            requester,
            &Url::parse("https://lorkarium.app/campaigns/1/play").unwrap(),
            target,
            &Url::parse(raw).unwrap(),
        )
    }

    #[test]
    fn main_controls_chat_of_its_own_origin() {
        assert!(allowed(
            "main",
            "chat-12",
            "https://lorkarium.app/chat-window.html"
        ));
    }

    #[test]
    fn main_window_and_arbitrary_labels_cannot_be_pinned() {
        for label in ["main", "chat-", "chat-other", "other-1"] {
            assert!(!allowed(
                "main",
                label,
                "https://lorkarium.app/chat-window.html"
            ));
        }
    }

    #[test]
    fn chat_cannot_control_another_window() {
        assert!(!allowed(
            "chat-1",
            "chat-2",
            "https://lorkarium.app/chat-window.html"
        ));
    }

    #[test]
    fn target_must_be_the_chat_page_on_the_same_origin() {
        for raw in [
            "https://elsewhere.app/chat-window.html",
            "https://lorkarium.app:8443/chat-window.html",
            "http://lorkarium.app/chat-window.html",
            "https://lorkarium.app/campaigns/1",
        ] {
            assert!(
                !allowed("main", "chat-1", raw),
                "target unexpectedly allowed: {raw}"
            );
        }
    }

    #[test]
    fn capability_grants_only_the_checked_chat_command() {
        assert_eq!(CHAT_CONTROL_PERMISSION, "allow-set-chat-always-on-top");
    }

    #[test]
    fn detached_controls_accept_only_the_title_bar_actions() {
        for action in ["close", "minimize", "toggle-maximize", "is-maximized"] {
            assert!(
                serde_json::from_value::<DetachedWindowAction>(serde_json::json!(action)).is_ok()
            );
        }
        for action in ["destroy", "set-always-on-top", "main"] {
            assert!(
                serde_json::from_value::<DetachedWindowAction>(serde_json::json!(action)).is_err()
            );
        }
    }

    #[test]
    fn dice_query_is_an_auxiliary_window_on_the_same_origin() {
        assert!(allowed(
            "main",
            "chat-9",
            "https://lorkarium.app/chat-window.html?panel=dice"
        ));
    }
}
