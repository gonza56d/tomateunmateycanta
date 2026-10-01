// A small additive "electric piano" voice for reference notes.

export class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  attach(ctx) {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.28;
    this.master.connect(ctx.destination);
  }

  /** Starts a note and returns a handle whose release() fades it out. */
  play(freq) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(1, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.55, t0 + 0.7);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(freq * 6, 9000);
    filter.Q.value = 0.4;

    const partials = [[1, 1], [2, 0.32], [3, 0.14], [4, 0.07]];
    const oscillators = partials.map(([ratio, gain]) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(filter);
      osc.start(t0);
      return osc;
    });

    filter.connect(env).connect(this.master);

    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        const now = Math.max(ctx.currentTime, t0 + 0.12);
        if (typeof env.gain.cancelAndHoldAtTime === 'function') {
          env.gain.cancelAndHoldAtTime(now);
        } else {
          env.gain.cancelScheduledValues(now);
          env.gain.setValueAtTime(Math.max(env.gain.value, 0.0001), now);
        }
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        oscillators.forEach((osc) => osc.stop(now + 0.45));
      },
    };
  }
}
