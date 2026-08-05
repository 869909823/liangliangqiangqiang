import assert from 'node:assert/strict';
import test from 'node:test';
import { PetAudioManager } from '../src/js/audio-manager.js';
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

test('声音默认关闭，不会安排木鱼敲击', () => {
  const harness = createAudioHarness();
  const manager = new PetAudioManager({ audioFactory: harness.factory });
  assert.equal(manager.playMoyuSequence(), false);
  assert.equal(manager.pendingCount, 0);
});

test('启用后按 25% 音量安排三次敲击且不会叠加队列', async () => {
  const clock = new FakeClock();
  const harness = createAudioHarness();
  const manager = new PetAudioManager({
    audioFactory: harness.factory,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });
  manager.configure({ soundEnabled: true, volumePercent: 25, reducedMotion: false });
  assert.equal(manager.playMoyuSequence(), true);
  assert.equal(manager.pendingCount, 3);
  assert.equal(manager.playMoyuSequence(), true);
  assert.equal(manager.pendingCount, 3);

  await clock.advance(1600);
  assert.equal(harness.clips[0].playCount, 1);
  assert.equal(harness.clips[0].volume, 0.25);
  await clock.advance(1600);
  assert.equal(harness.clips[0].playCount, 2);
  assert.equal(harness.clips[1].playCount, 1);
  assert.equal(manager.pendingCount, 0);
});

test('自动摸鱼在减少动画时静音，手动触发仍可播放', () => {
  const manager = new PetAudioManager({ audioFactory: createAudioHarness().factory });
  manager.configure({ soundEnabled: true, volumePercent: 25, reducedMotion: true });
  assert.equal(manager.playMoyuSequence({ automatic: true }), false);
  assert.equal(manager.pendingCount, 0);
  assert.equal(manager.playMoyuSequence({ automatic: false }), true);
  manager.stop();
});

test('隐藏时暂停计时和声音，恢复后继续剩余时长', async () => {
  const clock = new FakeClock();
  const harness = createAudioHarness();
  const manager = new PetAudioManager({
    audioFactory: harness.factory,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });
  manager.configure({ soundEnabled: true, volumePercent: 40, reducedMotion: false });
  manager.playMoyuSequence();
  await clock.advance(600);
  manager.setVisible(false);
  await clock.advance(5000);
  assert.equal(harness.clips[0].playCount + harness.clips[1].playCount, 0);
  manager.setVisible(true);
  await clock.advance(1000);
  assert.equal(harness.clips[0].playCount, 1);
  manager.stop();
});

test('关闭声音立即清理全部计时器并停止片段', () => {
  const harness = createAudioHarness();
  const manager = new PetAudioManager({ audioFactory: harness.factory });
  manager.configure({ soundEnabled: true, volumePercent: 25, reducedMotion: false });
  manager.playMoyuSequence();
  manager.configure({ soundEnabled: false, volumePercent: 25, reducedMotion: false });
  assert.equal(manager.pendingCount, 0);
  assert.ok(harness.clips.every(clip => clip.pauseCount > 0));
});
