import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SETTINGS,
  migrateSettings,
  pickWebSettings,
  shouldReduceMotion,
  validateSettings
} from '../src/js/settings.js';

test('空设置恢复 V2 安全默认值', () => {
  assert.deepEqual(validateSettings(null), { ...DEFAULT_SETTINGS });
  assert.equal(DEFAULT_SETTINGS.displayMode, 'desktop-only');
  assert.equal(DEFAULT_SETTINGS.soundEnabled, false);
  assert.equal(DEFAULT_SETTINGS.volumePercent, 25);
});

test('缩放、音量、位置比例会量化或限制在允许范围', () => {
  const settings = validateSettings({
    scalePercent: 167,
    volumePercent: -4,
    xRatio: -1,
    yRatio: 3
  });
  assert.equal(settings.scalePercent, 170);
  assert.equal(validateSettings({ scalePercent: 1 }).scalePercent, 10);
  assert.equal(validateSettings({ scalePercent: 205 }).scalePercent, 200);
  assert.equal(settings.volumePercent, 0);
  assert.equal(settings.xRatio, 0);
  assert.equal(settings.yRatio, 1);
  assert.equal(validateSettings({ scalePercent: 124 }).scalePercent, 120);
});

test('睡眠时间只接受 5、15、30 和从不', () => {
  for (const value of [0, 5, 15, 30]) {
    assert.equal(validateSettings({ sleepAfterMinutes: value }).sleepAfterMinutes, value);
  }
  assert.equal(validateSettings({ sleepAfterMinutes: 12 }).sleepAfterMinutes, 15);
});

test('V1 字段迁移到 V2 字段', () => {
  assert.deepEqual(migrateSettings({
    bubbleVisible: false,
    autoMode: false,
    alwaysOnTop: true,
    reduceMotion: 'always'
  }), {
    bubbleVisible: false,
    bubbleEnabled: false,
    autoMode: false,
    autoCompanion: false,
    alwaysOnTop: true,
    displayMode: 'always-on-top',
    reduceMotion: 'reduce',
    quizSoundEnabled: false
  });
});

test('Web 持久化数据不包含 Windows 窗口字段', () => {
  const web = pickWebSettings({ ...DEFAULT_SETTINGS, displayMode: 'always-on-top' });
  assert.equal(web.scalePercent, 100);
  assert.equal('displayMode' in web, false);
  assert.equal('positionLocked' in web, false);
  assert.equal('monitorName' in web, false);
});

test('减少动画设置正确服从显式选项或系统偏好', () => {
  assert.equal(shouldReduceMotion('reduce', false), true);
  assert.equal(shouldReduceMotion('full', true), false);
  assert.equal(shouldReduceMotion('system', true), true);
});
