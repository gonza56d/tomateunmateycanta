// Monophonic pitch detection with the YIN algorithm
// (de Cheveigné & Kawahara, 2002). Pure JS, no dependencies.

export class YinDetector {
  /**
   * @param {number} sampleRate
   * @param {{bufferSize?: number, threshold?: number, minFreq?: number, maxFreq?: number}} opts
   */
  constructor(sampleRate, { bufferSize = 4096, threshold = 0.15, minFreq = 30, maxFreq = 2200 } = {}) {
    this.sampleRate = sampleRate;
    this.threshold = threshold;
    // A 2048-sample window is ~43 ms at 48 kHz: short enough to follow vibrato,
    // long enough to resolve the lowest notes. The remaining buffer holds the lag.
    this.windowSize = Math.min(2048, bufferSize >> 1);
    this.tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
    this.tauMax = Math.min(bufferSize - this.windowSize, Math.ceil(sampleRate / minFreq));
    this.diff = new Float32Array(this.tauMax + 1);
    this.lastRms = 0;
  }

  /**
   * @param {Float32Array} buffer time-domain samples, at least windowSize + tauMax long
   * @param {number} rmsGate frames quieter than this are treated as silence
   * @returns {{freq: number, clarity: number, rms: number} | null}
   */
  detect(buffer, rmsGate = 0.01) {
    const W = this.windowSize;
    const { tauMin, tauMax, diff } = this;

    let energy = 0;
    for (let i = 0; i < W; i++) energy += buffer[i] * buffer[i];
    const rms = Math.sqrt(energy / W);
    this.lastRms = rms;
    if (rms < rmsGate) return null;

    // Step 1–2: difference function.
    for (let tau = 1; tau <= tauMax; tau++) {
      let acc = 0;
      for (let j = 0; j < W; j++) {
        const delta = buffer[j] - buffer[j + tau];
        acc += delta * delta;
      }
      diff[tau] = acc;
    }

    // Step 3: cumulative mean normalised difference.
    diff[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += diff[tau];
      diff[tau] = running === 0 ? 1 : (diff[tau] * tau) / running;
    }

    // Step 4: absolute threshold — first dip below it, then slide to its bottom.
    let tau = tauMin;
    while (tau <= tauMax && diff[tau] >= this.threshold) tau++;
    if (tau > tauMax) return null;
    while (tau + 1 <= tauMax && diff[tau + 1] < diff[tau]) tau++;

    // Step 5: parabolic interpolation around the minimum.
    let period = tau;
    if (tau > 1 && tau < tauMax) {
      const s0 = diff[tau - 1];
      const s1 = diff[tau];
      const s2 = diff[tau + 1];
      const denom = 2 * (2 * s1 - s2 - s0);
      if (denom !== 0) period = tau + (s2 - s0) / denom;
    }

    return { freq: this.sampleRate / period, clarity: 1 - diff[tau], rms };
  }
}
