export const AMBIENT_ACTIONS = Object.freeze([
  'blink',
  'clickReaction',
  'stretch',
  'yawn',
  'snack',
  'peek'
]);

export const AUTO_FISHING_IDLE_MS = 2 * 60 * 1000;
export const AUTO_FISHING_COOLDOWN_MS = 10 * 60 * 1000;

export function randomDelay(random = Math.random) {
  return 8000 + Math.floor(random() * 12001);
}

export function pickAmbientAction(random = Math.random) {
  const value = random();
  if (value < 0.35) return 'blink';
  if (value < 0.55) return 'peek';
  if (value < 0.73) return 'stretch';
  if (value < 0.88) return 'yawn';
  return 'snack';
}

export class CompanionScheduler {
  constructor({
    getState,
    getSettings,
    getIdleMilliseconds = async () => null,
    onAmbient = () => {},
    onState = () => {},
    random = Math.random,
    now = () => Date.now(),
    setTimer = (...args) => globalThis.setTimeout(...args),
    clearTimer = timer => globalThis.clearTimeout(timer)
  }) {
    this.getState = getState;
    this.getSettings = getSettings;
    this.getIdleMilliseconds = getIdleMilliseconds;
    this.onAmbient = onAmbient;
    this.onState = onState;
    this.random = random;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timer = null;
    this.running = false;
    this.visible = true;
    this.lastInteractionAt = this.now();
    this.idleStateSince = this.now();
    this.lastFishingAt = Number.NEGATIVE_INFINITY;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  stop() {
    this.running = false;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  schedule(delay = randomDelay(this.random)) {
    if (!this.running || !this.visible) return;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(async () => {
      this.timer = null;
      await this.runCycle();
      this.schedule();
    }, delay);
  }

  async runCycle({ allowCompanion = true } = {}) {
    if (!this.visible) return null;
    const state = this.getState();
    const settings = this.getSettings();
    const externalIdle = await this.safeExternalIdle();
    const idleMilliseconds = Number.isFinite(externalIdle)
      ? Math.max(0, externalIdle)
      : Math.max(0, this.now() - this.lastInteractionAt);
    const sleepMinutes = Number(settings.sleepAfterMinutes);

    if (sleepMinutes > 0 && idleMilliseconds >= sleepMinutes * 60 * 1000) {
      if (state !== 'sleeping') {
        this.onState('sleeping', { source: 'scheduler' });
        return 'sleeping';
      }
      return null;
    }

    if (!allowCompanion || !settings.autoCompanion || state !== 'idle') return null;

    const idleStateTime = this.now() - this.idleStateSince;
    const fishingReady = idleStateTime >= AUTO_FISHING_IDLE_MS
      && this.now() - this.lastFishingAt >= AUTO_FISHING_COOLDOWN_MS;
    if (fishingReady && this.random() < 0.08) {
      this.lastFishingAt = this.now();
      const fishingState = this.random() < 0.5 ? 'fishing' : 'muyu';
      this.onState(fishingState, {
        source: 'scheduler',
        returnAfterMs: 8000
      });
      return fishingState;
    }

    if (this.random() < 0.06) {
      this.onState('thinking', {
        source: 'scheduler',
        returnAfterMs: 3200
      });
      return 'thinking';
    }

    const action = pickAmbientAction(this.random);
    this.onAmbient(action);
    return action;
  }

  async safeExternalIdle() {
    try {
      const value = await this.getIdleMilliseconds();
      if (value === null || value === undefined || value === '') return null;
      return Number.isFinite(Number(value)) ? Number(value) : null;
    } catch (_) {
      return null;
    }
  }

  noteInteraction() {
    this.lastInteractionAt = this.now();
  }

  noteStateChange(state, previousState) {
    if (state === 'idle' && previousState !== 'idle') this.idleStateSince = this.now();
    if (state === 'fishing' || state === 'muyu') this.lastFishingAt = this.now();
  }

  setVisible(visible) {
    const next = Boolean(visible);
    if (this.visible === next) return;
    this.visible = next;
    if (!next) {
      if (this.timer !== null) this.clearTimer(this.timer);
      this.timer = null;
      return;
    }
    if (!this.running) return;
    this.timer = this.setTimer(async () => {
      this.timer = null;
      await this.runCycle({ allowCompanion: false });
      this.schedule();
    }, 0);
  }
}
