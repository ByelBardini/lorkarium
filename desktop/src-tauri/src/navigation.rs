use url::Url;

use crate::app_origin::AppOrigin;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Navigation {
    Stay,
    OpenExternal,
    Block,
}

// What the operating system has a safe default app for; anything else (javascript:, file:, data:) is dropped.
const EXTERNAL_SCHEMES: [&str; 3] = ["https", "http", "mailto"];

/// The two places the window may show: the packaged splash and the lorkarium site.
#[derive(Debug, Clone)]
pub struct ShellOrigins {
    pub app: AppOrigin,
    pub splash: Url,
}

/// Where a navigation (or a `window.open`) goes: inside the window, to the default browser, or nowhere.
///
/// Example: `navigation_decision(&Url::parse("https://github.com/x")?, &origins) // OpenExternal`
pub fn navigation_decision(url: &Url, origins: &ShellOrigins) -> Navigation {
    if origins.app.contains(url) || url.origin() == origins.splash.origin() {
        return Navigation::Stay;
    }
    if EXTERNAL_SCHEMES.contains(&url.scheme()) {
        return Navigation::OpenExternal;
    }
    Navigation::Block
}

/// A `window.open` / `target="_blank"` never becomes a second Tauri window: the app's own pages and other
/// sites go to the default browser, where the site works as well; the splash and unsafe schemes go nowhere.
///
/// Example: `new_window_decision(&Url::parse("https://lorkarium.app/x")?, &origins) // OpenExternal`
pub fn new_window_decision(url: &Url, origins: &ShellOrigins) -> Navigation {
    match navigation_decision(url, origins) {
        Navigation::Stay if origins.app.contains(url) => Navigation::OpenExternal,
        Navigation::Stay => Navigation::Block,
        decision => decision,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_origin::BuildProfile;

    fn origins() -> ShellOrigins {
        ShellOrigins {
            app: AppOrigin::parse("https://lorkarium.app", BuildProfile::Release).unwrap(),
            splash: Url::parse("http://tauri.localhost/").unwrap(),
        }
    }

    fn decision_for(raw: &str) -> Navigation {
        navigation_decision(&Url::parse(raw).unwrap(), &origins())
    }

    #[test]
    fn page_of_the_app_stays_in_the_window() {
        assert_eq!(
            decision_for("https://lorkarium.app/campaigns/1"),
            Navigation::Stay
        );
    }

    #[test]
    fn the_splash_stays_in_the_window() {
        assert_eq!(decision_for("http://tauri.localhost/"), Navigation::Stay);
    }

    #[test]
    fn another_site_opens_in_the_browser() {
        assert_eq!(
            decision_for("https://github.com/x"),
            Navigation::OpenExternal
        );
    }

    #[test]
    fn host_that_only_starts_with_the_app_host_is_external() {
        assert_eq!(
            decision_for("https://lorkarium.app.evil.com/"),
            Navigation::OpenExternal
        );
    }

    #[test]
    fn app_url_inside_the_query_of_another_site_is_external() {
        assert_eq!(
            decision_for("https://evil.com/?r=https://lorkarium.app"),
            Navigation::OpenExternal
        );
    }

    #[test]
    fn another_port_is_another_origin() {
        assert_eq!(
            decision_for("https://lorkarium.app:8443/"),
            Navigation::OpenExternal
        );
    }

    #[test]
    fn plain_http_on_the_app_host_is_another_origin() {
        assert_eq!(
            decision_for("http://lorkarium.app/"),
            Navigation::OpenExternal
        );
    }

    #[test]
    fn mail_link_opens_in_the_mail_app() {
        assert_eq!(decision_for("mailto:a@b.c"), Navigation::OpenExternal);
    }

    #[test]
    fn script_url_is_blocked() {
        assert_eq!(decision_for("javascript:alert(1)"), Navigation::Block);
    }

    #[test]
    fn local_file_is_blocked() {
        assert_eq!(decision_for("file:///c:/"), Navigation::Block);
    }

    #[test]
    fn data_document_is_blocked() {
        assert_eq!(decision_for("data:text/html,<p>oi</p>"), Navigation::Block);
    }

    fn new_window_for(raw: &str) -> Navigation {
        new_window_decision(&Url::parse(raw).unwrap(), &origins())
    }

    #[test]
    fn new_window_of_the_app_opens_in_the_browser() {
        assert_eq!(
            new_window_for("https://lorkarium.app/campaigns/1"),
            Navigation::OpenExternal
        );
    }

    #[test]
    fn new_window_of_another_site_opens_in_the_browser() {
        assert_eq!(
            new_window_for("https://github.com/x"),
            Navigation::OpenExternal
        );
    }

    #[test]
    fn new_window_of_the_splash_is_blocked() {
        assert_eq!(new_window_for("http://tauri.localhost/"), Navigation::Block);
    }

    #[test]
    fn new_window_with_a_script_url_is_blocked() {
        assert_eq!(new_window_for("javascript:alert(1)"), Navigation::Block);
    }

    #[test]
    fn blob_of_the_app_stays_in_the_window() {
        assert_eq!(
            decision_for("blob:https://lorkarium.app/0b8f6d2e-1c3a-4e7b-9f00-1a2b3c4d5e6f"),
            Navigation::Stay
        );
    }
}
