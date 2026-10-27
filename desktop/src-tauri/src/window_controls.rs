use tauri::ipc::CapabilityBuilder;
use tauri::{AppHandle, Manager, Runtime};

use crate::app_origin::AppOrigin;
use crate::main_window::MAIN_WINDOW;

const REMOTE_CAPABILITY: &str = "app-window-controls";

/// What the site's own title bar may ask of the window. Dragging is CSS (`app-region: drag`), so no
/// `start-dragging`; no `destroy` or `set-*`: the X still only hides the window into the tray.
pub const REMOTE_WINDOW_PERMISSIONS: [&str; 6] = [
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-close",
    "core:window:allow-is-maximized",
    "core:event:allow-listen",
    "core:event:allow-unlisten",
];

/// The URLPattern a remote capability takes for every page of the app's origin.
///
/// Example: `remote_url_pattern(&origin) // "https://lorkarium.app/*"`
pub fn remote_url_pattern(app: &AppOrigin) -> String {
    format!("{}*", app.url())
}

/// Gives the site, and only it, the window permissions of its title bar; built at runtime because the
/// origin only exists in the build (`LORKARIUM_APP_URL`).
///
/// Example: `window_controls::install(app.handle(), &app_origin)?`
pub fn install<R: Runtime>(app: &AppHandle<R>, origin: &AppOrigin) -> tauri::Result<()> {
    let base = CapabilityBuilder::new(REMOTE_CAPABILITY)
        .remote(remote_url_pattern(origin))
        .local(false)
        .window(MAIN_WINDOW);
    let capability = REMOTE_WINDOW_PERMISSIONS
        .iter()
        .fold(base, |builder, permission| builder.permission(*permission));
    app.add_capability(capability)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_origin::BuildProfile;

    #[test]
    fn pattern_covers_every_page_of_the_app_origin() {
        let origin = AppOrigin::parse("https://lorkarium.app", BuildProfile::Release).unwrap();

        assert_eq!(remote_url_pattern(&origin), "https://lorkarium.app/*");
    }

    #[test]
    fn pattern_keeps_the_port_of_the_dev_origin() {
        let origin = AppOrigin::parse("http://localhost:5173", BuildProfile::Debug).unwrap();

        assert_eq!(remote_url_pattern(&origin), "http://localhost:5173/*");
    }

    #[test]
    fn site_gets_exactly_the_title_bar_permissions() {
        assert_eq!(
            REMOTE_WINDOW_PERMISSIONS,
            [
                "core:window:allow-minimize",
                "core:window:allow-toggle-maximize",
                "core:window:allow-close",
                "core:window:allow-is-maximized",
                "core:event:allow-listen",
                "core:event:allow-unlisten",
            ]
        );
    }

    #[test]
    fn site_never_gets_destroy_setters_or_dragging() {
        let forbidden = ["allow-destroy", "allow-set-", "allow-start-dragging"];

        for permission in REMOTE_WINDOW_PERMISSIONS {
            assert!(
                forbidden.iter().all(|word| !permission.contains(word)),
                "permissão fora do contrato: {permission}"
            );
        }
    }
}
