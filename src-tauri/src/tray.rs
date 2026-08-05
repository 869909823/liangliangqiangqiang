use crate::settings::{AppSettings, DisplayMode, SettingsStore};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Wry,
};
use tauri_plugin_autostart::ManagerExt;

#[derive(Clone)]
pub struct TrayState {
    desktop_only: CheckMenuItem<Wry>,
    normal: CheckMenuItem<Wry>,
    always_on_top: CheckMenuItem<Wry>,
    scale_small: CheckMenuItem<Wry>,
    scale_standard: CheckMenuItem<Wry>,
    scale_large: CheckMenuItem<Wry>,
    position_locked: CheckMenuItem<Wry>,
    bubble_enabled: CheckMenuItem<Wry>,
    auto_companion: CheckMenuItem<Wry>,
    sound_enabled: CheckMenuItem<Wry>,
    click_through: CheckMenuItem<Wry>,
    autostart: CheckMenuItem<Wry>,
}

impl TrayState {
    pub fn sync_settings(&self, settings: &AppSettings) {
        let _ = self
            .desktop_only
            .set_checked(settings.display_mode == DisplayMode::DesktopOnly);
        let _ = self
            .normal
            .set_checked(settings.display_mode == DisplayMode::Normal);
        let _ = self
            .always_on_top
            .set_checked(settings.display_mode == DisplayMode::AlwaysOnTop);
        let _ = self.scale_small.set_checked(settings.scale_percent == 80);
        let _ = self
            .scale_standard
            .set_checked(settings.scale_percent == 100);
        let _ = self.scale_large.set_checked(settings.scale_percent == 130);
        let _ = self.position_locked.set_checked(settings.position_locked);
        let _ = self.bubble_enabled.set_checked(settings.bubble_enabled);
        let _ = self.auto_companion.set_checked(settings.auto_companion);
        let _ = self.sound_enabled.set_checked(settings.sound_enabled);
    }

    pub fn sync_click_through(&self, enabled: bool) {
        let _ = self.click_through.set_checked(enabled);
    }

    fn sync_autostart(&self, app: &tauri::AppHandle) {
        let enabled = app.autolaunch().is_enabled().unwrap_or(false);
        let _ = self.autostart.set_checked(enabled);
    }
}

