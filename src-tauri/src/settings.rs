use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

pub const SETTINGS_VERSION: u8 = 2;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DisplayMode {
    DesktopOnly,
    Normal,
    AlwaysOnTop,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub version: u8,
    pub display_mode: DisplayMode,
    pub scale_percent: u16,
    pub bubble_enabled: bool,
    pub auto_companion: bool,
    pub sound_enabled: bool,
    pub muyu_sound_enabled: bool,
    pub quiz_sound_enabled: bool,
    pub volume_percent: u8,
    pub sleep_after_minutes: u16,
    pub position_locked: bool,
    pub edge_snap: bool,
    pub reduce_motion: String,
    pub monitor_name: Option<String>,
    pub x_ratio: f64,
    pub y_ratio: f64,
    pub last_update_check: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            display_mode: DisplayMode::DesktopOnly,
            scale_percent: 100,
            bubble_enabled: true,
            auto_companion: true,
            sound_enabled: false,
            muyu_sound_enabled: false,
            quiz_sound_enabled: false,
            volume_percent: 25,
            sleep_after_minutes: 15,
            position_locked: false,
            edge_snap: true,
            reduce_motion: "system".into(),
            monitor_name: None,
            x_ratio: 0.95,
            y_ratio: 0.95,
            last_update_check: None,
        }
    }
}

