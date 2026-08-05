use crate::settings::{AppSettings, SettingsStore};
use serde::Serialize;
use std::{
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    thread,
    time::Duration,
};
use tauri::{
    Emitter, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow,
    WindowEvent,
};

pub const DESIGN_WIDTH: f64 = 360.0;
pub const DESIGN_HEIGHT: f64 = 440.0;
const EDGE_SNAP_LOGICAL_PX: f64 = 16.0;

pub struct GeometryState {
    move_generation: AtomicU64,
    move_pending: AtomicBool,
    scale_change_pending: AtomicBool,
    locked_restore_pending: AtomicBool,
}

impl GeometryState {
    pub fn new() -> Self {
        Self {
            move_generation: AtomicU64::new(0),
            move_pending: AtomicBool::new(false),
            scale_change_pending: AtomicBool::new(false),
            locked_restore_pending: AtomicBool::new(false),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorChangedPayload {
    monitor_name: Option<String>,
}

#[derive(Clone, Copy, Debug)]
struct WorkArea {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

impl WorkArea {
    fn width(self) -> i32 {
        self.right.saturating_sub(self.left)
    }

    fn height(self) -> i32 {
        self.bottom.saturating_sub(self.top)
    }
}

pub fn install_move_listener(app: &tauri::AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. }) {
            handle.exit(0);
            return;
        }
        let scale_changed = matches!(event, WindowEvent::ScaleFactorChanged { .. });
        if !matches!(event, WindowEvent::Moved(_)) && !scale_changed {
            return;
        }
        let state = handle.state::<GeometryState>();
        state.move_pending.store(true, Ordering::SeqCst);
        if scale_changed {
            state.scale_change_pending.store(true, Ordering::SeqCst);
        }
        if matches!(event, WindowEvent::Moved(_))
            && handle.state::<SettingsStore>().get().position_locked
        {
            if state.locked_restore_pending.swap(true, Ordering::SeqCst) {
                return;
            }
            let locked_handle = handle.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(80));
                let _ = restore(&locked_handle);
                thread::sleep(Duration::from_millis(80));
                locked_handle
                    .state::<GeometryState>()
                    .locked_restore_pending
                    .store(false, Ordering::SeqCst);
                locked_handle
                    .state::<GeometryState>()
                    .move_pending
                    .store(false, Ordering::SeqCst);
            });
            return;
        }
        let generation = state.move_generation.fetch_add(1, Ordering::SeqCst) + 1;
        let delayed_handle = handle.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(500));
            let state = delayed_handle.state::<GeometryState>();
            if state.move_generation.load(Ordering::SeqCst) == generation {
                if state.scale_change_pending.swap(false, Ordering::SeqCst) {
                    let _ = reapply_current_scale(&delayed_handle);
                } else {
                    let _ = persist_current_position(&delayed_handle);
                }
                state.move_pending.store(false, Ordering::SeqCst);
                let _ = ensure_visible(&delayed_handle);
            }
        });
    });
    Ok(())
}

pub fn restore(app: &tauri::AppHandle) -> Result<AppSettings, String> {
    let store = app.state::<SettingsStore>();
    let mut settings = store.get();
    let window = main_window(app)?;
    let monitor = select_monitor(&window, settings.monitor_name.as_deref())
        .ok_or_else(|| "没有可用显示器".to_string())?;
    apply_to_monitor(&window, &monitor, &mut settings)?;
    persist_geometry(&store, &settings, true)
}

pub fn set_scale(app: &tauri::AppHandle, percent: u16) -> Result<AppSettings, String> {
    if !(10..=200).contains(&percent) || percent % 10 != 0 {
        return Err("缩放必须是 10–200 之间、步进为 10 的整数".into());
    }

    let store = app.state::<SettingsStore>();
    let window = main_window(app)?;
    let mut settings = store.get();
    capture_geometry(&window, &mut settings, false)?;
    settings.scale_percent = percent;
    let monitor = select_monitor(&window, settings.monitor_name.as_deref())
        .ok_or_else(|| "没有可用显示器".to_string())?;
    apply_to_monitor(&window, &monitor, &mut settings)?;
    persist_geometry(&store, &settings, true)
}

fn reapply_current_scale(app: &tauri::AppHandle) -> Result<AppSettings, String> {
    let store = app.state::<SettingsStore>();
    let window = main_window(app)?;
    let mut settings = store.get();
    let previous_monitor = settings.monitor_name.clone();
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| select_monitor(&window, settings.monitor_name.as_deref()))
        .ok_or_else(|| "没有可用显示器".to_string())?;
    settings.monitor_name = monitor.name().map(str::to_owned);
    apply_to_monitor(&window, &monitor, &mut settings)?;
    let settings = persist_geometry(&store, &settings, true)?;
    if settings.monitor_name != previous_monitor {
        emit_monitor_changed(app, settings.monitor_name.clone());
    }
    crate::sync_tray(app, &settings);
    crate::emit_settings(app, &settings);
    Ok(settings)
}

