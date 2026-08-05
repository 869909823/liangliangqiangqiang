import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTO_FISHING_COOLDOWN_MS,
  AUTO_FISHING_IDLE_MS,
  CompanionScheduler,
  randomDelay
} from '../src/js/scheduler.js';

function settings(patch = {}) {
  return {
    autoCompanion: true,
    sleepAfterMinutes: 15,
    ...patch
  };
}

test('自动待机动作的随机间隔保持在 8–20 秒', () => {
  assert.equal(randomDelay(() => 0), 8000);
  assert.equal(randomDelay(() => 0.999999), 20000);
});

test('系统无操作达到设置时长后进入睡眠', async () => {
  const states = [];
  const scheduler = new CompanionScheduler({
    getState: () => 'idle',
    getSettings: () => settings(),
    getIdleMilliseconds: async () => 15 * 60 * 1000,
    onState: state => states.push(state)
  });
  assert.equal(await scheduler.runCycle(), 'sleeping');
  assert.deepEqual(states, ['sleeping']);
});

test('关闭自动陪伴时不会触发待机动作或伪造工作状态', async () => {
  const events = [];
  const scheduler = new CompanionScheduler({
    getState: () => 'idle',
    getSettings: () => settings({ autoCompanion: false, sleepAfterMinutes: 0 }),
    onAmbient: action => events.push(action),
    onState: state => events.push(state)
  });
  assert.equal(await scheduler.runCycle(), null);
  assert.deepEqual(events, []);
});

test('自动摸鱼随机进入钓鱼或敲木鱼，并满足两分钟待机和十分钟冷却', async () => {
  let now = 0;
  let currentState = 'idle';
  const states = [];
  const scheduler = new CompanionScheduler({
    getState: () => currentState,
    getSettings: () => settings({ sleepAfterMinutes: 0 }),
    random: () => 0,
    now: () => now,
    onState: state => {
      states.push(state);
      currentState = state;
    }
  });

  now = AUTO_FISHING_IDLE_MS - 1;
  assert.notEqual(await scheduler.runCycle(), 'fishing');
  currentState = 'idle';
  now = AUTO_FISHING_IDLE_MS;
  assert.equal(await scheduler.runCycle(), 'fishing');
  scheduler.noteStateChange('fishing', 'idle');

  currentState = 'idle';
  scheduler.noteStateChange('idle', 'fishing');
  now += AUTO_FISHING_IDLE_MS;
  assert.notEqual(await scheduler.runCycle(), 'fishing');

  currentState = 'idle';
  now = AUTO_FISHING_IDLE_MS + AUTO_FISHING_COOLDOWN_MS;
  assert.equal(await scheduler.runCycle(), 'fishing');
  assert.equal(states.filter(state => state === 'fishing').length, 2);
});

test('页面隐藏时不运行调度，恢复后重新安排', () => {
  const scheduled = [];
  const cleared = [];
  const scheduler = new CompanionScheduler({
    getState: () => 'idle',
    getSettings: () => settings(),
    setTimer: (callback, delay) => {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    clearTimer: timer => cleared.push(timer)
  });
  scheduler.start();
  scheduler.setVisible(false);
  assert.deepEqual(cleared, [1]);
  scheduler.setVisible(true);
  assert.equal(scheduled.at(-1).delay, 0);
  scheduler.stop();
});
