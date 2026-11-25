#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, UserAttentionType, WebviewWindow,
};

fn restore_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[tauri::command]
fn wake_window(window: WebviewWindow, pin_on_top: bool) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_always_on_top(pin_on_top);
    let _ = window.set_focus();
    let _ = window.request_user_attention(Some(UserAttentionType::Critical));
}

#[tauri::command]
fn clear_window_attention(window: WebviewWindow) {
    let _ = window.set_always_on_top(false);
    let _ = window.request_user_attention(None);
}

#[tauri::command]
fn send_os_notification(title: String, body: String, urgent: bool) -> bool {
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("notify-send")
            .arg("-a")
            .arg("SimHub Phone")
            .arg("-u")
            .arg(if urgent { "critical" } else { "normal" })
            .arg(&title)
            .arg(&body)
            .spawn()
            .is_ok()
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (title, body, urgent);
        false
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            wake_window,
            clear_window_attention,
            send_os_notification,
        ])
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出 SimHub Phone", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let mut builder = TrayIconBuilder::new()
                .tooltip("SimHub Phone")
                .show_menu_on_left_click(false)
                .menu(&menu)
                .on_menu_event(|app: &AppHandle, event| match event.id().as_ref() {
                    "show" => restore_main_window(app),
                    "quit" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                            if win.emit("simhub://quit-requested", ()).is_err() {
                                app.exit(0);
                            }
                        } else {
                            app.exit(0);
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        restore_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                builder = builder.icon(icon);
            }
            builder.build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Unable to start SimHub Phone");
}
