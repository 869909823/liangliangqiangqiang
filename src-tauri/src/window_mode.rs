use crate::{settings::DisplayMode, window_geometry};
use serde::Serialize;
use std::{
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};
use tauri::{Emitter, Manager};

pub struct WindowModeState {
    visible: AtomicBool,
}

impl WindowModeState {
    pub fn new() -> Self {
        Self {
            visible: AtomicBool::new(false),
        }
    }
}

#[derive(Clone, Serialize)]
struct VisibilityPayload {
    visible: bool,
}

pub fn apply(app: &tauri::AppHandle, mode: DisplayMode) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    match mode {
        DisplayMode::DesktopOnly => {
            window
                .set_always_on_top(false)
                .map_err(|error| error.to_string())?;
            reconcile_desktop_visibility(app);
        }
        DisplayMode::Normal => {
            window
                .set_always_on_top(false)
                .map_err(|error| error.to_string())?;
            set_visible(app, true);
        }
        DisplayMode::AlwaysOnTop => {
            window
                .set_always_on_top(true)
                .map_err(|error| error.to_string())?;
            set_visible(app, true);
        }
    }
    Ok(())
}

pub fn start_watcher(app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut geometry_tick = 0_u8;
        let mut startup_announcements = 0_u8;
        loop {
            thread::sleep(Duration::from_millis(350));
            let settings = app.state::<crate::settings::SettingsStore>().get();
            match settings.display_mode {
                DisplayMode::DesktopOnly => reconcile_desktop_visibility(&app),
                DisplayMode::Normal | DisplayMode::AlwaysOnTop => set_visible(&app, true),
            }

            if startup_announcements < 3 {
                announce_visibility(&app);
                startup_announcements += 1;
            }

            geometry_tick = geometry_tick.wrapping_add(1);
            if geometry_tick % 4 == 0 {
                let _ = window_geometry::ensure_visible(&app);
            }
        }
    });
}

pub fn show_from_tray(app: &tauri::AppHandle) {
    activate_existing(app);
}

pub fn activate_existing(app: &tauri::AppHandle) {
    let mode = app
        .state::<crate::settings::SettingsStore>()
        .get()
        .display_mode;
    if mode == DisplayMode::DesktopOnly && !desktop_or_pet_is_foreground() {
        return;
    }
    set_visible(app, true);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
}

pub fn set_click_through(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| error.to_string())
}

fn reconcile_desktop_visibility(app: &tauri::AppHandle) {
    set_visible(app, desktop_or_pet_is_foreground());
}

fn set_visible(app: &tauri::AppHandle, visible: bool) {
    let state = app.state::<WindowModeState>();
    let previous = state.visible.swap(visible, Ordering::SeqCst);
    if previous == visible {
        return;
    }
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if visible {
        let _ = window.show();
    } else {
        let _ = window.hide();
    }
    let _ = app.emit("window-visibility-changed", VisibilityPayload { visible });
}

fn announce_visibility(app: &tauri::AppHandle) {
    let visible = app
        .state::<WindowModeState>()
        .visible
        .load(Ordering::SeqCst);
    let _ = app.emit("window-visibility-changed", VisibilityPayload { visible });
}

#[cfg(windows)]
fn desktop_or_pet_is_foreground() -> bool {
    use windows_sys::Win32::{
        System::Threading::GetCurrentProcessId,
        UI::WindowsAndMessaging::{
            GetClassNameW, GetForegroundWindow, GetShellWindow, GetWindowThreadProcessId,
        },
    };

    let foreground = unsafe { GetForegroundWindow() };
    if foreground.is_null() {
        return false;
    }

    let mut foreground_pid = 0_u32;
    unsafe { GetWindowThreadProcessId(foreground, &mut foreground_pid) };
    if foreground_pid == unsafe { GetCurrentProcessId() } {
        return true;
    }

    let shell = unsafe { GetShellWindow() };
    if shell.is_null() {
        return false;
    }
    if foreground == shell {
        return true;
    }

    let mut shell_pid = 0_u32;
    unsafe { GetWindowThreadProcessId(shell, &mut shell_pid) };
    if foreground_pid == 0 || foreground_pid != shell_pid {
        return false;
    }

    let mut class_name = [0_u16; 64];
    let length = unsafe {
        GetClassNameW(
            foreground,
            class_name.as_mut_ptr(),
            class_name.len() as i32,
        )
    };
    if length <= 0 {
        return false;
    }
    matches!(
        String::from_utf16_lossy(&class_name[..length as usize]).as_str(),
        "Progman" | "WorkerW" | "Shell_TrayWnd"
    )
}

#[cfg(not(windows))]
fn desktop_or_pet_is_foreground() -> bool {
    true
}

#[cfg(windows)]
pub fn system_idle_ms() -> u64 {
    use std::mem::size_of;
    use windows_sys::Win32::{
        System::SystemInformation::GetTickCount,
        UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
    };

    let mut info = LASTINPUTINFO {
        cbSize: size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    if unsafe { GetLastInputInfo(&mut info) } == 0 {
        return 0;
    }
    u64::from(unsafe { GetTickCount() }.wrapping_sub(info.dwTime))
}

#[cfg(not(windows))]
pub fn system_idle_ms() -> u64 {
    0
}
