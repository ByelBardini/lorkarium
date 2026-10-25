mod app_origin;
mod main_window;
mod navigation;
mod startup;
mod startup_commands;
mod tray;
mod webview2;

use app_origin::{AppOrigin, BuildProfile};
use tauri::Manager;

/// The shell: one window that starts on the packaged splash and then opens the lorkarium site.
///
/// Example: `lorkarium_desktop_lib::run()` (from `main.rs`)
pub fn run() {
    // build.rs already refused a bad value; this parse only fails if the two ever disagree.
    let app_origin = AppOrigin::parse(env!("LORKARIUM_APP_URL"), current_profile())
        .unwrap_or_else(|problem| panic!("{problem}"));
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            main_window::focus(app)
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            startup_commands::begin_startup,
            startup_commands::retry_connection
        ])
        .setup(move |app| {
            app.manage(startup_commands::StartupShell::new(app_origin.clone())?);
            let window = main_window::create(app.handle(), app_origin.clone())?;
            tray::install(app.handle())?;
            #[cfg(windows)]
            webview2::harden(&window, app_origin, env!("CARGO_PKG_VERSION"))?;
            #[cfg(not(windows))]
            let _ = window;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("o Lorkarium não abriu");
}

fn current_profile() -> BuildProfile {
    if cfg!(debug_assertions) {
        BuildProfile::Debug
    } else {
        BuildProfile::Release
    }
}
