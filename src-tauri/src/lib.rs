use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_autostart::ManagerExt;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示踉踉跄跄", true, None::<&str>)?;
            let always_on_top = CheckMenuItem::with_id(app, "always_on_top", "始终置顶", true, true, None::<&str>)?;
            let click_through = CheckMenuItem::with_id(app, "click_through", "鼠标穿透", true, false, None::<&str>)?;
            let autostart = CheckMenuItem::with_id(
                app,
                "autostart",
                "开机启动",
                true,
                app.autolaunch().is_enabled().unwrap_or(false),
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&show, &always_on_top, &click_through, &autostart, &separator, &quit],
            )?;
            let always_on_top_menu = always_on_top.clone();
            let click_through_menu = click_through.clone();
            let autostart_menu = autostart.clone();

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().expect("应用图标缺失").clone())
                .tooltip("踉踉跄跄")
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    let Some(window) = app.get_webview_window("main") else { return };
                    match event.id.as_ref() {
                        "show" => {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        "always_on_top" => {
                            let _ = window.set_always_on_top(
                                always_on_top_menu.is_checked().unwrap_or(true),
                            );
                        }
                        "click_through" => {
                            let _ = window.set_ignore_cursor_events(
                                click_through_menu.is_checked().unwrap_or(false),
                            );
                        }
                        "autostart" => {
                            if autostart_menu.is_checked().unwrap_or(false) {
                                let _ = app.autolaunch().enable();
                            } else {
                                let _ = app.autolaunch().disable();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动踉踉跄跄失败");
}
