import {
  DEFAULT_SETTINGS,
  mergeSettings,
  pickWebSettings,
  validateSettings
} from './settings.js';

const STORAGE_KEY = 'liangliangqiangqiang.settings.v2';

function versionParts(version) {
  const [core, prerelease = ''] = String(version || '').replace(/^v/i, '').split('-', 2);
  return {
    core: core.split('.').map(part => Number.parseInt(part, 10) || 0),
    prerelease: prerelease ? prerelease.split('.') : []
  };
}

export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.core.length, b.core.length, 3);
  for (let index = 0; index < length; index += 1) {
    const difference = (a.core[index] || 0) - (b.core[index] || 0);
    if (difference) return Math.sign(difference);
  }
  if (!a.prerelease.length && !b.prerelease.length) return 0;
  if (!a.prerelease.length) return 1;
  if (!b.prerelease.length) return -1;
  const preLength = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < preLength; index += 1) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    const aNumber = /^\d+$/.test(a.prerelease[index]) ? Number(a.prerelease[index]) : null;
    const bNumber = /^\d+$/.test(b.prerelease[index]) ? Number(b.prerelease[index]) : null;
    if (aNumber !== null && bNumber !== null && aNumber !== bNumber) return Math.sign(aNumber - bNumber);
    if (aNumber !== null && bNumber === null) return -1;
    if (aNumber === null && bNumber !== null) return 1;
    const comparison = a.prerelease[index].localeCompare(b.prerelease[index]);
    if (comparison) return Math.sign(comparison);
  }
  return 0;
}

export function selectUpdateRelease(releases, currentVersion, channel = 'stable') {
  return (Array.isArray(releases) ? releases : [releases])
    .filter(release => release && !release.draft)
    .filter(release => channel === 'beta' ? release.prerelease : !release.prerelease)
    .filter(release => compareVersions(release.tag_name, currentVersion) > 0)
    .sort((left, right) => compareVersions(right.tag_name, left.tag_name))[0] || null;
}

export function isTauriEnvironment(host = window) {
  return Boolean(host.__TAURI_INTERNALS__ || host.__TAURI__?.core?.invoke || host.__TAURI__?.tauri?.invoke);
}

export class WebPlatform {
  constructor(host = window) {
    this.host = host;
    this.isTauri = false;
  }

  async getSettings() {
    try {
      const stored = JSON.parse(this.host.localStorage.getItem(STORAGE_KEY) || 'null');
      return validateSettings({ ...DEFAULT_SETTINGS, ...stored, displayMode: 'normal' });
    } catch (_) {
      return validateSettings({ ...DEFAULT_SETTINGS, displayMode: 'normal' });
    }
  }

  async updateSettings(patch) {
    const current = await this.getSettings();
    const next = mergeSettings(current, patch);
    try {
      this.host.localStorage.setItem(STORAGE_KEY, JSON.stringify(pickWebSettings(next)));
    } catch (_) {}
    const EventConstructor = this.host.CustomEvent || CustomEvent;
    this.host.dispatchEvent(new EventConstructor('settings-changed', { detail: next }));
    return next;
  }

  async setDisplayMode(mode) {
    return this.updateSettings({ displayMode: mode });
  }

  async setScalePercent(percent) {
    return this.updateSettings({ scalePercent: percent });
  }

  async resetWindowPosition() {
    return null;
  }

  async setClickThrough() {
    return false;
  }

  async startDragging() {
    return false;
  }

  async getIdleMilliseconds() {
    return null;
  }

  async checkForUpdates() {
    const registration = await this.host.navigator?.serviceWorker?.getRegistration?.();
    await registration?.update?.();
    return { available: false };
  }

  openExternal(url) {
    this.host.open(url, '_blank', 'noopener,noreferrer');
  }

  listen(eventName, handler) {
    const listener = event => handler(event.detail);
    this.host.addEventListener(eventName, listener);
    return () => this.host.removeEventListener(eventName, listener);
  }
}

export class TauriPlatform {
  constructor(host = window) {
    this.host = host;
    this.isTauri = true;
    const invoke = host.__TAURI__?.core?.invoke || host.__TAURI__?.tauri?.invoke;
    this.invoke = (...args) => invoke(...args);
    this.listenToEvent = host.__TAURI__?.event?.listen;
    this.currentWindow = host.__TAURI__?.window?.getCurrentWindow?.();
    this.idleCommandAvailable = true;
  }

  async getSettings() {
    return validateSettings(await this.invoke('get_settings'));
  }

  async updateSettings(patch) {
    const result = await this.invoke('update_settings', { patch });
    return result ? validateSettings(result) : null;
  }

  async setDisplayMode(mode) {
    const result = await this.invoke('set_display_mode', { mode });
    return result ? validateSettings(result) : null;
  }

  async setScalePercent(percent) {
    const result = await this.invoke('set_scale_percent', { percent });
    return result ? validateSettings(result) : null;
  }

  async resetWindowPosition() {
    return this.invoke('reset_window_position');
  }

  async setClickThrough(enabled) {
    return this.invoke('set_click_through', { enabled });
  }

  async startDragging() {
    return this.currentWindow?.startDragging?.();
  }

  async getIdleMilliseconds() {
    if (!this.idleCommandAvailable) return null;
    try {
      return await this.invoke('get_system_idle_ms');
    } catch (_) {
      this.idleCommandAvailable = false;
      return null;
    }
  }

  async checkForUpdates() {
    const request = await this.invoke('check_for_updates');
    if (!request?.shouldFetch) {
      return { available: false, throttled: Boolean(request?.throttled) };
    }
    const response = await this.host.fetch(request.apiUrl, {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error(`GitHub update check failed: ${response.status}`);
    const releases = await response.json();
    const release = selectUpdateRelease(releases, request.currentVersion, request.channel);
    if (!release) return { available: false, throttled: false };
    const update = {
      available: true,
      version: String(release.tag_name || '').replace(/^v/i, ''),
      url: release.html_url || request.url
    };
    const EventConstructor = this.host.CustomEvent || CustomEvent;
    this.host.dispatchEvent(new EventConstructor('update-available', {
      detail: { version: update.version, url: update.url }
    }));
    return update;
  }

  openExternal(url) {
    const opener = this.host.__TAURI__?.opener?.openUrl;
    if (opener) opener(url);
    else this.host.open(url, '_blank', 'noopener,noreferrer');
  }

  listen(eventName, handler) {
    if (!this.listenToEvent) return () => {};
    let disposed = false;
    let unlisten = null;
    this.listenToEvent(eventName, event => handler(event.payload)).then(callback => {
      if (disposed) callback();
      else unlisten = callback;
    });
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }
}

export function createPlatform(host = window) {
  return isTauriEnvironment(host) ? new TauriPlatform(host) : new WebPlatform(host);
}
