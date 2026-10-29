// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Fix for Linux Wayland (Niri, Hyprland, Sway, GNOME Wayland):
        // AppImages bundled with linuxdeploy-plugin-gtk inject `export GDK_BACKEND=x11`.
        // On pure Wayland compositors (like Niri), running as an XWayland client causes:
        // 1) Window resizing failure (the webview stays fixed at initial 1200px width with black dead space).
        // 2) Complete drop/unresponsiveness of mouse clicks due to desynchronized coordinate spaces.
        // If WAYLAND_DISPLAY is set (user is on Wayland), ensure GDK uses native Wayland with X11 fallback:
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            std::env::set_var("GDK_BACKEND", "wayland,x11");
        }

        // Fix for WebKitGTK DMA-BUF rendering issue on Linux causing blank/gray screens on resize:
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Build Tray Menu
            let open_i = MenuItem::with_id(app, "open", "Open Essential Space", true, None::<&str>)?;
            let capture_i = MenuItem::with_id(app, "capture", "Quick Capture", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &capture_i, &quit_i])?;

            // Build Tray Icon safely without unwrap panics
            let mut tray_builder = TrayIconBuilder::new().menu(&menu).tooltip("Essential Space");

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "capture" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                            let _ = window.emit("open-quick-capture", ());
                        }
                    }
                    "quit" => {
                        app.exit(0);
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
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app);

            if let Err(err) = _tray {
                eprintln!("[Warning] System tray icon unavailable: {err}");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Intercept close button and hide window to tray instead
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Essential Space application");
}
