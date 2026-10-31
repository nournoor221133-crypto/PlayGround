/* Lightweight WebAudio synth: engine, tires, siren, impacts, and a synthwave loop. */

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.muted = false;
    this.musicOn = true;
    this.ready = false;
  }

  init() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.started = true;
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = 0.16;
    this.music.connect(this.master);

    this.noiseBuf = this._noiseBuffer(2);

    this._buildEngine();
    this._buildTires();
    this._buildWind();
    this._buildSiren();
    this._startMusic();
    this.ready = true;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _loopNoise(gainValue = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = gainValue;
    src.connect(g);
    src.start();
    return { src, gain: g };
  }

  _buildEngine() {
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineFilter.Q.value = 3;
    this.engineGain.connect(this.engineFilter);
    this.engineFilter.connect(this.sfx);

    this.engOsc1 = ctx.createOscillator();
    this.engOsc1.type = 'sawtooth';
    this.engOsc1.frequency.value = 45;
    this.engOsc2 = ctx.createOscillator();
    this.engOsc2.type = 'square';
    this.engOsc2.frequency.value = 70;
    const g1 = ctx.createGain(); g1.gain.value = 0.55;
    const g2 = ctx.createGain(); g2.gain.value = 0.28;
    this.engOsc1.connect(g1); g1.connect(this.engineGain);
    this.engOsc2.connect(g2); g2.connect(this.engineGain);
    this.engOsc1.start();
    this.engOsc2.start();
  }

  _buildTires() {
    const n = this._loopNoise(0);
    this.tireGain = n.gain;
    this.tireFilter = this.ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 1900;
    this.tireFilter.Q.value = 0.9;
    n.gain.disconnect();
    n.gain.connect(this.tireFilter);
    this.tireFilter.connect(this.sfx);
  }

  _buildWind() {
    const n = this._loopNoise(0);
    this.windGain = n.gain;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 600;
    n.gain.disconnect();
    n.gain.connect(this.windFilter);
    this.windFilter.connect(this.sfx);
  }

  _buildSiren() {
    const ctx = this.ctx;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 720;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1500;
    osc.connect(filter);
    filter.connect(this.sirenGain);
    this.sirenGain.connect(this.sfx);
    osc.start();
    this.sirenOsc = osc;
  }

  /* ---------------- music ---------------- */
  _startMusic() {
    this.bpm = 96;
    this.stepDur = 60 / this.bpm / 4;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.15;
    this.musicTimer = setInterval(() => this._schedule(), 90);
  }

  _schedule() {
    if (!this.ready || !this.musicOn) return;
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + 0.22) {
      this._playStep(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step = (this.step + 1) % 32;
    }
  }

  _playStep(step, t) {
    const ctx = this.ctx;
    const bar = step % 16;
    // kick
    if (bar % 4 === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + 0.32);
    }
    // snare
    if (bar === 4 || bar === 12) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(f); f.connect(g); g.connect(this.music);
      src.start(t, Math.random()); src.stop(t + 0.2);
    }
    // hats
    if (bar % 2 === 1) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(f); f.connect(g); g.connect(this.music);
      src.start(t, Math.random()); src.stop(t + 0.07);
    }
    // bass line (A minor-ish)
    const bassNotes = [33, 33, 33, 36, 33, 33, 31, 33, 33, 33, 36, 38, 33, 31, 29, 31];
    if (bar % 2 === 0) {
      const n = bassNotes[(bar / 2) | 0];
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 520;
      o.type = 'sawtooth';
      o.frequency.value = NOTE(n);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + this.stepDur * 1.9);
      o.connect(f); f.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + this.stepDur * 2.1);
    }
    // arpeggio sparkle
    const arp = [69, 72, 76, 72, 69, 76, 81, 76];
    if (step % 2 === 0) {
      const n = arp[(step / 2) % arp.length];
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = NOTE(n);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + 0.25);
    }
    // pad every 2 bars
    if (step === 0) {
      for (const n of [45, 48, 52]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 700;
        o.type = 'sawtooth';
        o.frequency.value = NOTE(n);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.028, t + 1.2);
        g.gain.linearRampToValueAtTime(0.0001, t + 7.4);
        o.connect(f); f.connect(g); g.connect(this.music);
        o.start(t); o.stop(t + 7.6);
      }
    }
  }

  /* ---------------- per-frame ---------------- */
  update(state) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const speed = Math.abs(state.speed || 0);
    const throttle = Math.max(0, state.throttle || 0);
    const driving = !!state.driving;
    const ratio = Math.min(1, speed / 55);

    const engineVol = driving ? (0.055 + throttle * 0.05 + ratio * 0.03) : 0;
    this.engineGain.gain.setTargetAtTime(engineVol, t, 0.1);
    const base = 38 + speed * 1.55 + throttle * 8;
    this.engOsc1.frequency.setTargetAtTime(base, t, 0.08);
    this.engOsc2.frequency.setTargetAtTime(base * 1.52, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(380 + speed * 26 + throttle * 200, t, 0.1);

    const screech = driving ? Math.min(0.16, (state.drift || 0) * 0.16) : 0;
    this.tireGain.gain.setTargetAtTime(screech, t, 0.06);
    this.tireFilter.frequency.setTargetAtTime(1500 + (state.drift || 0) * 900, t, 0.1);

    const wind = driving ? ratio * ratio * 0.09 : 0.01;
    this.windGain.gain.setTargetAtTime(wind, t, 0.2);

    // siren
    let siren = 0;
    if (state.copDistance != null && state.wanted > 0) {
      siren = Math.max(0, 1 - state.copDistance / 90) * 0.07;
    }
    this.sirenGain.gain.setTargetAtTime(siren, t, 0.15);
    if (siren > 0.001) {
      const phase = Math.sin(t * 5.5) > 0 ? 780 : 560;
      this.sirenOsc.frequency.setTargetAtTime(phase, t, 0.03);
    }
  }

  /* ---------------- one-shots ---------------- */
  crash(strength = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.5, 0.12 + strength * 0.02), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t, Math.random()); src.stop(t + 0.4);

    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    og.gain.setValueAtTime(Math.min(0.4, 0.1 + strength * 0.02), t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(og); og.connect(this.sfx);
    o.start(t); o.stop(t + 0.28);
  }

  beep(freq = 880, dur = 0.12, type = 'sine', vol = 0.16) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  pickup() { this.beep(880, 0.09); setTimeout(() => this.beep(1320, 0.13), 70); }
  cash() { this.beep(1040, 0.07, 'triangle', 0.12); setTimeout(() => this.beep(1560, 0.1, 'triangle', 0.1), 60); }
  missionComplete() {
    [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => this.beep(f, 0.18, 'triangle', 0.13), i * 110));
  }
  busted() {
    this.beep(300, 0.3, 'sawtooth', 0.2);
    setTimeout(() => this.beep(180, 0.5, 'sawtooth', 0.18), 220);
  }
  gunshot() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t, Math.random()); src.stop(t + 0.14);
  }
  nitroWhoosh() {
    if (!this.ready) return;
    this.beep(220, 0.3, 'sawtooth', 0.05);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.1);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
}
