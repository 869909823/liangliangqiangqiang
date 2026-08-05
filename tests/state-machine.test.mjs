import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAIN_STATES,
  ONE_SHOT_DURATIONS,
  PetStateMachine
} from '../src/js/state-machine.js';
import { FakeClock } from './test-helpers.mjs';

test('状态机公开八个主状态，钓鱼和敲木鱼默认持续', () => {
  assert.deepEqual([...MAIN_STATES], [
    'idle', 'working', 'thinking', 'error', 'complete', 'sleeping', 'fishing', 'muyu', 'quiz', 'story'
  ]);
  assert.deepEqual({ ...ONE_SHOT_DURATIONS }, {
    error: 4500,
    complete: 3500
  });
});

for (const [state, duration] of Object.entries(ONE_SHOT_DURATIONS)) {
  test(`${state} 在 ${duration}ms 后自动回到待机`, async () => {
    const clock = new FakeClock();
    const machine = new PetStateMachine({
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer
    });
    machine.setState(state);
    await clock.advance(duration - 1);
    assert.equal(machine.state, state);
    await clock.advance(1);
    assert.equal(machine.state, 'idle');
  });
}

test('新手动状态取消旧的一次性返回计时器', async () => {
  const clock = new FakeClock();
  const changes = [];
  const machine = new PetStateMachine({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onChange: change => changes.push(change)
  });
  machine.setState('error');
  await clock.advance(1000);
  machine.setState('working', { source: 'manual' });
  await clock.advance(10000);

  assert.equal(machine.state, 'working');
  assert.deepEqual(changes.map(change => change.state), ['error', 'working']);
});

test('手动钓鱼和敲木鱼不会自动返回待机', async () => {
  const clock = new FakeClock();
  const machine = new PetStateMachine({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  machine.setState('fishing');
  await clock.advance(60_000);
  assert.equal(machine.state, 'fishing');
  machine.setState('muyu');
  await clock.advance(60_000);
  assert.equal(machine.state, 'muyu');
});

test('隐藏期间暂停一次性计时，恢复后继续剩余时长', async () => {
  const clock = new FakeClock();
  const machine = new PetStateMachine({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });
  machine.setState('complete');
  await clock.advance(1000);
  machine.pause();
  await clock.advance(10000);
  assert.equal(machine.state, 'complete');
  machine.resume();
  await clock.advance(2499);
  assert.equal(machine.state, 'complete');
  await clock.advance(1);
  assert.equal(machine.state, 'idle');
});

test('未知状态不会改变当前状态', () => {
  const machine = new PetStateMachine({ initialState: 'thinking' });
  assert.equal(machine.setState('unknown'), false);
  assert.equal(machine.state, 'thinking');
  machine.destroy();
});
