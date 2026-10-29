mod app_origin;
mod chat_window;
mod chat_window_controls;
mod load_failure;
mod main_window;
mod navigation;
mod startup;
mod startup_commands;
mod tray;
mod webview2;
mod window_controls;

use app_origin::{AppOrigin, BuildProfile};
use tauri::{AppHandle, Manager, Runtime};

/// The shell: one main window (plus the chat, when the site asks for it) that starts on the packaged splash and then opens the lorkarium site.
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
        // Sem DECORATIONS: o estado salvo antes da barra própria religaria a moldura nativa.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .with_filter(main_window::keeps_window_state)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            startup_commands::begin_startup,
            startup_commands::retry_connection,
            chat_window_controls::set_chat_always_on_top,
            chat_window_controls::control_detached_window
        ])
        .setup(move |app| open_main_window(app.handle(), app_origin.clone()))
        .run(tauri::generate_context!())
        .expect("o Lorkarium não abriu");
}

fn open_main_window<R: Runtime>(
    app: &AppHandle<R>,
    app_origin: AppOrigin,
) -> Result<(), Box<dyn std::error::Error>> {
    let origins = main_window::shell_origins(app, app_origin.clone());
    app.manage(startup_commands::StartupShell::new(app_origin.clone())?);
    let window = main_window::create(app, origins.clone())?;
    window_controls::install(app, &app_origin)?;
    chat_window_controls::install(app, &app_origin)?;
    tray::install(app)?;
    #[cfg(windows)]
    {
        let send_back = startup_commands::send_back_to_splash(app.clone(), origins.splash.clone());
        webview2::harden(&window, origins, env!("CARGO_PKG_VERSION"), send_back)?;
    }
    #[cfg(not(windows))]
    let _ = (window, origins);
    Ok(())
}

fn current_profile() -> BuildProfile {
    if cfg!(debug_assertions) {
        BuildProfile::Debug
    } else {
        BuildProfile::Release
    }
}
