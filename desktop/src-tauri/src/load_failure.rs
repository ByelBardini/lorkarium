use url::Url;

use crate::navigation::ShellOrigins;
use crate::startup::StartupEvent;

/// A top-level load as WebView2 reports it in `NavigationCompleted`.
#[derive(Debug, Clone, Copy)]
pub struct CompletedLoad<'a> {
    pub uri: &'a str,
    pub success: bool,
    /// `OPERATION_CANCELED`: our own navigation guard said `OpenExternal`/`Block`, the page never left.
    pub canceled: bool,
    /// 0 when no HTTP response arrived (network error).
    pub http_status: i32,
}

/// Which splash view a failed load of the app sends the window back to; `None` keeps the page.
///
/// Example: `load_failure_of(&CompletedLoad { uri: "https://lorkarium.app/", success: false, canceled: false, http_status: 502 }, &origins) // Some(ServerUnavailable)`
pub fn load_failure_of(load: &CompletedLoad<'_>, origins: &ShellOrigins) -> Option<StartupEvent> {
    let url = Url::parse(load.uri).ok()?;
    if load.canceled || !origins.app.contains(&url) {
        return None;
    }
    if load.http_status >= 500 {
        return Some(StartupEvent::ServerUnavailable);
    }
    if load.success || load.http_status > 0 {
        return None;
    }
    Some(StartupEvent::Offline)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_origin::{AppOrigin, BuildProfile};

    const APP_PAGE: &str = "https://lorkarium.app/campaigns/1";

    fn origins() -> ShellOrigins {
        ShellOrigins {
            app: AppOrigin::parse("https://lorkarium.app", BuildProfile::Release).unwrap(),
            splash: Url::parse("http://tauri.localhost/").unwrap(),
        }
    }

    fn failed(uri: &str) -> CompletedLoad<'_> {
        CompletedLoad {
            uri,
            success: false,
            canceled: false,
            http_status: 0,
        }
    }

    fn answered(status: i32) -> CompletedLoad<'static> {
        CompletedLoad {
            uri: APP_PAGE,
            success: status < 400,
            canceled: false,
            http_status: status,
        }
    }

    #[test]
    fn network_error_on_the_app_goes_back_offline() {
        assert_eq!(
            load_failure_of(&failed(APP_PAGE), &origins()),
            Some(StartupEvent::Offline)
        );
    }

    #[test]
    fn server_error_on_the_app_goes_back_to_maintenance() {
        for status in [500, 502, 503] {
            assert_eq!(
                load_failure_of(&answered(status), &origins()),
                Some(StartupEvent::ServerUnavailable),
                "status {status}"
            );
        }
    }

    #[test]
    fn navigation_canceled_by_our_own_guard_keeps_the_page() {
        let canceled = CompletedLoad {
            canceled: true,
            ..failed(APP_PAGE)
        };

        assert_eq!(load_failure_of(&canceled, &origins()), None);
    }

    #[test]
    fn any_answer_below_500_keeps_the_page() {
        for status in [200, 204, 304, 404, 429] {
            assert_eq!(
                load_failure_of(&answered(status), &origins()),
                None,
                "status {status}"
            );
        }
    }

    #[test]
    fn the_splash_failing_keeps_the_page() {
        assert_eq!(
            load_failure_of(&failed("http://tauri.localhost/"), &origins()),
            None
        );
    }

    #[test]
    fn another_origin_failing_keeps_the_page() {
        assert_eq!(
            load_failure_of(&failed("https://evil.com/"), &origins()),
            None
        );
    }

    #[test]
    fn unreadable_uri_keeps_the_page() {
        assert_eq!(load_failure_of(&failed(""), &origins()), None);
    }
}
