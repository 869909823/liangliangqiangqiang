mod settings;
mod tray;
mod window_geometry;
mod window_mode;

use serde::Serialize;
use settings::{AppSettings, DisplayMode, SettingsPatch, SettingsStore};
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager, State};

struct SessionState {
    click_through: AtomicBool,
}

impl SessionState {
    fn new() -> Self {
        Self {
            click_through: AtomicBool::new(false),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResult {
    available: bool,
    version: Option<String>,
    url: String,
    should_fetch: bool,
    throttled: bool,
    api_url: String,
    current_version: String,
    channel: String,
}

#[tauri::command]
fn get_settings(state: State<'_, SettingsStore>) -> AppSettings {
    state.get()
}

#[tauri::command]
fn update_settings(
    app: tauri::AppHandle,
    state: State<'_, SettingsStore>,
    patch: SettingsPatch,
) -> Result<AppSettings, String> {
    let previous = state.get();
    let mut next = previous.clone();
    patch.apply(&mut next);
    let next = state.replace(next)?;
    apply_settings_transition(&app, &previous, &next)?;
    Ok(state.get())
}

#[tauri::command]
fn set_display_mode(app: tauri::AppHandle, mode: DisplayMode) -> Result<AppSettings, String> {
    set_display_mode_value(&app, mode)
}

#[tauri::command]
fn set_scale_percent(app: tauri::AppHandle, percent: u16) -> Result<AppSettings, String> {
    set_scale_percent_value(&app, percent)
}

#[tauri::command]
fn reset_window_position(app: tauri::AppHandle) -> Result<AppSettings, String> {
    reset_window_position_value(&app)
}

#[tauri::command]
fn set_click_through(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    set_click_through_value(&app, enabled)?;
    Ok(enabled)
}

#[tauri::command]
fn get_system_idle_ms() -> u64 {
    window_mode::system_idle_ms()
}

#[tauri::command]
fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateCheckResult, String> {
    const RELEASES_API: &str =
        "https://api.github.com/repos/869909823/liangliangqiangqiang/releases";
    const RELEASES_PAGE: &str =
        "https://github.com/869909823/liangliangqiangqiang/releases";
    const ONE_DAY_SECONDS: u64 = 24 * 60 * 60;

    let store = app.state::<SettingsStore>();
    let settings = store.get();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let previous = settings
        .last_update_check
        .as_deref()
        .and_then(|value| value.parse::<u64>().ok());
    let throttled = previous.is_some_and(|value| now.saturating_sub(value) < ONE_DAY_SECONDS);

    if !throttled {
        let previous_settings = settings;
        let next = store.mutate(|value| value.last_update_check = Some(now.to_string()))?;
        apply_settings_transition(&app, &previous_settings, &next)?;
    }

    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let channel = if current_version.contains('-') {
        "beta"
    } else {
        "stable"
    };
    Ok(UpdateCheckResult {
        available: false,
        version: None,
        url: RELEASES_PAGE.into(),
        should_fetch: !throttled,
        throttled,
        api_url: RELEASES_API.into(),
        current_version,
        channel: channel.into(),
    })
}

pub(crate) fn set_display_mode_value(
    app: &tauri::AppHandle,
    mode: DisplayMode,
) -> Result<AppSettings, String> {
    let store = app.state::<SettingsStore>();
    let previous = store.get();
    let next = store.mutate(|settings| settings.display_mode = mode)?;
    apply_settings_transition(app, &previous, &next)?;
    Ok(store.get())
}

pub(crate) fn set_scale_percent_value(
    app: &tauri::AppHandle,
    percent: u16,
) -> Result<AppSettings, String> {
    let settings = window_geometry::set_scale(app, percent)?;
    sync_tray(app, &settings);
    emit_settings(app, &settings);
    Ok(settings)
}

pub(crate) fn reset_window_position_value(app: &tauri::AppHandle) -> Result<AppSettings, String> {
    let settings = window_geometry::reset_to_primary(app)?;
    sync_tray(app, &settings);
    emit_settings(app, &settings);
    Ok(settings)
}

pub(crate) fn set_click_through_value(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    window_mode::set_click_through(app, enabled)?;
    app.state::<SessionState>()
        .click_through
        .store(enabled, Ordering::SeqCst);
    if let Some(tray) = app.try_state::<tray::TrayState>() {
        tray.sync_click_through(enabled);
    }
    Ok(())
}

pub(crate) fn apply_settings_transition(
    app: &tauri::AppHandle,
    previous: &AppSettings,
    requested: &AppSettings,
) -> Result<(), String> {
    let mut effective = requested.clone();
    if previous.scale_percent != requested.scale_percent {
        effective = window_geometry::set_scale(app, requested.scale_percent)?;
    }
    if previous.display_mode != effective.display_mode {
        window_mode::apply(app, effective.display_mode)?;
    }
    sync_tray(app, &effective);
    emit_settings(app, &effective);
    Ok(())
}

pub(crate) fn sync_tray(app: &tauri::AppHandle, settings: &AppSettings) {
    if let Some(tray) = app.try_state::<tray::TrayState>() {
        tray.sync_settings(settings);
    }
}

pub(crate) fn emit_settings(app: &tauri::AppHandle, settings: &AppSettings) {
    let _ = app.emit("settings-changed", settings.clone());
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _arguments, _cwd| {
            window_mode::activate_existing(app);
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            update_settings,
            set_display_mode,
            set_scale_percent,
            reset_window_position,
            set_click_through,
            get_system_idle_ms,
            check_for_updates
        ])
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let store = SettingsStore::load(config_dir).map_err(std::io::Error::other)?;
            app.manage(store);
            app.manage(SessionState::new());
            app.manage(window_mode::WindowModeState::new());
            app.manage(window_geometry::GeometryState::new());

            let settings = window_geometry::restore(app.handle()).map_err(std::io::Error::other)?;
            tray::build(app, &settings)?;
            window_geometry::install_move_listener(app.handle())
                .map_err(std::io::Error::other)?;
            set_click_through_value(app.handle(), false).map_err(std::io::Error::other)?;
            window_mode::apply(app.handle(), settings.display_mode)
                .map_err(std::io::Error::other)?;
            window_mode::start_watcher(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动踉踉跄跄失败");
}
