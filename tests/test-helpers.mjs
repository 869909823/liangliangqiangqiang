export class FakeClock {
  constructor(now = 0) {
    this.time = now;
    this.nextId = 1;
    this.timers = new Map();
  }

  now = () => this.time;

  setTimer = (callback, delay = 0) => {
    const id = this.nextId++;
    this.timers.set(id, {
      callback,
      dueAt: this.time + Math.max(0, Number(delay) || 0)
    });
    return id;
  };

  clearTimer = id => {
    this.timers.delete(id);
  };

  async advance(milliseconds) {
    const target = this.time + milliseconds;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
      if (!next) break;
      const [id, timer] = next;
      this.timers.delete(id);
      this.time = timer.dueAt;
      await timer.callback();
    }
    this.time = target;
  }
}
