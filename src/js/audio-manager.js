export const AUDIO_SOURCES = Object.freeze({
  soft: 'assets/audio/mokugyo-soft.wav',
  bright: 'assets/audio/mokugyo-bright.wav'
});

// 木鱼节拍：一击的周期与槌头触到木鱼的时刻。
// 必须与 src/css/tokens.css 的 --muyu-beat 保持一致，由 scripts/check.mjs 校验。
export const MUYU_BEAT_MS = 1200;
export const MUYU_STRIKE_OFFSET_MS = 456;

// 每个音色预建多个实例轮转播放，让上一条混响尾音自然叠加而不被硬切。
const VOICE_POOL_SIZE = 3;

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
    this.quizEnabled = false;
    this.volume = 0.25;
    this.reducedMotion = false;
    this.visible = true;
    this.unlocked = false;
    this.muyuLoop = false;
    this.loopTimer = null;
    this.onStrike = null;
    this.voicePools = {};
    this.voiceCursor = {};
    for (const [name, source] of Object.entries(AUDIO_SOURCES)) {
      const pool = [];
      for (let index = 0; index < VOICE_POOL_SIZE; index += 1) {
        const clip = this.audioFactory(source);
        if (clip) clip.preload = 'auto';
        pool.push(clip);
      }
      this.voicePools[name] = pool;
      this.voiceCursor[name] = 0;
    }
  }

  allVoices() {
    return Object.values(this.voicePools).flat();
  }

  configure({ soundEnabled, muyuSoundEnabled, quizSoundEnabled, volumePercent, reducedMotion }) {
    // 木鱼声音 = 「木鱼声音」总开关 ×「木鱼敲击音效」子开关，缺省子开关时只看总开关。
    this.enabled = Boolean(soundEnabled) && (muyuSoundEnabled === undefined ? true : Boolean(muyuSoundEnabled));
    this.quizEnabled = Boolean(quizSoundEnabled);
    this.volume = Math.min(1, Math.max(0, Number(volumePercent) / 100 || 0));
    this.reducedMotion = Boolean(reducedMotion);
    for (const clip of this.allVoices()) {
      if (clip) clip.volume = this.volume;
    }
  }

  playQuizResult(correct) {
    if (!this.quizEnabled || !this.visible) return false;
    // Reuse the tiny local wooden clips: bright for success, soft for correction.
    this.playClip(correct ? 'bright' : 'soft');
    return true;
  }

  async unlock() {
    if (this.unlocked) return true;
    const clips = this.allVoices().filter(Boolean);
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

  // 节拍器与发声解耦：即使关闭音效，节拍仍继续驱动 onStrike（飘字），
  // 发声仅受 this.enabled 控制。
  startMuyuLoop({ automatic = false, onStrike = null } = {}) {
    this.stop();
    this.onStrike = typeof onStrike === 'function' ? onStrike : null;
    if (!this.visible) return false;
    this.muyuLoop = true;
    this.scheduleStrike(MUYU_STRIKE_OFFSET_MS);
    return true;
  }

  scheduleStrike(delay) {
    if (this.loopTimer !== null) this.clearTimer(this.loopTimer);
    this.loopTimer = this.setTimer(() => {
      this.loopTimer = null;
      this.fireStrike();
    }, delay);
  }

  fireStrike() {
    if (!this.muyuLoop || !this.visible) return;
    if (this.onStrike) this.onStrike();
    this.playClip('soft');
    if (this.muyuLoop && this.visible) this.scheduleStrike(MUYU_BEAT_MS);
  }

  playClip(name) {
    if (!this.enabled || !this.visible) return;
    const pool = this.voicePools[name];
    if (!pool || pool.length === 0) return;
    const clip = pool[this.voiceCursor[name] % pool.length];
    this.voiceCursor[name] += 1;
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
    if (this.loopTimer !== null) this.clearTimer(this.loopTimer);
    this.loopTimer = null;
    for (const clip of this.allVoices()) {
      if (clip) clip.pause();
    }
  }

  resume() {
    if (this.visible) return;
    this.visible = true;
    if (this.muyuLoop) this.scheduleStrike(MUYU_STRIKE_OFFSET_MS);
  }

  setVisible(visible) {
    if (visible) this.resume();
    else this.pause();
  }

  stop() {
    this.muyuLoop = false;
    if (this.loopTimer !== null) this.clearTimer(this.loopTimer);
    this.loopTimer = null;
    this.onStrike = null;
    for (const clip of this.allVoices()) {
      if (!clip) continue;
      try {
        clip.pause();
        clip.currentTime = 0;
      } catch (_) {}
    }
  }

  get pendingCount() {
    return 0;
  }
}
