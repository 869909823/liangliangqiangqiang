import { PetAudioManager } from './js/audio-manager.js';
import { AMBIENT_DIALOGUES, randomDialogue } from './js/dialogues.js';
import { createPlatform } from './js/platform.js';
import { CompanionScheduler } from './js/scheduler.js';
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  shouldReduceMotion,
  validateSettings
} from './js/settings.js';
import { MAIN_STATES, PetStateMachine } from './js/state-machine.js';

const DESIGN_WIDTH = 360;
const DESIGN_HEIGHT = 440;
const AMBIENT_DURATIONS = Object.freeze({
  blink: 480,
  clickReaction: 600,
  stretch: 2200,
  yawn: 1800,
  snack: 2400,
  peek: 2600
});

const elements = {
  pet: document.querySelector('#pet'),
  cat: document.querySelector('#cat'),
  bubble: document.querySelector('#bubble'),
  controls: document.querySelector('#controls'),
  menuToggle: document.querySelector('#menu-toggle'),
  autoMode: document.querySelector('#auto-mode'),
  openSettings: document.querySelector('#open-settings'),
  closeSettings: document.querySelector('#close-settings'),
  settingsPanel: document.querySelector('#settings-panel'),
  displayMode: document.querySelector('#display-mode'),
  scalePercent: document.querySelector('#scale-percent'),
  scaleValue: document.querySelector('#scale-value'),
  bubbleEnabled: document.querySelector('#bubble-enabled'),
  autoCompanion: document.querySelector('#auto-companion'),
  soundEnabled: document.querySelector('#sound-enabled'),
  volumePercent: document.querySelector('#volume-percent'),
  volumeValue: document.querySelector('#volume-value'),
  volumeRow: document.querySelector('#volume-row'),
  sleepAfter: document.querySelector('#sleep-after'),
  positionLocked: document.querySelector('#position-locked'),
  edgeSnap: document.querySelector('#edge-snap'),
  reduceMotion: document.querySelector('#reduce-motion'),
  checkUpdates: document.querySelector('#check-updates'),
  resetPosition: document.querySelector('#reset-position'),
  restoreDefaults: document.querySelector('#restore-defaults'),
  settingsNote: document.querySelector('#settings-note'),
  updateBanner: document.querySelector('#update-banner'),
  toast: document.querySelector('#toast')
};

const stateButtons = [...document.querySelectorAll('[data-state]')];
const scalePresetButtons = [...document.querySelectorAll('[data-scale]')];
const platform = createPlatform();
const audio = new PetAudioManager();
const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');

let settings = validateSettings({
  ...DEFAULT_SETTINGS,
  displayMode: platform.isTauri ? DEFAULT_SETTINGS.displayMode : 'normal'
});
let scheduler = null;
let ambientTimer = null;
let toastTimer = null;
let pointerStart = null;
let dragged = false;
let desktopWindowVisible = true;
let pwaRegistration = null;
let pendingUpdate = null;
let pwaReloadRequested = false;

document.body.classList.add(platform.isTauri ? 'is-tauri' : 'is-web', 'motion-ready');

