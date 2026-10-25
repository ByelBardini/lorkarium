use url::Url;

use crate::app_origin::AppOrigin;

const USER_AGENT_PRODUCT: &str = "LorkariumDesktop";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionDecision {
    Allow,
    Default,
}

/// The WebView2 user agent with the app's product appended, never replaced.
///
/// Example: `desktop_user_agent("Mozilla/5.0 … Edg/141.0", "0.1.0") // "… Edg/141.0 LorkariumDesktop/0.1.0"`
pub fn desktop_user_agent(base: &str, version: &str) -> String {
    if base.contains(&format!(" {USER_AGENT_PRODUCT}/")) {
        return base.to_owned();
    }
    format!("{base} {USER_AGENT_PRODUCT}/{version}")
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
/// and the clipboard readable by the app's own text-field menu without the browser's prompt.
///
/// Example: `webview2::harden(&window, app_origin.clone(), env!("CARGO_PKG_VERSION"))`
#[cfg(windows)]
pub fn harden<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    app: AppOrigin,
    version: &'static str,
) -> tauri::Result<()> {
    window.with_webview(move |platform| {
        // SAFETY: the controller is alive for the whole closure; WebView2 calls must run on this UI thread.
        if let Err(problem) = unsafe { com::harden(&platform.controller(), app, version) } {
            eprintln!("ajuste do WebView2 falhou: {problem}");
        }
    })
}

#[cfg(windows)]
mod com {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2Controller, ICoreWebView2Settings2, ICoreWebView2Settings3,
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;
    use windows::core::{Interface, HSTRING, PWSTR};

    use super::{clipboard_read_permission, desktop_user_agent, PermissionDecision};
    use crate::app_origin::AppOrigin;

    pub unsafe fn harden(
        controller: &ICoreWebView2Controller,
        app: AppOrigin,
        version: &str,
    ) -> windows::core::Result<()> {
        let webview = controller.CoreWebView2()?;
        disable_browser_chrome(&webview, version)?;
        allow_clipboard_read_for(&webview, app)
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
    fn product_is_appended_to_the_webview_user_agent() {
        assert_eq!(
            desktop_user_agent(EDGE_UA, "0.1.0"),
            format!("{EDGE_UA} LorkariumDesktop/0.1.0")
        );
    }

    #[test]
    fn product_is_not_appended_twice() {
        let once = format!("{EDGE_UA} LorkariumDesktop/0.1.0");
        assert_eq!(desktop_user_agent(&once, "0.1.0"), once);
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
