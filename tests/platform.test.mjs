import assert from 'node:assert/strict';
import test from 'node:test';
import { WebPlatform, isTauriEnvironment } from '../src/js/platform.js';

function createHost(stored = null) {
  const events = [];
  const storage = new Map();
  if (stored !== null) storage.set('liangliangqiangqiang.settings.v2', stored);
  return {
    events,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    dispatchEvent: event => events.push(event),
    navigator: {},
    open() {}
  };
}

test('手机版设置损坏时恢复默认值且不影响启动', async () => {
  const platform = new WebPlatform(createHost('{broken json'));
  const settings = await platform.getSettings();
  assert.equal(settings.version, 2);
  assert.equal(settings.displayMode, 'normal');
  assert.equal(settings.scalePercent, 100);
  assert.equal(settings.soundEnabled, true);
});

test('手机版只持久化公共字段并立即发出 settings-changed', async () => {
  const host = createHost();
  globalThis.CustomEvent ??= class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  };
  const platform = new WebPlatform(host);
  const next = await platform.updateSettings({
    scalePercent: 131,
    soundEnabled: true,
    positionLocked: true
  });
  const saved = JSON.parse(host.localStorage.getItem('liangliangqiangqiang.settings.v2'));

  assert.equal(next.scalePercent, 130);
  assert.equal(saved.scalePercent, 130);
  assert.equal(saved.soundEnabled, true);
  assert.equal('positionLocked' in saved, false);
  assert.equal(host.events[0].type, 'settings-changed');
  assert.equal(host.events[0].detail.scalePercent, 130);
});

test('平台检测只在存在 Tauri 桥接时返回真', () => {
  assert.equal(isTauriEnvironment({}), false);
  assert.equal(isTauriEnvironment({ __TAURI_INTERNALS__: {} }), true);
  assert.equal(isTauriEnvironment({ __TAURI__: { core: { invoke() {} } } }), true);
});