pub fn reset_to_primary(app: &tauri::AppHandle) -> Result<AppSettings, String> {
    let store = app.state::<SettingsStore>();
    let window = main_window(app)?;
    let monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| window.available_monitors().ok()?.into_iter().next())
        .ok_or_else(|| "没有可用显示器".to_string())?;
    let previous_monitor = store.get().monitor_name;
    let mut settings = store.get();
    settings.monitor_name = monitor.name().map(str::to_owned);
    settings.x_ratio = 1.0;
    settings.y_ratio = 1.0;
    apply_to_monitor(&window, &monitor, &mut settings)?;
    let settings = persist_geometry(&store, &settings, true)?;
    if settings.monitor_name != previous_monitor {
        emit_monitor_changed(app, settings.monitor_name.clone());
    }
    Ok(settings)
}

pub fn ensure_visible(app: &tauri::AppHandle) -> Result<(), String> {
    if app
        .state::<GeometryState>()
        .move_pending
        .load(Ordering::SeqCst)
    {
        return Ok(());
    }
    let window = main_window(app)?;
    let store = app.state::<SettingsStore>();
    let settings = store.get();
    let available = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let saved_monitor_exists = settings.monitor_name.as_ref().is_some_and(|saved| {
        available
            .iter()
            .any(|monitor| monitor.name().is_some_and(|name| name == saved))
    });

    if settings.monitor_name.is_some() && !saved_monitor_exists {
        let settings = reset_to_primary(app)?;
        crate::sync_tray(app, &settings);
        crate::emit_settings(app, &settings);
        return Ok(());
    }

    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let Some(monitor) = select_monitor(&window, settings.monitor_name.as_deref()) else {
        return Ok(());
    };
    let work = work_area(&monitor);
    let clamped = clamp_position(position, size, work);
    if clamped != position {
        window
            .set_position(clamped)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn persist_current_position(app: &tauri::AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    let store = app.state::<SettingsStore>();
    let mut settings = store.get();
    if settings.position_locked {
        return Ok(());
    }
    let previous_monitor = settings.monitor_name.clone();
    let edge_snap = settings.edge_snap;
    capture_geometry(&window, &mut settings, edge_snap)?;
    let settings = persist_geometry(&store, &settings, false)?;
    if settings.monitor_name != previous_monitor {
        emit_monitor_changed(app, settings.monitor_name);
    }
    Ok(())
}

fn capture_geometry(
    window: &WebviewWindow,
    settings: &mut AppSettings,
    snap_edges: bool,
) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| select_monitor(window, settings.monitor_name.as_deref()))
        .ok_or_else(|| "没有可用显示器".to_string())?;
    let work = work_area(&monitor);
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let original_position = window.outer_position().map_err(|error| error.to_string())?;
    let mut position = original_position;

    if snap_edges {
        let threshold = (EDGE_SNAP_LOGICAL_PX * monitor.scale_factor()).round() as i32;
        let right = work.right.saturating_sub(size.width as i32);
        let bottom = work.bottom.saturating_sub(size.height as i32);
        if (position.x - work.left).abs() <= threshold {
            position.x = work.left;
        } else if (position.x - right).abs() <= threshold {
            position.x = right;
        }
        if (position.y - work.top).abs() <= threshold {
            position.y = work.top;
        } else if (position.y - bottom).abs() <= threshold {
            position.y = bottom;
        }
    }

    let position = clamp_position(position, size, work);
    if position != original_position {
        window
            .set_position(position)
            .map_err(|error| error.to_string())?;
    }
    settings.monitor_name = monitor.name().map(str::to_owned);
    settings.x_ratio = axis_ratio(position.x, work.left, work.width(), size.width);
    settings.y_ratio = axis_ratio(position.y, work.top, work.height(), size.height);
    Ok(())
}

fn apply_to_monitor(
    window: &WebviewWindow,
    monitor: &Monitor,
    settings: &mut AppSettings,
) -> Result<(), String> {
    let work = work_area(monitor);
    let maximum = maximum_scale_percent(work, monitor.scale_factor());
    settings.scale_percent = settings.scale_percent.min(maximum);
    let scale = f64::from(settings.scale_percent) / 100.0;
    window
        .set_size(LogicalSize::new(
            DESIGN_WIDTH * scale,
            DESIGN_HEIGHT * scale,
        ))
        .map_err(|error| error.to_string())?;

    let physical_size = PhysicalSize::new(
        (DESIGN_WIDTH * scale * monitor.scale_factor()).round() as u32,
        (DESIGN_HEIGHT * scale * monitor.scale_factor()).round() as u32,
    );
    let position = PhysicalPosition::new(
        axis_position(
            settings.x_ratio,
            work.left,
            work.width(),
            physical_size.width,
        ),
        axis_position(
            settings.y_ratio,
            work.top,
            work.height(),
            physical_size.height,
        ),
    );
    window
        .set_position(clamp_position(position, physical_size, work))
        .map_err(|error| error.to_string())?;
    settings.monitor_name = monitor.name().map(str::to_owned);
    Ok(())
}