pub fn build(app: &mut tauri::App, settings: &AppSettings) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示宠物", true, None::<&str>)?;
    let desktop_only = CheckMenuItem::with_id(
        app,
        "mode_desktop_only",
        "仅在桌面显示",
        true,
        settings.display_mode == DisplayMode::DesktopOnly,
        None::<&str>,
    )?;
    let normal = CheckMenuItem::with_id(
        app,
        "mode_normal",
        "普通窗口",
        true,
        settings.display_mode == DisplayMode::Normal,
        None::<&str>,
    )?;
    let always_on_top = CheckMenuItem::with_id(
        app,
        "mode_always_on_top",
        "置顶陪伴",
        true,
        settings.display_mode == DisplayMode::AlwaysOnTop,
        None::<&str>,
    )?;
    let display_menu = Submenu::with_items(
        app,
        "显示模式",
        true,
        &[&desktop_only, &normal, &always_on_top],
    )?;

    let scale_small = CheckMenuItem::with_id(
        app,
        "scale_80",
        "小（80%）",
        true,
        settings.scale_percent == 80,
        None::<&str>,
    )?;
    let scale_standard = CheckMenuItem::with_id(
        app,
        "scale_100",
        "标准（100%）",
        true,
        settings.scale_percent == 100,
        None::<&str>,
    )?;
    let scale_large = CheckMenuItem::with_id(
        app,
        "scale_130",
        "大（130%）",
        true,
        settings.scale_percent == 130,
        None::<&str>,
    )?;
    let scale_menu = Submenu::with_items(
        app,
        "大小",
        true,
        &[&scale_small, &scale_standard, &scale_large],
    )?;

    let position_locked = CheckMenuItem::with_id(
        app,
        "position_locked",
        "锁定位置",
        true,
        settings.position_locked,
        None::<&str>,
    )?;
    let bubble_enabled = CheckMenuItem::with_id(
        app,
        "bubble_enabled",
        "显示气泡",
        true,
        settings.bubble_enabled,
        None::<&str>,
    )?;
    let auto_companion = CheckMenuItem::with_id(
        app,
        "auto_companion",
        "自动陪伴",
        true,
        settings.auto_companion,
        None::<&str>,
    )?;
    let sound_enabled = CheckMenuItem::with_id(
        app,
        "sound_enabled",
        "声音",
        true,
        settings.sound_enabled,
        None::<&str>,
    )?;
    let click_through = CheckMenuItem::with_id(
        app,
        "click_through",
        "鼠标穿透（本次运行）",
        true,
        false,
        None::<&str>,
    )?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "开机启动",
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let reset_position = MenuItem::with_id(
        app,
        "reset_position",
        "重置到主显示器右下角",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let separator_one = PredefinedMenuItem::separator(app)?;
    let separator_two = PredefinedMenuItem::separator(app)?;
    let separator_three = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &display_menu,
            &scale_menu,
            &separator_one,
            &position_locked,
            &bubble_enabled,
            &auto_companion,
            &sound_enabled,
            &click_through,
            &autostart,
            &separator_two,
            &reset_position,
            &separator_three,
            &quit,
        ],
    )?;

    let controls = TrayState {
        desktop_only,
        normal,
        always_on_top,
        scale_small,
        scale_standard,
        scale_large,
        position_locked,
        bubble_enabled,
        auto_companion,
        sound_enabled,
        click_through,
        autostart,
    };
    let event_controls = controls.clone();
    app.manage(controls);

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().expect("应用图标缺失").clone())
        .tooltip("踉踉跄跄")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => crate::window_mode::show_from_tray(app),
            "mode_desktop_only" => {
                let _ = crate::set_display_mode_value(app, DisplayMode::DesktopOnly);
            }
            "mode_normal" => {
                let _ = crate::set_display_mode_value(app, DisplayMode::Normal);
            }
            "mode_always_on_top" => {
                let _ = crate::set_display_mode_value(app, DisplayMode::AlwaysOnTop);
            }
            "scale_80" => {
                let _ = crate::set_scale_percent_value(app, 80);
            }
            "scale_100" => {
                let _ = crate::set_scale_percent_value(app, 100);
            }
            "scale_130" => {
                let _ = crate::set_scale_percent_value(app, 130);
            }
            "position_locked" => {
                let checked = event_controls.position_locked.is_checked().unwrap_or(false);
                let _ = mutate_setting(app, |settings| settings.position_locked = checked);
            }
            "bubble_enabled" => {
                let checked = event_controls.bubble_enabled.is_checked().unwrap_or(true);
                let _ = mutate_setting(app, |settings| settings.bubble_enabled = checked);
            }
            "auto_companion" => {
                let checked = event_controls.auto_companion.is_checked().unwrap_or(true);
                let _ = mutate_setting(app, |settings| settings.auto_companion = checked);
            }
            "sound_enabled" => {
                let checked = event_controls.sound_enabled.is_checked().unwrap_or(false);
                let _ = mutate_setting(app, |settings| settings.sound_enabled = checked);
            }
            "click_through" => {
                let checked = event_controls.click_through.is_checked().unwrap_or(false);
                let _ = crate::set_click_through_value(app, checked);
            }
            "autostart" => {
                if event_controls.autostart.is_checked().unwrap_or(false) {
                    let _ = app.autolaunch().enable();
                } else {
                    let _ = app.autolaunch().disable();
                }
                event_controls.sync_autostart(app);
            }
            "reset_position" => {
                let _ = crate::reset_window_position_value(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::window_mode::show_from_tray(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn mutate_setting(
    app: &tauri::AppHandle,
    update: impl FnOnce(&mut AppSettings),
) -> Result<AppSettings, String> {
    let store = app.state::<SettingsStore>();
    let previous = store.get();
    let settings = store.mutate(update)?;
    crate::apply_settings_transition(app, &previous, &settings)?;
    Ok(settings)
}
