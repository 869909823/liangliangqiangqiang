import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MUYU_BEAT_MS,
  MUYU_STRIKE_OFFSET_MS,
  PetAudioManager
} from '../src/js/audio-manager.js';
import { FakeClock } from './test-helpers.mjs';

function createAudioHarness() {
  const clips = [];
  const factory = source => {
    const clip = {
      source,
      currentTime: 0,
      volume: 1,
      muted: false,
      playCount: 0,
      pauseCount: 0,
      play() {
        this.playCount += 1;
        return Promise.resolve();
      },
      pause() { this.pauseCount += 1; }
    };
    clips.push(clip);
    return clip;
  };
  return { clips, factory };
}

function createManager(harness) {
  const clock = new FakeClock();
  const manager = new PetAudioManager({
    audioFactory: harness.factory,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });
  return { clock, manager };
}

test('声音默认关闭时，节拍器仍运行并触发 onStrike，但不发声', async () => {
  const harness = createAudioHarness();
  const { clock, manager } = createManager(harness);
  manager.configure({ soundEnabled: false, volumePercent: 25, reducedMotion: false });

  let strikes = 0;
  assert.equal(manager.startMuyuLoop({ onStrike: () => { strikes += 1; } }), true);
  assert.equal(strikes, 0);
  await clock.advance(MUYU_STRIKE_OFFSET_MS);
  assert.equal(strikes, 1);
  assert.equal(harness.clips[0].playCount, 0);
  await clock.advance(MUYU_BEAT_MS);
  assert.equal(strikes, 2);
  manager.stop();
});

test('启用后首击落在偏移点，之后按节拍发声，复音池轮转叠加', async () => {
  const harness = createAudioHarness();
  const { clock, manager } = createManager(harness);
  manager.configure({ soundEnabled: true, volumePercent: 25, reducedMotion: false });

  assert.equal(manager.startMuyuLoop(), true);
  await clock.advance(MUYU_STRIKE_OFFSET_MS);
  assert.equal(harness.clips[0].playCount, 1);
  assert.equal(harness.clips[0].volume, 0.25);

  await clock.advance(MUYU_BEAT_MS);
  assert.equal(harness.clips[1].playCount, 1);
  await clock.advance(MUYU_BEAT_MS);
  assert.equal(harness.clips[2].playCount, 1);
  await clock.advance(MUYU_BEAT_MS);
  assert.equal(harness.clips[0].playCount, 2);
  manager.stop();
});

test('隐藏时暂停节拍与发声，恢复后继续', async () => {
  const harness = createAudioHarness();
  const { clock, manager } = createManager(harness);
  manager.configure({ soundEnabled: true, volumePercent: 25, reducedMotion: false });
  manager.startMuyuLoop();

  await clock.advance(MUYU_STRIKE_OFFSET_MS);
  assert.equal(harness.clips[0].playCount, 1);

  manager.setVisible(false);
  await clock.advance(5000);
  assert.equal(harness.clips[0].playCount, 1);

  manager.setVisible(true);
  await clock.advance(MUYU_STRIKE_OFFSET_MS);
  assert.equal(harness.clips[1].playCount, 1);
  manager.stop();
});

test('关闭声音只停发声，节拍器仍驱动 onStrike（飘字不消失）', async () => {
  const harness = createAudioHarness();
  const { clock, manager } = createManager(harness);
  manager.configure({ soundEnabled: true, volumePercent: 25, reducedMotion: false });

  let strikes = 0;
  manager.startMuyuLoop({ onStrike: () => { strikes += 1; } });
  await clock.advance(MUYU_STRIKE_OFFSET_MS);
  assert.equal(strikes, 1);
  assert.equal(harness.clips[0].playCount, 1);

  manager.configure({ soundEnabled: false, volumePercent: 25, reducedMotion: false });
  await clock.advance(MUYU_BEAT_MS);
  assert.equal(strikes, 2);
  assert.equal(harness.clips[1].playCount, 0);
  manager.stop();
});

test('停止后清理节拍器与回调，不再触发', async () => {
  const harness = createAudioHarness();
  const { clock, manager } = createManager(harness);
  manager.configure({ soundEnabled: true, volumePercent: 25, reducedMotion: false });

  let strikes = 0;
  manager.startMuyuLoop({ onStrike: () => { strikes += 1; } });
  await clock.advance(MUYU_STRIKE_OFFSET_MS);
  assert.equal(strikes, 1);

  manager.stop();
  await clock.advance(5000);
  assert.equal(strikes, 1);
  assert.equal(harness.clips[0].playCount, 1);
});

test('窗口隐藏时无法启动节拍器，恢复可见后可重新启动', () => {
  const harness = createAudioHarness();
  const manager = new PetAudioManager({ audioFactory: harness.factory });
  manager.setVisible(false);
  assert.equal(manager.startMuyuLoop(), false);
  manager.setVisible(true);
  assert.equal(manager.startMuyuLoop(), true);
  manager.stop();
});

test('节拍常量与 CSS 触击时刻一致：偏移点约占一拍 38%', () => {
  assert.equal(MUYU_BEAT_MS, 1200);
  assert.equal(Math.round((MUYU_STRIKE_OFFSET_MS / MUYU_BEAT_MS) * 100), 38);
});
