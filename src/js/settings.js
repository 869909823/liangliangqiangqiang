export const DISPLAY_MODES = Object.freeze(['desktop-only', 'normal', 'always-on-top']);
export const REDUCE_MOTION_MODES = Object.freeze(['system', 'reduce', 'full']);
export const SLEEP_OPTIONS = Object.freeze([0, 5, 15, 30]);

export const DEFAULT_SETTINGS = Object.freeze({
  version: 2,
  displayMode: 'desktop-only',
  scalePercent: 100,
  bubbleEnabled: true,
  autoCompanion: true,
  soundEnabled: false,
  muyuSoundEnabled: false,
  quizSoundEnabled: false,
  volumePercent: 25,
  sleepAfterMinutes: 15,
  positionLocked: false,
  edgeSnap: true,
  reduceMotion: 'system',
  monitorName: null,
  xRatio: 0.95,
  yRatio: 0.95,
  lastUpdateCheck: null
});

export const WEB_SETTING_KEYS = Object.freeze([
  'version',
  'scalePercent',
  'bubbleEnabled',
  'autoCompanion',
  'soundEnabled',
  'muyuSoundEnabled',
  'quizSoundEnabled',
  'volumePercent',
  'sleepAfterMinutes',
  'reduceMotion'
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function validChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback;
}

function validBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function validNullableString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function migrateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const migrated = { ...input };
  if (!('bubbleEnabled' in migrated) && 'bubbleVisible' in migrated) {
    migrated.bubbleEnabled = Boolean(migrated.bubbleVisible);
  }
  if (!('autoCompanion' in migrated) && 'autoMode' in migrated) {
    migrated.autoCompanion = Boolean(migrated.autoMode);
  }
  if (!('displayMode' in migrated) && typeof migrated.alwaysOnTop === 'boolean') {
    migrated.displayMode = migrated.alwaysOnTop ? 'always-on-top' : 'normal';
  }
  if (migrated.reduceMotion === 'never') migrated.reduceMotion = 'full';
  if (migrated.reduceMotion === 'always') migrated.reduceMotion = 'reduce';
  if (!('muyuSoundEnabled' in migrated) && 'soundEnabled' in migrated) migrated.muyuSoundEnabled = Boolean(migrated.soundEnabled);
  if (!('quizSoundEnabled' in migrated)) migrated.quizSoundEnabled = false;
  return migrated;
}

export function validateSettings(input) {
  const value = migrateSettings(input);
  const rawScale = Number(value.scalePercent);
  const rawVolume = Number(value.volumePercent);
  const rawSleep = Number(value.sleepAfterMinutes);
  const rawX = Number(value.xRatio);
  const rawY = Number(value.yRatio);

  return {
    version: 2,
    displayMode: validChoice(value.displayMode, DISPLAY_MODES, DEFAULT_SETTINGS.displayMode),
    scalePercent: Number.isFinite(rawScale)
      ? clamp(Math.round(rawScale / 10) * 10, 10, 200)
      : DEFAULT_SETTINGS.scalePercent,
    bubbleEnabled: validBoolean(value.bubbleEnabled, DEFAULT_SETTINGS.bubbleEnabled),
    autoCompanion: validBoolean(value.autoCompanion, DEFAULT_SETTINGS.autoCompanion),
    soundEnabled: validBoolean(value.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
    muyuSoundEnabled: validBoolean(value.muyuSoundEnabled, DEFAULT_SETTINGS.muyuSoundEnabled),
    quizSoundEnabled: validBoolean(value.quizSoundEnabled, DEFAULT_SETTINGS.quizSoundEnabled),
    volumePercent: Number.isFinite(rawVolume)
      ? clamp(Math.round(rawVolume), 0, 100)
      : DEFAULT_SETTINGS.volumePercent,
    sleepAfterMinutes: SLEEP_OPTIONS.includes(rawSleep)
      ? rawSleep
      : DEFAULT_SETTINGS.sleepAfterMinutes,
    positionLocked: validBoolean(value.positionLocked, DEFAULT_SETTINGS.positionLocked),
    edgeSnap: validBoolean(value.edgeSnap, DEFAULT_SETTINGS.edgeSnap),
    reduceMotion: validChoice(value.reduceMotion, REDUCE_MOTION_MODES, DEFAULT_SETTINGS.reduceMotion),
    monitorName: validNullableString(value.monitorName),
    xRatio: Number.isFinite(rawX) ? clamp(rawX, 0, 1) : DEFAULT_SETTINGS.xRatio,
    yRatio: Number.isFinite(rawY) ? clamp(rawY, 0, 1) : DEFAULT_SETTINGS.yRatio,
    lastUpdateCheck: validNullableString(value.lastUpdateCheck)
  };
}

export function mergeSettings(current, patch) {
  return validateSettings({ ...current, ...patch });
}

export function pickWebSettings(settings) {
  const validated = validateSettings(settings);
  return Object.fromEntries(WEB_SETTING_KEYS.map(key => [key, validated[key]]));
}

export function shouldReduceMotion(setting, systemPreference = false) {
  if (setting === 'reduce') return true;
  if (setting === 'full') return false;
  return Boolean(systemPreference);
}
