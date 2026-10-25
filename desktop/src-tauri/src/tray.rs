use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Runtime};

use crate::main_window;

pub const OPEN_ITEM: &str = "open";
pub const QUIT_ITEM: &str = "quit";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayAction {
    Open,
    Quit,
}

/// What a click on an item of the tray menu does.
///
/// Example: `tray_menu_action("quit") // Some(TrayAction::Quit)`
pub fn tray_menu_action(item_id: &str) -> Option<TrayAction> {
    match item_id {
        OPEN_ITEM => Some(TrayAction::Open),
        QUIT_ITEM => Some(TrayAction::Quit),
        _ => None,
    }
}

/// A left click on the icon brings the window back; the right click is the menu's.
///
/// Example: `tray_click_action(MouseButton::Left, MouseButtonState::Up) // Some(TrayAction::Open)`
pub fn tray_click_action(button: MouseButton, state: MouseButtonState) -> Option<TrayAction> {
    match (button, state) {
        (MouseButton::Left, MouseButtonState::Up) => Some(TrayAction::Open),
        _ => None,
    }
}

/// The icon next to the clock: closing the window only hides it there, and "Sair" ends the app.
///
/// Example: `tray::install(app.handle())?` (from the `setup` of `lib.rs`)
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, OPEN_ITEM, "Abrir o Lorkarium", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT_ITEM, "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Lorkarium")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| run(app, tray_menu_action(event.id().as_ref())))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                run(tray.app_handle(), tray_click_action(button, button_state));
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app).map(|_| ())
}

fn run<R: Runtime>(app: &AppHandle<R>, action: Option<TrayAction>) {
    match action {
        Some(TrayAction::Open) => main_window::focus(app),
        Some(TrayAction::Quit) => app.exit(0),
        None => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_item_brings_the_window_back() {
        assert_eq!(tray_menu_action(OPEN_ITEM), Some(TrayAction::Open));
    }

    #[test]
    fn quit_item_closes_the_app_for_real() {
        assert_eq!(tray_menu_action(QUIT_ITEM), Some(TrayAction::Quit));
    }

    #[test]
    fn unknown_item_does_nothing() {
        assert_eq!(tray_menu_action("settings"), None);
    }

    #[test]
    fn left_click_released_opens_the_window() {
        assert_eq!(
            tray_click_action(MouseButton::Left, MouseButtonState::Up),
            Some(TrayAction::Open)
        );
    }

    #[test]
    fn left_button_pressed_waits_for_the_release() {
        assert_eq!(
            tray_click_action(MouseButton::Left, MouseButtonState::Down),
            None
        );
    }

    #[test]
    fn right_click_is_left_to_the_menu() {
        assert_eq!(
            tray_click_action(MouseButton::Right, MouseButtonState::Up),
            None
        );
    }
}
