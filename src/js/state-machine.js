export const MAIN_STATES = Object.freeze([
  'idle',
  'working',
  'thinking',
  'error',
  'complete',
  'sleeping',
  'fishing',
  'muyu',
  'quiz',
  'story'
]);

export const ONE_SHOT_DURATIONS = Object.freeze({
  error: 4500,
  complete: 3500,
});

export function isMainState(value) {
  return MAIN_STATES.includes(value);
}

export class PetStateMachine {
  constructor({
    initialState = 'idle',
    onBeforeChange = () => {},
    onChange = () => {},
    now = () => Date.now(),
    setTimer = (...args) => globalThis.setTimeout(...args),
    clearTimer = timer => globalThis.clearTimeout(timer)
  } = {}) {
    if (!isMainState(initialState)) throw new TypeError(`Unknown pet state: ${initialState}`);
    this.state = initialState;
    this.onBeforeChange = onBeforeChange;
    this.onChange = onChange;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.returnTimer = null;
    this.returnDeadline = 0;
    this.returnRemaining = 0;
    this.paused = false;
  }

  setState(state, options = {}) {
    if (!isMainState(state)) return false;

    const previousState = this.state;
    this.cancelTimedReturn();
    this.onBeforeChange({ state, previousState, options });
    this.state = state;
    this.onChange({ state, previousState, options });

    const requestedDuration = Number(options.returnAfterMs);
    const duration = Number.isFinite(requestedDuration)
      ? Math.max(0, requestedDuration)
      : ONE_SHOT_DURATIONS[state];
    if (duration > 0) this.startTimedReturn(duration);
    return true;
  }

  startTimedReturn(duration) {
    this.returnRemaining = duration;
    if (this.paused) return;
    this.returnDeadline = this.now() + duration;
    this.returnTimer = this.setTimer(() => {
      this.returnTimer = null;
      this.returnDeadline = 0;
      this.returnRemaining = 0;
      this.setState('idle', { source: 'timeout', announce: true });
    }, duration);
  }

  cancelTimedReturn() {
    if (this.returnTimer !== null) this.clearTimer(this.returnTimer);
    this.returnTimer = null;
    this.returnDeadline = 0;
    this.returnRemaining = 0;
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    if (this.returnTimer === null) return;
    this.returnRemaining = Math.max(0, this.returnDeadline - this.now());
    this.clearTimer(this.returnTimer);
    this.returnTimer = null;
    this.returnDeadline = 0;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.returnRemaining > 0) this.startTimedReturn(this.returnRemaining);
  }

  destroy() {
    this.cancelTimedReturn();
  }
}
