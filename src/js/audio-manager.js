export const AUDIO_SOURCES = Object.freeze({
  soft: 'assets/audio/mokugyo-soft.wav',
  bright: 'assets/audio/mokugyo-bright.wav'
});

function defaultAudioFactory(source) {
  return typeof Audio === 'function' ? new Audio(source) : null;
}

export class PetAudioManager {
  constructor({
    audioFactory = defaultAudioFactory,
    now = () => Date.now(),
    setTimer = (...args) => globalThis.setTimeout(...args),
    clearTimer = timer => globalThis.clearTimeout(timer)
  } = {}) {
    this.audioFactory = audioFactory;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.enabled = false;
    this.volume = 0.25;
    this.reducedMotion = false;
    this.visible = true;
    this.unlocked = false;
    this.scheduled = [];
    this.clips = Object.fromEntries(
      Object.entries(AUDIO_SOURCES).map(([name, source]) => {
        const clip = this.audioFactory(source);
        if (clip) clip.preload = 'auto';
        return [name, clip];
      })
    );
  }

  configure({ soundEnabled, volumePercent, reducedMotion }) {
    this.enabled = Boolean(soundEnabled);
    this.volume = Math.min(1, Math.max(0, Number(volumePercent) / 100 || 0));
    this.reducedMotion = Boolean(reducedMotion);
    for (const clip of Object.values(this.clips)) {
      if (clip) clip.volume = this.volume;
    }
    if (!this.enabled) this.stop();
  }

  async unlock() {
    if (this.unlocked) return true;
    const clips = Object.values(this.clips).filter(Boolean);
    const attempts = clips.map(async clip => {
      const previousMuted = clip.muted;
      clip.muted = true;
      try {
        await clip.play();
        clip.pause();
        clip.currentTime = 0;
        return true;
      } catch (_) {
        // A later direct user action can retry on stricter mobile browsers.
        return false;
      } finally {
        clip.muted = previousMuted;
      }
    });
    const results = await Promise.all(attempts);
    this.unlocked = clips.length === 0 || results.some(Boolean);
    return this.unlocked;
  }

  playMoyuSequence({ automatic = false } = {}) {
    this.stop();
    if (!this.enabled || !this.visible || (automatic && this.reducedMotion)) return false;
    this.scheduleClip('soft', 1600);
    this.scheduleClip('bright', 2400);
    this.scheduleClip('soft', 3200);
    return true;
  }

  scheduleClip(name, delay) {
    const entry = {
      name,
      remaining: delay,
      dueAt: this.now() + delay,
      timer: null
    };
    entry.timer = this.setTimer(() => {
      this.scheduled = this.scheduled.filter(item => item !== entry);
      this.playClip(entry.name);
    }, delay);
    this.scheduled.push(entry);
  }

  playClip(name) {
    if (!this.enabled || !this.visible) return;
    const clip = this.clips[name];
    if (!clip) return;
    try {
      clip.pause();
      clip.currentTime = 0;
      clip.volume = this.volume;
      const playback = clip.play();
      if (playback?.catch) playback.catch(() => {});
    } catch (_) {
      // Missing audio output must never interrupt the pet interaction.
    }
  }

  pause() {
    if (!this.visible) return;
    this.visible = false;
    for (const entry of this.scheduled) {
      if (entry.timer !== null) this.clearTimer(entry.timer);
      entry.timer = null;
      entry.remaining = Math.max(0, entry.dueAt - this.now());
    }
    for (const clip of Object.values(this.clips)) {
      if (clip) clip.pause();
    }
  }

  resume() {
    if (this.visible) return;
    this.visible = true;
    if (!this.enabled) {
      this.stop();
      return;
    }
    for (const entry of this.scheduled) {
      entry.dueAt = this.now() + entry.remaining;
      entry.timer = this.setTimer(() => {
        this.scheduled = this.scheduled.filter(item => item !== entry);
        this.playClip(entry.name);
      }, entry.remaining);
    }
  }

  setVisible(visible) {
    if (visible) this.resume();
    else this.pause();
  }

  stop() {
    for (const entry of this.scheduled) {
      if (entry.timer !== null) this.clearTimer(entry.timer);
    }
    this.scheduled = [];
    for (const clip of Object.values(this.clips)) {
      if (!clip) continue;
      try {
        clip.pause();
        clip.currentTime = 0;
      } catch (_) {}
    }
  }

  get pendingCount() {
    return this.scheduled.length;
  }
}
