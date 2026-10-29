use url::Url;

use crate::app_origin::AppOrigin;
#[cfg(windows)]
use crate::navigation::ShellOrigins;
#[cfg(windows)]
use crate::startup::StartupEvent;

const USER_AGENT_PRODUCT: &str = "LorkariumDesktop";
// The client draws its own title bar only when it sees this mark (desktop-shell.ts); an older shell lacks it.
const TITLE_BAR_MARK: &str = "LorkariumTitleBar/1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionDecision {
    Allow,
    Default,
}

/// The WebView2 user agent with the app's product and title-bar mark appended, never replaced.
///
/// Example: `desktop_user_agent("Mozilla/5.0 … Edg/141.0", "0.1.0") // "… Edg/141.0 LorkariumDesktop/0.1.0 LorkariumTitleBar/1"`
pub fn desktop_user_agent(base: &str, version: &str) -> String {
    let mut agent = base.to_owned();
    if !agent.contains(&format!(" {USER_AGENT_PRODUCT}/")) {
        agent.push_str(&format!(" {USER_AGENT_PRODUCT}/{version}"));
    }
    if !agent.contains(&format!(" {TITLE_BAR_MARK}")) {
        agent.push_str(&format!(" {TITLE_BAR_MARK}"));
    }
    agent
}

/// Whether a page may read the clipboard without the browser's prompt: only the app's own origin.
///
/// Example: `clipboard_read_permission("https://lorkarium.app/campaigns/1", &origin) // Allow`
pub fn clipboard_read_permission(uri: &str, app: &AppOrigin) -> PermissionDecision {
    match Url::parse(uri) {
        Ok(url) if app.contains(&url) => PermissionDecision::Allow,
        _ => PermissionDecision::Default,
    }
}

/// Turns the WebView2 of the main window into an app: no browser menu or shortcuts, the app's user agent,
/// the clipboard readable by the app's own text-field menu without the browser's prompt, and a failed load
/// of the site handed to `send_back` (the window would be left on a page without a title bar).
///
/// Example: `webview2::harden(&window, origins, env!("CARGO_PKG_VERSION"), send_back)`
#[cfg(windows)]
pub fn harden<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    origins: ShellOrigins,
    version: &'static str,
    send_back: impl Fn(StartupEvent) + Send + 'static,
) -> tauri::Result<()> {
    window.with_webview(move |platform| {
        // SAFETY: the controller is alive for the whole closure; WebView2 calls must run on this UI thread.
        if let Err(problem) =
            unsafe { com::harden(&platform.controller(), origins, version, send_back) }
        {
            eprintln!("ajuste do WebView2 falhou: {problem}");
        }
    })
}

/// The chat window gets the main window's app look (no browser menu or shortcuts, same user agent, clipboard for
/// the app); it has no load-failure return, since it never shows the splash.
///
/// Example: `webview2::harden_chat(&window, origins.app.clone(), env!("CARGO_PKG_VERSION"))`
#[cfg(windows)]
pub fn harden_chat<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    app: AppOrigin,
    version: &'static str,
) -> tauri::Result<()> {
    window.with_webview(move |platform| {
        // SAFETY: the controller is alive for the whole closure; WebView2 calls must run on this UI thread.
        if let Err(problem) = unsafe { com::harden_chat(&platform.controller(), app, version) } {
            eprintln!("ajuste do WebView2 do chat falhou: {problem}");
        }
    })
}