impl AppSettings {
    pub fn validate(mut self) -> Result<Self, String> {
        if !(10..=200).contains(&self.scale_percent) || self.scale_percent % 10 != 0 {
            return Err("scalePercent 必须是 10–200 之间、步进为 10 的整数".into());
        }
        if self.volume_percent > 100 {
            return Err("volumePercent 必须是 0–100 之间的整数".into());
        }
        if !matches!(self.sleep_after_minutes, 0 | 5 | 15 | 30) {
            return Err("sleepAfterMinutes 只能是 0、5、15 或 30".into());
        }
        if !matches!(self.reduce_motion.as_str(), "system" | "reduce" | "full") {
            return Err("reduceMotion 只能是 system、reduce 或 full".into());
        }

        self.version = SETTINGS_VERSION;
        self.x_ratio = self.x_ratio.clamp(0.0, 1.0);
        self.y_ratio = self.y_ratio.clamp(0.0, 1.0);
        if self.monitor_name.as_ref().is_some_and(|name| name.len() > 256) {
            self.monitor_name = None;
        }
        Ok(self)
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct SettingsPatch {
    pub display_mode: Option<DisplayMode>,
    pub scale_percent: Option<u16>,
    pub bubble_enabled: Option<bool>,
    pub auto_companion: Option<bool>,
    pub sound_enabled: Option<bool>,
    pub muyu_sound_enabled: Option<bool>,
    pub quiz_sound_enabled: Option<bool>,
    pub volume_percent: Option<u8>,
    pub sleep_after_minutes: Option<u16>,
    pub position_locked: Option<bool>,
    pub edge_snap: Option<bool>,
    pub reduce_motion: Option<String>,
    pub last_update_check: Option<String>,
}

impl SettingsPatch {
    pub fn apply(self, settings: &mut AppSettings) {
        if let Some(value) = self.display_mode {
            settings.display_mode = value;
        }
        if let Some(value) = self.scale_percent {
            settings.scale_percent = value;
        }
        if let Some(value) = self.bubble_enabled {
            settings.bubble_enabled = value;
        }
        if let Some(value) = self.auto_companion {
            settings.auto_companion = value;
        }
        if let Some(value) = self.sound_enabled {
            settings.sound_enabled = value;
        }
        if let Some(value) = self.muyu_sound_enabled {
            settings.muyu_sound_enabled = value;
        }
        if let Some(value) = self.quiz_sound_enabled {
            settings.quiz_sound_enabled = value;
        }
        if let Some(value) = self.volume_percent {
            settings.volume_percent = value;
        }
        if let Some(value) = self.sleep_after_minutes {
            settings.sleep_after_minutes = value;
        }
        if let Some(value) = self.position_locked {
            settings.position_locked = value;
        }
        if let Some(value) = self.edge_snap {
            settings.edge_snap = value;
        }
        if let Some(value) = self.reduce_motion {
            settings.reduce_motion = value;
        }
        if let Some(value) = self.last_update_check {
            settings.last_update_check = Some(value);
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    value: Mutex<AppSettings>,
}

impl SettingsStore {
    pub fn load(config_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
        let path = config_dir.join("settings.json");
        let value = if path.exists() {
            match read_settings(&path) {
                Ok(value) => value,
                Err(_) => {
                    backup_corrupt_settings(&path);
                    AppSettings::default()
                }
            }
        } else {
            AppSettings::default()
        };
        atomic_write(&path, &value)?;
        Ok(Self {
            path,
            value: Mutex::new(value),
        })
    }

    pub fn get(&self) -> AppSettings {
        self.value
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn mutate(&self, update: impl FnOnce(&mut AppSettings)) -> Result<AppSettings, String> {
        let mut guard = self
            .value
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut next = guard.clone();
        update(&mut next);
        next = next.validate()?;
        atomic_write(&self.path, &next)?;
        *guard = next.clone();
        Ok(next)
    }

    pub fn replace(&self, next: AppSettings) -> Result<AppSettings, String> {
        let next = next.validate()?;
        atomic_write(&self.path, &next)?;
        *self
            .value
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = next.clone();
        Ok(next)
    }
}

fn read_settings(path: &Path) -> Result<AppSettings, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str::<AppSettings>(&contents)
        .map_err(|error| error.to_string())?
        .validate()
}

fn backup_corrupt_settings(path: &Path) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0);
    let backup = path.with_file_name(format!("settings.corrupt-{timestamp}.json"));
    let _ = fs::rename(path, backup);
}

fn atomic_write(path: &Path, settings: &AppSettings) -> Result<(), String> {
    let temporary = path.with_extension("json.tmp");
    let serialized = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    let mut file = fs::File::create(&temporary).map_err(|error| error.to_string())?;
    file.write_all(&serialized)
        .and_then(|_| file.sync_all())
        .map_err(|error| error.to_string())?;
    replace_file(&temporary, path)
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain([0]).collect();
    let destination_wide: Vec<u16> = destination.as_os_str().encode_wide().chain([0]).collect();
    let result = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        let error = std::io::Error::last_os_error().to_string();
        let _ = fs::remove_file(source);
        Err(error)
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(source, destination).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_v2_contract() {
        let settings = AppSettings::default();
        assert_eq!(settings.display_mode, DisplayMode::DesktopOnly);
        assert_eq!(settings.scale_percent, 100);
        assert_eq!(settings.volume_percent, 25);
        assert_eq!(settings.sleep_after_minutes, 15);
    }

    #[test]
    fn rejects_invalid_scale_step() {
        let settings = AppSettings {
            scale_percent: 105,
            ..AppSettings::default()
        };
        assert!(settings.validate().is_err());
    }

    #[test]
    fn migrates_partial_settings_to_v2_defaults() {
        let settings = serde_json::from_str::<AppSettings>(r#"{"version":1,"soundEnabled":true}"#)
            .unwrap()
            .validate()
            .unwrap();
        assert_eq!(settings.version, SETTINGS_VERSION);
        assert!(settings.sound_enabled);
        assert_eq!(settings.scale_percent, 100);
    }

    #[test]
    fn clamps_saved_position_ratios() {
        let settings = AppSettings {
            x_ratio: -1.0,
            y_ratio: 3.0,
            ..AppSettings::default()
        }
        .validate()
        .unwrap();
        assert_eq!(settings.x_ratio, 0.0);
        assert_eq!(settings.y_ratio, 1.0);
    }
}