fn persist_geometry(
    store: &SettingsStore,
    geometry: &AppSettings,
    include_scale: bool,
) -> Result<AppSettings, String> {
    store.mutate(|settings| {
        settings.monitor_name = geometry.monitor_name.clone();
        settings.x_ratio = geometry.x_ratio;
        settings.y_ratio = geometry.y_ratio;
        if include_scale {
            settings.scale_percent = geometry.scale_percent;
        }
    })
}

fn select_monitor(window: &WebviewWindow, name: Option<&str>) -> Option<Monitor> {
    let available = window.available_monitors().ok()?;
    if let Some(name) = name {
        if let Some(monitor) = available
            .iter()
            .find(|monitor| monitor.name().is_some_and(|value| value == name))
        {
            return Some(monitor.clone());
        }
    }
    window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| available.into_iter().next())
}

fn maximum_scale_percent(work: WorkArea, scale_factor: f64) -> u16 {
    let width_limit = f64::from(work.width()) / (DESIGN_WIDTH * scale_factor);
    let height_limit = f64::from(work.height()) / (DESIGN_HEIGHT * scale_factor);
    let raw = (width_limit.min(height_limit) * 100.0).floor() as u16;
    ((raw / 10) * 10).clamp(10, 200)
}

fn axis_ratio(position: i32, start: i32, extent: i32, window_extent: u32) -> f64 {
    let travel = extent.saturating_sub(window_extent as i32);
    if travel <= 0 {
        0.0
    } else {
        (f64::from(position.saturating_sub(start)) / f64::from(travel)).clamp(0.0, 1.0)
    }
}

fn axis_position(ratio: f64, start: i32, extent: i32, window_extent: u32) -> i32 {
    let travel = extent.saturating_sub(window_extent as i32).max(0);
    start.saturating_add((ratio.clamp(0.0, 1.0) * f64::from(travel)).round() as i32)
}

fn clamp_position(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    work: WorkArea,
) -> PhysicalPosition<i32> {
    let maximum_x = work.right.saturating_sub(size.width as i32).max(work.left);
    let maximum_y = work.bottom.saturating_sub(size.height as i32).max(work.top);
    PhysicalPosition::new(
        position.x.clamp(work.left, maximum_x),
        position.y.clamp(work.top, maximum_y),
    )
}

#[cfg(windows)]
fn work_area(monitor: &Monitor) -> WorkArea {
    use std::mem::size_of;
    use windows_sys::Win32::{
        Foundation::{POINT, RECT},
        Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST},
    };

    let position = monitor.position();
    let size = monitor.size();
    let point = POINT {
        x: position.x.saturating_add(size.width as i32 / 2),
        y: position.y.saturating_add(size.height as i32 / 2),
    };
    let handle = unsafe { MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST) };
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        rcMonitor: RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        },
        rcWork: RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        },
        dwFlags: 0,
    };
    if !handle.is_null() && unsafe { GetMonitorInfoW(handle, &mut info) } != 0 {
        WorkArea {
            left: info.rcWork.left,
            top: info.rcWork.top,
            right: info.rcWork.right,
            bottom: info.rcWork.bottom,
        }
    } else {
        full_monitor_area(monitor)
    }
}

#[cfg(not(windows))]
fn work_area(monitor: &Monitor) -> WorkArea {
    full_monitor_area(monitor)
}

fn full_monitor_area(monitor: &Monitor) -> WorkArea {
    let position = monitor.position();
    let size = monitor.size();
    WorkArea {
        left: position.x,
        top: position.y,
        right: position.x.saturating_add(size.width as i32),
        bottom: position.y.saturating_add(size.height as i32),
    }
}

fn emit_monitor_changed(app: &tauri::AppHandle, monitor_name: Option<String>) {
    let _ = app.emit("monitor-changed", MonitorChangedPayload { monitor_name });
}

fn main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ratios_support_negative_monitor_coordinates() {
        let ratio = axis_ratio(-960, -1920, 1920, 360);
        assert!((ratio - (960.0 / 1560.0)).abs() < 0.0001);
        assert_eq!(axis_position(ratio, -1920, 1920, 360), -960);
    }

    #[test]
    fn scale_limit_uses_work_area_and_dpi() {
        let work = WorkArea {
            left: 0,
            top: 0,
            right: 1280,
            bottom: 720,
        };
        assert_eq!(maximum_scale_percent(work, 1.0), 160);
        assert_eq!(maximum_scale_percent(work, 2.0), 80);
        let large_work = WorkArea {
            left: 0,
            top: 0,
            right: 4000,
            bottom: 2400,
        };
        assert_eq!(maximum_scale_percent(large_work, 1.0), 200);
    }

    #[test]
    fn clamp_keeps_window_inside_work_area() {
        let work = WorkArea {
            left: -1920,
            top: 0,
            right: 0,
            bottom: 1040,
        };
        assert_eq!(
            clamp_position(
                PhysicalPosition::new(-100, 1000),
                PhysicalSize::new(360, 440),
                work,
            ),
            PhysicalPosition::new(-360, 600)
        );
    }
}