#[cfg(windows)]
mod com {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2Controller, ICoreWebView2NavigationCompletedEventArgs,
        ICoreWebView2NavigationCompletedEventArgs2, ICoreWebView2Settings2, ICoreWebView2Settings3,
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW, COREWEBVIEW2_WEB_ERROR_STATUS,
        COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED,
    };
    use webview2_com::{NavigationCompletedEventHandler, PermissionRequestedEventHandler};
    use windows::core::{Interface, BOOL, HSTRING, PWSTR};

    use super::{clipboard_read_permission, desktop_user_agent, PermissionDecision};
    use crate::app_origin::AppOrigin;
    use crate::load_failure::{load_failure_of, CompletedLoad};
    use crate::navigation::ShellOrigins;
    use crate::startup::StartupEvent;

    pub unsafe fn harden(
        controller: &ICoreWebView2Controller,
        origins: ShellOrigins,
        version: &str,
        send_back: impl Fn(StartupEvent) + 'static,
    ) -> windows::core::Result<()> {
        let webview = controller.CoreWebView2()?;
        disable_browser_chrome(&webview, version)?;
        allow_clipboard_read_for(&webview, origins.app.clone())?;
        send_back_on_load_failure(&webview, origins, send_back)
    }

    pub unsafe fn harden_chat(
        controller: &ICoreWebView2Controller,
        app: AppOrigin,
        version: &str,
    ) -> windows::core::Result<()> {
        let webview = controller.CoreWebView2()?;
        disable_browser_chrome(&webview, version)?;
        allow_clipboard_read_for(&webview, app)
    }

    // A failed load of the site would leave the window on WebView2's error page, with no title bar to drag.
    unsafe fn send_back_on_load_failure(
        webview: &ICoreWebView2,
        origins: ShellOrigins,
        send_back: impl Fn(StartupEvent) + 'static,
    ) -> windows::core::Result<()> {
        let mut token = 0;
        let handler = NavigationCompletedEventHandler::create(Box::new(move |sender, args| {
            let (Some(sender), Some(args)) = (sender, args) else {
                return Ok(());
            };
            let uri = source_of(&sender)?;
            if let Some(event) = load_failure_of(&completed_load(&args, &uri)?, &origins) {
                send_back(event);
            }
            Ok(())
        }));
        webview.add_NavigationCompleted(&handler, &mut token)
    }

    unsafe fn source_of(webview: &ICoreWebView2) -> windows::core::Result<String> {
        let mut uri = PWSTR::null();
        webview.Source(&mut uri)?;
        Ok(webview2_com::take_pwstr(uri))
    }

    unsafe fn completed_load<'a>(
        args: &ICoreWebView2NavigationCompletedEventArgs,
        uri: &'a str,
    ) -> windows::core::Result<CompletedLoad<'a>> {
        let mut success = BOOL::default();
        args.IsSuccess(&mut success)?;
        let mut error = COREWEBVIEW2_WEB_ERROR_STATUS::default();
        args.WebErrorStatus(&mut error)?;
        let mut http_status = 0;
        if let Ok(args2) = args.cast::<ICoreWebView2NavigationCompletedEventArgs2>() {
            args2.HttpStatusCode(&mut http_status)?;
        }
        Ok(CompletedLoad {
            uri,
            success: success.as_bool(),
            canceled: error == COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED,
            http_status,
        })
    }

    // Edit shortcuts (Ctrl+C/V/X/Z/A) are not browser accelerators: they keep working on purpose.
    unsafe fn disable_browser_chrome(
        webview: &ICoreWebView2,
        version: &str,
    ) -> windows::core::Result<()> {
        let settings = webview.Settings()?;
        settings.SetAreDefaultContextMenusEnabled(false)?;
        settings
            .cast::<ICoreWebView2Settings3>()?
            .SetAreBrowserAcceleratorKeysEnabled(false)?;
        let settings2 = settings.cast::<ICoreWebView2Settings2>()?;
        let mut base = PWSTR::null();
        settings2.UserAgent(&mut base)?;
        let user_agent = desktop_user_agent(&webview2_com::take_pwstr(base), version);
        settings2.SetUserAgent(&HSTRING::from(user_agent))
    }

    unsafe fn allow_clipboard_read_for(
        webview: &ICoreWebView2,
        app: AppOrigin,
    ) -> windows::core::Result<()> {
        let mut token = 0;
        let handler = PermissionRequestedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
            args.PermissionKind(&mut kind)?;
            if kind != COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ {
                return Ok(());
            }
            let mut uri = PWSTR::null();
            args.Uri(&mut uri)?;
            if clipboard_read_permission(&webview2_com::take_pwstr(uri), &app)
                == PermissionDecision::Allow
            {
                args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
            }
            Ok(())
        }));
        webview.add_PermissionRequested(&handler, &mut token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_origin::BuildProfile;

    const EDGE_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

    fn app() -> AppOrigin {
        AppOrigin::parse("https://lorkarium.app", BuildProfile::Release).unwrap()
    }

    #[test]
    fn product_and_title_bar_mark_are_appended_to_the_webview_user_agent() {
        assert_eq!(
            desktop_user_agent(EDGE_UA, "0.1.0"),
            format!("{EDGE_UA} LorkariumDesktop/0.1.0 LorkariumTitleBar/1")
        );
    }

    #[test]
    fn product_and_mark_are_not_appended_twice() {
        let once = format!("{EDGE_UA} LorkariumDesktop/0.1.0 LorkariumTitleBar/1");
        assert_eq!(desktop_user_agent(&once, "0.1.0"), once);
    }

    #[test]
    fn user_agent_of_an_older_shell_gains_only_the_mark() {
        let older = format!("{EDGE_UA} LorkariumDesktop/0.1.0");
        assert_eq!(
            desktop_user_agent(&older, "0.2.0"),
            format!("{older} LorkariumTitleBar/1")
        );
    }

    #[test]
    fn app_page_may_read_the_clipboard() {
        assert_eq!(
            clipboard_read_permission("https://lorkarium.app/campaigns/1", &app()),
            PermissionDecision::Allow
        );
    }

    #[test]
    fn another_site_keeps_the_default_prompt() {
        assert_eq!(
            clipboard_read_permission("https://evil.com/", &app()),
            PermissionDecision::Default
        );
    }

    #[test]
    fn the_splash_keeps_the_default_prompt() {
        assert_eq!(
            clipboard_read_permission("http://tauri.localhost/", &app()),
            PermissionDecision::Default
        );
    }

    #[test]
    fn unreadable_uri_keeps_the_default_prompt() {
        assert_eq!(
            clipboard_read_permission("", &app()),
            PermissionDecision::Default
        );
    }
}
