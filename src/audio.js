/* ------------------------------------------------------------------ */
/*  Procedural audio — no external assets                             */
/* ------------------------------------------------------------------ */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
    this.engineGain = null;
    this.sirenGain = null;
    this.skidGain = null;
    this.windGain = null;
    this.sirenOscA = null;
    this.sirenOscB = null;
    this.engineFilter = null;
    this.sirenPhase = 0;
    this.noiseBuffer = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.72;
    master.connect(ctx.destination);
    this.master = master;

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    /* ---------- engine ---------- */
    const engGain = ctx.createGain();
    engGain.gain.value = 0;
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 520;
    engFilter.Q.value = 2.4;
    engGain.connect(engFilter);
    engFilter.connect(master);
    this.engineGain = engGain;
    this.engineFilter = engFilter;

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 48;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 24;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;
    oscA.connect(engGain);
    oscB.connect(subGain);
    subGain.connect(engGain);
    oscA.start();
    oscB.start();
    this.engineOscA = oscA;
    this.engineOscB = oscB;

    /* ---------- siren ---------- */
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'bandpass';
    sirenFilter.frequency.value = 900;
    sirenFilter.Q.value = 1.2;
    sirenGain.connect(sirenFilter);
    sirenFilter.connect(master);
    this.sirenGain = sirenGain;
    this.sirenFilter = sirenFilter;

    const sA = ctx.createOscillator();
    sA.type = 'sine';
    sA.frequency.value = 700;
    const sB = ctx.createOscillator();
    sB.type = 'triangle';
    sB.frequency.value = 705;
    sA.connect(sirenGain);
    sB.connect(sirenGain);
    sA.start();
    sB.start();
    this.sirenOscA = sA;
    this.sirenOscB = sB;

    /* ---------- skid ---------- */
    const skid = ctx.createBufferSource();
    skid.buffer = buf;
    skid.loop = true;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.value = 1450;
    skidFilter.Q.value = 0.9;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skid.connect(skidFilter);
    skidFilter.connect(skidGain);
    skidGain.connect(master);
    skid.start();
    this.skidGain = skidGain;

    /* ---------- wind ---------- */
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 600;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    wind.start();
    this.windGain = windGain;

    this.ready = true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.72, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  update(dt, { speed = 0, throttle = 0, drifting = false, siren = 0, active = false } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const sp = Math.abs(speed);

    if (this.engineOscA) {
      const f = 42 + sp * 3.4 + Math.abs(throttle) * 12;
      this.engineOscA.frequency.setTargetAtTime(f, t, 0.06);
      this.engineOscB.frequency.setTargetAtTime(f * 0.5, t, 0.06);
      this.engineFilter.frequency.setTargetAtTime(380 + sp * 28 + Math.abs(throttle) * 220, t, 0.08);
      const g = active ? 0.028 + Math.min(sp, 55) * 0.0016 + Math.abs(throttle) * 0.02 : 0;
      this.engineGain.gain.setTargetAtTime(g, t, 0.1);
    }

    if (this.sirenGain) {
      const g = active ? Math.min(0.16, siren * 0.16) : 0;
      this.sirenGain.gain.setTargetAtTime(g, t, 0.15);
      this.sirenPhase += dt;
      const hi = Math.sin(this.sirenPhase * 2.4) > 0;
      const f = hi ? 880 : 640;
      this.sirenOscA.frequency.setTargetAtTime(f, t, 0.04);
      this.sirenOscB.frequency.setTargetAtTime(f * 1.01, t, 0.04);
    }

    if (this.skidGain) {
      const g = active && drifting && sp > 6 ? Math.min(0.1, sp * 0.002) : 0;
      this.skidGain.gain.setTargetAtTime(g, t, 0.08);
    }

    if (this.windGain) {
      const g = active ? Math.min(0.055, Math.max(0, sp - 8) * 0.0012) : 0;
      this.windGain.gain.setTargetAtTime(g, t, 0.2);
    }
  }

  _noiseBurst(duration = 0.35, gain = 0.5, filterFrom = 2600, filterTo = 180) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFrom, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(filterTo, ctx.currentTime + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    src.stop(ctx.currentTime + duration + 0.05);
  }

  crash(intensity = 1) {
    if (!this.ready) return;
    const i = Math.min(1.4, intensity);
    this._noiseBurst(0.22 + i * 0.2, 0.25 + i * 0.35, 3200, 140);
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35 * i, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }

  pickup() {
    if (!this.ready) return;
    const ctx = this.ctx;
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.07;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.connect(g);
      g.connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.2);
    });
  }

  takedown() {
    if (!this.ready) return;
    this._noiseBurst(0.4, 0.5, 1800, 90);
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 0.42);
  }

  explosion() {
    if (!this.ready) return;
    this._noiseBurst(1.1, 0.9, 1400, 40);
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 1.05);
  }

  click() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 620;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 0.1);
  }
}