function ambientClass(action) {
  return `ambient-${action.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
}

function clearAmbient() {
  if (ambientTimer !== null) clearTimeout(ambientTimer);
  ambientTimer = null;
  for (const action of Object.keys(AMBIENT_DURATIONS)) {
    elements.pet.classList.remove(ambientClass(action));
  }
}

function startAmbient(action, { announce = false } = {}) {
  if (!(action in AMBIENT_DURATIONS)) return false;
  if (action !== 'clickReaction' && stateMachine.state !== 'idle') return false;
  clearAmbient();
  const className = ambientClass(action);
  elements.pet.classList.remove(className);
  void elements.cat.offsetWidth;
  elements.pet.classList.add(className);
  if (announce && AMBIENT_DIALOGUES[action]) elements.bubble.textContent = AMBIENT_DIALOGUES[action];
  ambientTimer = setTimeout(() => {
    elements.pet.classList.remove(className);
    ambientTimer = null;
  }, AMBIENT_DURATIONS[action]);
  return true;
}

function renderState({ state, previousState, options }) {
  for (const knownState of MAIN_STATES) elements.pet.classList.remove(`state-${knownState}`);
  if (state === previousState) void elements.pet.offsetWidth;
  elements.pet.classList.add(`state-${state}`);
  document.body.dataset.petState = state;
  stateButtons.forEach(button => button.classList.toggle('active', button.dataset.state === state));
  if (options.announce !== false) elements.bubble.textContent = randomDialogue(state);
  if (state === 'moyu') {
    audio.playMoyuSequence({ automatic: options.source === 'scheduler' });
  }
  if (state === 'sleeping') audio.stop();
  scheduler?.noteStateChange(state, previousState);
}

const stateMachine = new PetStateMachine({
  initialState: 'idle',
  onBeforeChange: () => {
    clearAmbient();
    audio.stop();
  },
  onChange: renderState
});

function effectiveReducedMotion() {
  return shouldReduceMotion(settings.reduceMotion, motionPreference?.matches);
}

function refreshScale() {
  let scale = settings.scalePercent / 100;
  if (!platform.isTauri) {
    const fitScale = Math.min(
      Math.max(0.1, (window.innerWidth - 4) / DESIGN_WIDTH),
      Math.max(0.1, (window.innerHeight - 4) / DESIGN_HEIGHT)
    );
    scale = Math.min(scale, fitScale);
  }
  document.documentElement.style.setProperty('--pet-scale', String(scale));
}

function syncSettingsControls() {
  elements.displayMode.value = settings.displayMode;
  elements.scalePercent.value = String(settings.scalePercent);
  elements.scaleValue.textContent = `${settings.scalePercent}%`;
  elements.bubbleEnabled.checked = settings.bubbleEnabled;
  elements.autoCompanion.checked = settings.autoCompanion;
  elements.soundEnabled.checked = settings.soundEnabled;
  elements.volumePercent.value = String(settings.volumePercent);
  elements.volumeValue.textContent = `${settings.volumePercent}%`;
  elements.volumePercent.disabled = !settings.soundEnabled;
  elements.volumeRow.classList.toggle('disabled', !settings.soundEnabled);
  elements.sleepAfter.value = String(settings.sleepAfterMinutes);
  elements.positionLocked.checked = settings.positionLocked;
  elements.edgeSnap.checked = settings.edgeSnap;
  elements.reduceMotion.value = settings.reduceMotion;
  elements.autoMode.classList.toggle('active', settings.autoCompanion);
  elements.autoMode.setAttribute('aria-pressed', String(settings.autoCompanion));
  scalePresetButtons.forEach(button => {
    button.classList.toggle('active', Number(button.dataset.scale) === settings.scalePercent);
  });
}

function replaceSettings(next) {
  const previous = settings;
  settings = validateSettings(next);
  const reducedMotion = effectiveReducedMotion();
  elements.pet.classList.toggle('bubble-disabled', !settings.bubbleEnabled);
  elements.pet.classList.toggle('position-locked', settings.positionLocked);
  document.body.classList.toggle('reduce-motion', reducedMotion);
  audio.configure({
    soundEnabled: settings.soundEnabled,
    volumePercent: settings.volumePercent,
    reducedMotion
  });
  if (previous.autoCompanion && !settings.autoCompanion) clearAmbient();
  refreshScale();
  syncSettingsControls();
}

async function persistSettings(patch, operation = 'update') {
  const previous = settings;
  const optimistic = mergeSettings(settings, patch);
  replaceSettings(optimistic);
  try {
    let result;
    if (operation === 'displayMode') result = await platform.setDisplayMode(optimistic.displayMode);
    else if (operation === 'scale') result = await platform.setScalePercent(optimistic.scalePercent);
    else result = await platform.updateSettings(patch);
    if (result) replaceSettings(result);
    return true;
  } catch (error) {
    replaceSettings(previous);
    showToast('设置保存失败，请再试一次。');
    console.warn('Unable to save pet settings', error);
    return false;
  }
}

function setSettingsOpen(open) {
  elements.settingsPanel.classList.toggle('open', open);
  elements.settingsPanel.setAttribute('aria-hidden', String(!open));
  if (open) {
    elements.controls.classList.remove('open');
    elements.menuToggle.setAttribute('aria-expanded', 'false');
    elements.closeSettings.focus();
  } else {
    elements.openSettings.focus();
  }
}

function setControlsOpen(open) {
  elements.controls.classList.toggle('open', open);
  elements.menuToggle.setAttribute('aria-expanded', String(open));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2400);
}

function setSettingsNote(message) {
  elements.settingsNote.textContent = message;
}

function setVisibleState() {
  const visible = !document.hidden && desktopWindowVisible;
  document.body.classList.toggle('app-paused', !visible);
  if (visible) {
    stateMachine.resume();
    audio.setVisible(true);
    scheduler?.setVisible(true);
  } else {
    clearAmbient();
    stateMachine.pause();
    audio.setVisible(false);
    scheduler?.setVisible(false);
  }
}

function showUpdate(update) {
  if (!update) return;
  pendingUpdate = update;
  elements.updateBanner.textContent = update.type === 'pwa'
    ? '新版本已准备好，点击刷新'
    : `发现 ${update.version || '新版本'}，点击打开下载页`;
  elements.updateBanner.hidden = false;
}

async function activatePwaUpdate() {
  const registration = pwaRegistration || await navigator.serviceWorker?.getRegistration?.();
  if (!registration?.waiting) {
    await registration?.update?.();
    setSettingsNote('正在准备新版本，请稍候再点一次。');
    return;
  }
  pwaReloadRequested = true;
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

async function handleUpdateBanner() {
  if (pendingUpdate?.type === 'pwa') {
    await activatePwaUpdate();
    return;
  }
  if (pendingUpdate?.url) platform.openExternal(pendingUpdate.url);
}

async function checkForUpdates({ silent = false } = {}) {
  if (!silent) setSettingsNote('正在检查更新……');
  try {
    const result = await platform.checkForUpdates();
    if (result?.available) {
      showUpdate({ type: 'release', ...result });
      if (!silent) setSettingsNote(`发现 ${result.version || '新版本'}。`);
    } else if (!silent) {
      setSettingsNote(result?.throttled ? '今天已经检查过更新。' : '目前已是最新版本。');
    }
  } catch (error) {
    if (!silent) setSettingsNote('暂时无法检查更新。');
    console.warn('Unable to check for updates', error);
  }
}

function noteInteraction() {
  scheduler?.noteInteraction();
  if (!audio.unlocked) audio.unlock();
}

function bindInteractions() {
  window.addEventListener('pointerdown', noteInteraction, { passive: true });
  window.addEventListener('keydown', noteInteraction, { passive: true });
  window.addEventListener('resize', refreshScale);
  document.addEventListener('visibilitychange', setVisibleState);
  motionPreference?.addEventListener?.('change', () => replaceSettings(settings));

  elements.menuToggle.addEventListener('click', () => {
    setControlsOpen(!elements.controls.classList.contains('open'));
  });
  elements.openSettings.addEventListener('click', () => setSettingsOpen(true));
  elements.closeSettings.addEventListener('click', () => setSettingsOpen(false));

  stateButtons.forEach(button => button.addEventListener('click', () => {
    stateMachine.setState(button.dataset.state, { source: 'manual', announce: true });
    setControlsOpen(false);
  }));

  elements.autoMode.addEventListener('click', () => {
    persistSettings({ autoCompanion: !settings.autoCompanion });
  });

  elements.cat.addEventListener('pointerdown', event => {
    pointerStart = { x: event.clientX, y: event.clientY };
    dragged = false;
  });

  elements.cat.addEventListener('pointermove', async event => {
    if (!platform.isTauri || settings.positionLocked || !pointerStart || dragged) return;
    if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) < 5) return;
    dragged = true;
    try {
      await platform.startDragging();
    } catch (error) {
      console.warn('Unable to drag pet window', error);
    }
  });

  elements.cat.addEventListener('pointerup', () => { pointerStart = null; });
  elements.cat.addEventListener('pointercancel', () => { pointerStart = null; });

  elements.cat.addEventListener('click', () => {
    if (dragged) {
      dragged = false;
      return;
    }
    if (stateMachine.state === 'sleeping') {
      stateMachine.setState('idle', { source: 'click', announce: true });
      return;
    }
    elements.bubble.textContent = Math.random() > 0.45
      ? AMBIENT_DIALOGUES.clickReaction
      : randomDialogue(stateMachine.state);
    startAmbient('clickReaction');
  });

  elements.cat.addEventListener('contextmenu', event => {
    event.preventDefault();
    persistSettings({ bubbleEnabled: !settings.bubbleEnabled });
  });

  elements.displayMode.addEventListener('change', event => {
    persistSettings({ displayMode: event.target.value }, 'displayMode');
  });
  elements.scalePercent.addEventListener('input', event => {
    elements.scaleValue.textContent = `${event.target.value}%`;
  });
  elements.scalePercent.addEventListener('change', event => {
    persistSettings({ scalePercent: Number(event.target.value) }, 'scale');
  });
  scalePresetButtons.forEach(button => button.addEventListener('click', () => {
    persistSettings({ scalePercent: Number(button.dataset.scale) }, 'scale');
  }));
  elements.bubbleEnabled.addEventListener('change', event => persistSettings({ bubbleEnabled: event.target.checked }));
  elements.autoCompanion.addEventListener('change', event => persistSettings({ autoCompanion: event.target.checked }));
  elements.soundEnabled.addEventListener('change', event => persistSettings({ soundEnabled: event.target.checked }));
  elements.volumePercent.addEventListener('input', event => {
    elements.volumeValue.textContent = `${event.target.value}%`;
  });
  elements.volumePercent.addEventListener('change', event => persistSettings({ volumePercent: Number(event.target.value) }));
  elements.sleepAfter.addEventListener('change', event => persistSettings({ sleepAfterMinutes: Number(event.target.value) }));
  elements.positionLocked.addEventListener('change', event => persistSettings({ positionLocked: event.target.checked }));
  elements.edgeSnap.addEventListener('change', event => persistSettings({ edgeSnap: event.target.checked }));
  elements.reduceMotion.addEventListener('change', event => persistSettings({ reduceMotion: event.target.value }));

  elements.resetPosition.addEventListener('click', async () => {
    try {
      await platform.resetWindowPosition();
      setSettingsNote('已重置到主显示器右下角。');
    } catch (_) {
      setSettingsNote('重置位置失败。');
    }
  });
  elements.restoreDefaults.addEventListener('click', async () => {
    const defaults = {
      displayMode: platform.isTauri ? 'desktop-only' : 'normal',
      scalePercent: DEFAULT_SETTINGS.scalePercent,
      bubbleEnabled: DEFAULT_SETTINGS.bubbleEnabled,
      autoCompanion: DEFAULT_SETTINGS.autoCompanion,
      soundEnabled: DEFAULT_SETTINGS.soundEnabled,
      volumePercent: DEFAULT_SETTINGS.volumePercent,
      sleepAfterMinutes: DEFAULT_SETTINGS.sleepAfterMinutes,
      positionLocked: DEFAULT_SETTINGS.positionLocked,
      edgeSnap: DEFAULT_SETTINGS.edgeSnap,
      reduceMotion: DEFAULT_SETTINGS.reduceMotion
    };
    await persistSettings(defaults);
    setSettingsNote('已恢复默认设置。');
  });
  elements.checkUpdates.addEventListener('click', () => checkForUpdates());
  elements.updateBanner.addEventListener('click', handleUpdateBanner);

  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (elements.settingsPanel.classList.contains('open')) setSettingsOpen(false);
    else setControlsOpen(false);
  });

  window.addEventListener('message', event => {
    if (event.data?.type === 'pet:set-state') {
      stateMachine.setState(event.data.state, { source: 'external', announce: true });
    }
  });
}

function bindPlatformEvents() {
  platform.listen('settings-changed', payload => {
    if (payload) replaceSettings(payload);
  });
  platform.listen('window-visibility-changed', payload => {
    desktopWindowVisible = payload?.visible !== false;
    setVisibleState();
  });
  platform.listen('monitor-changed', payload => {
    if (payload?.monitorName) showToast(`已切换到 ${payload.monitorName}`);
  });
  platform.listen('update-available', payload => {
    if (payload) showUpdate({ type: 'release', ...payload });
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'pwa:update-available') {
      showUpdate({ type: 'pwa', version: event.data.version });
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!pwaReloadRequested) return;
    pwaReloadRequested = false;
    location.reload();
  });
  try {
    pwaRegistration = await navigator.serviceWorker.register('./service-worker.js');
    if (pwaRegistration.waiting) showUpdate({ type: 'pwa' });
    pwaRegistration.addEventListener('updatefound', () => {
      const installing = pwaRegistration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdate({ type: 'pwa' });
        }
      });
    });
  } catch (error) {
    console.warn('Unable to register offline mode', error);
  }
}

async function boot() {
  bindInteractions();
  bindPlatformEvents();

  try {
    settings = validateSettings(await platform.getSettings());
  } catch (error) {
    console.warn('Unable to load pet settings; using defaults', error);
    showToast('设置读取失败，已使用默认值。');
  }
  replaceSettings(settings);
  renderState({ state: 'idle', previousState: null, options: { announce: false } });

  scheduler = new CompanionScheduler({
    getState: () => stateMachine.state,
    getSettings: () => settings,
    getIdleMilliseconds: () => platform.getIdleMilliseconds(),
    onAmbient: action => startAmbient(action),
    onState: (state, options) => stateMachine.setState(state, options)
  });
  scheduler.start();
  scheduler.runCycle({ allowCompanion: false });
  setVisibleState();
  registerServiceWorker();

  if (platform.isTauri) setTimeout(() => checkForUpdates({ silent: true }), 2500);
}

boot().catch(error => {
  console.error('Unable to start 踉踉跄跄', error);
  elements.bubble.textContent = '哎呀，启动时踉跄了一下。';
});
