(() => {
'use strict';

/* ============================================================
   HOLLOW CHAMBER — a small Hades-inspired room-clear roguelike
   ============================================================ */

const TAU = Math.PI * 2;
const PI = Math.PI;
const SPAWN_TIME = 0.18;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const lerpAngle = (a, b, t) => a + angDiff(a, b) * t;
const hypot = Math.hypot;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const canvas = $('#game');
const ctx = canvas.getContext('2d', { alpha: false });
const bgCanvas = document.createElement('canvas');
const bgCtx = bgCanvas.getContext('2d');

const ui = {
  hud: $('#hud'),
  hpFill: $('#hp-fill'),
  hpChip: $('#hp-chip'),
  hpText: $('#hp-text'),
  boonRow: $('#boon-row'),
  chamberLabel: $('#chamber-label'),
  wavePips: Array.from($('#wave-pips').children),
  foeCount: $('#foe-count'),
  soulCount: $('#soul-count'),
  killCount: $('#kill-count'),
  muteBtn: $('#mute-btn'),
  pauseBtn: $('#pause-btn'),
  hudWeaponIcon: $('#hud-weapon-icon'),
  hudWeaponName: $('#hud-weapon-name'),
  hudWeaponPerk: $('#hud-weapon-perk'),
  abAttack: $('#ab-attack'),
  abSpecial: $('#ab-special'),
  abDash: $('#ab-dash'),
  banner: $('#banner'),
  bannerKicker: $('#banner-kicker'),
  bannerTitle: $('#banner-title'),
  bannerSub: $('#banner-sub'),
  toast: $('#toast'),
  flash: $('#flash'),
  title: $('#title-screen'),
  reward: $('#reward-screen'),
  pause: $('#pause-screen'),
  end: $('#end-screen'),
  pauseSub: $('#pause-sub'),
  boonGrid: $('#boon-grid'),
  rewardHint: $('.reward-hint'),
  endKicker: $('#end-kicker'),
  endTitle: $('#end-title'),
  endSub: $('#end-sub'),
  endChamber: $('#end-chamber'),
  endKills: $('#end-kills'),
  endSouls: $('#end-souls'),
  endTime: $('#end-time'),
  startBtn: $('#start-btn'),
  resumeBtn: $('#resume-btn'),
  abandonBtn: $('#abandon-btn'),
  retryBtn: $('#retry-btn'),
  joystick: $('#joystick'),
  stickKnob: $('#stick-knob'),
  touchAttack: $('#touch-attack'),
  touchDash: $('#touch-dash'),
  touchSpecial: $('#touch-special')
};

const WEAPONS = {
  blade: {
    id: 'blade', name: 'Stygian Blade', icon: 'sword', color: '#e2505a',
    perk: 'Three-hit combo · whirlwind',
    attackCd: 0.30, specialCd: 5.5,
    hint: 'Three-hit combo. The third strike carves wider and hits harder.'
  },
  spear: {
    id: 'spear', name: 'Aetos Spear', icon: 'spear', color: '#62e3cd',
    perk: 'Piercing thrust · returning throw',
    attackCd: 0.46, specialCd: 4.8,
    hint: 'A long thrust that skewers a line of foes. Keep them at the point.'
  },
  bow: {
    id: 'bow', name: 'Heart-Seeker Bow', icon: 'bow', color: '#f0c674',
    perk: 'Rapid arrows · five-shot fan',
    attackCd: 0.29, specialCd: 5.8,
    hint: 'Rapid arrows that punish from afar. Distance is a kind of armor.'
  }
};

const ENEMY_TYPES = {
  wretch: { hp: 36, speed: 132, r: 15, damage: 8, color: '#e45454', souls: 1 },
  wraith: { hp: 30, speed: 74, r: 14, damage: 9, color: '#aa84ff', souls: 1 },
  brute:  { hp: 130, speed: 57, r: 29, damage: 20, color: '#d3a05d', souls: 3 }
};

const CHAMBERS = [
  { name: 'THE GILDED GATE', sub: 'The first door closes behind you.' },
  { name: 'THE WEEPING HALLS', sub: 'Something here remembers your name.' },
  { name: 'THE LAST THRESHOLD', sub: 'No god will answer now.' }
];

const BOONS = [
  {
    id: 'blood', name: 'Blood Price', icon: 'sword', color: '#ef5a62', rarity: 'COMMON',
    desc: '+20% damage from every strike.',
    flavor: 'Everything that lives owes a little.',
    apply(run) { run.buffs.dmg *= 1.2; }
  },
  {
    id: 'sandals', name: 'Swift Sandals', icon: 'wing', color: '#62e3cd', rarity: 'COMMON',
    desc: '+14% movement speed.',
    flavor: 'The ground is only a suggestion.',
    apply(run) { run.buffs.speed *= 1.14; }
  },
  {
    id: 'heart', name: 'Stout Heart', icon: 'heart', color: '#ef6b78', rarity: 'RARE',
    desc: '+25 maximum vitality. Heal 25 now.',
    flavor: 'A stubborn thing, the heart.',
    apply(run) { run.buffs.maxHp += 25; game.player.maxHp += 25; heal(25, false); }
  },
  {
    id: 'edge', name: 'Cruel Edge', icon: 'eye', color: '#f4d08a', rarity: 'RARE',
    desc: '+12% critical chance. Critical hits deal double.',
    flavor: 'See the hinge of every creature.',
    apply(run) { run.buffs.crit = Math.min(0.75, run.buffs.crit + 0.12); }
  },
  {
    id: 'storm', name: 'Storm Step', icon: 'dash', color: '#8eb9ff', rarity: 'COMMON',
    desc: 'Dash recharges 25% faster.',
    flavor: 'Between one breath and the next.',
    apply(run) { run.buffs.dashCd *= 0.75; }
  },
  {
    id: 'feast', name: 'Soul Feast', icon: 'drop', color: '#b388ff', rarity: 'RARE',
    desc: 'Recover 3 vitality whenever a foe falls.',
    flavor: 'Waste nothing. Not even the dead.',
    apply(run) { run.buffs.lifesteal += 3; }
  },
  {
    id: 'aegis', name: 'Aegis of Ash', icon: 'shield', color: '#d9a54a', rarity: 'RARE',
    desc: 'Take 15% less damage.',
    flavor: 'Old bronze. Older grudges.',
    apply(run) { run.buffs.dmgReduce = Math.min(0.6, run.buffs.dmgReduce + 0.15); }
  },
  {
    id: 'hands', name: 'Quick Hands', icon: 'bolt', color: '#ffc857', rarity: 'COMMON',
    desc: '+18% attack speed.',
    flavor: 'The blade decides before you do.',
    apply(run) { run.buffs.atkSpeed *= 1.18; }
  }
];

const game = {
  mode: 'title',
  selectedWeapon: 'blade',
  player: null,
  run: null,
  enemies: [],
  projectiles: [],
  effects: [],
  particles: [],
  numbers: [],
  pickups: [],
  spawnQueue: [],
  pendingBoons: [],
  shake: 0,
  hitstop: 0,
  time: 0,
  elapsed: 0,
  pointer: { x: innerWidth * 0.5, y: innerHeight * 0.4, moved: false, down: false },
  keys: new Set(),
  joy: { x: 0, y: 0 },
  touchAttack: false,
  toastTimer: 0,
  endTimer: 0,
  hudBoonCount: -1
};

let W = innerWidth;
let H = innerHeight;
let DPR = Math.min(devicePixelRatio || 1, 2);
let touchUI = false;
let arena = { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
const decor = { braziers: [], motes: [], gate: null, sigilR: 0 };

/* ============================================================
   AUDIO — tiny procedural score and SFX
   ============================================================ */

const Sfx = {
  ac: null,
  master: null,
  noiseBuf: null,
  ambient: null,
  muted: false,
  lastHit: 0,

  ensure() {
    if (this.ac) {
      if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ac = new AC();
    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ac.destination);
    const len = Math.floor(this.ac.sampleRate * 1.2);
    this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  },

  tone(freq, dur, type = 'sine', vol = 0.08, slide = null, delay = 0) {
    if (!this.ac) return;
    const t0 = this.ac.currentTime + delay;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  },

  noise(dur, vol, filterType = 'lowpass', freq = 900, q = 0.8, delay = 0, slide = null) {
    if (!this.ac || !this.noiseBuf) return;
    const t0 = this.ac.currentTime + delay;
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ac.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t0);
    f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, vol), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.03);
  },

  swing() {
    this.noise(0.10, 0.10, 'bandpass', 1100, 0.9, 0, 500);
    this.tone(190, 0.07, 'triangle', 0.025, 110);
  },
  hit(crit = false) {
    const now = performance.now();
    if (now - this.lastHit < 32) return;
    this.lastHit = now;
    this.noise(crit ? 0.09 : 0.06, crit ? 0.16 : 0.10, 'lowpass', crit ? 1600 : 1000);
    this.tone(crit ? 240 : 150, 0.11, 'sine', crit ? 0.07 : 0.045, 55);
  },
  shoot() {
    this.tone(620, 0.09, 'triangle', 0.045, 190);
    this.noise(0.04, 0.045, 'highpass', 2200);
  },
  dash() {
    this.noise(0.16, 0.09, 'bandpass', 420, 1.2, 0, 1500);
  },
  hurt() {
    this.tone(150, 0.25, 'sawtooth', 0.10, 48);
    this.noise(0.2, 0.09, 'lowpass', 620);
  },
  enemyDie() {
    this.noise(0.18, 0.09, 'lowpass', 760, 0.7, 0, 220);
    this.tone(115, 0.18, 'sine', 0.045, 42);
  },
  slam() {
    this.tone(62, 0.38, 'sine', 0.17, 28);
    this.noise(0.35, 0.13, 'lowpass', 300);
  },
  orb() {
    this.tone(480, 0.18, 'sine', 0.025, 780);
  },
  waveClear() {
    this.tone(261.63, 0.5, 'triangle', 0.045);
    this.tone(392, 0.6, 'triangle', 0.035, null, 0.12);
  },
  clear() {
    [392, 523.25, 659.25, 783.99].forEach((n, i) => {
      this.tone(n, 0.8, 'triangle', 0.055, null, i * 0.13);
      this.tone(n * 2, 0.5, 'sine', 0.018, null, i * 0.13 + 0.02);
    });
  },
  boon() {
    [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.tone(n, 0.7, 'triangle', 0.04, null, i * 0.075));
  },
  death() {
    this.tone(96, 0.8, 'sawtooth', 0.12, 27);
    this.tone(48, 1.1, 'sine', 0.10, 20);
    this.noise(0.7, 0.08, 'lowpass', 420);
  },
  ui() {
    this.tone(680, 0.045, 'square', 0.018);
  },
  growl() {
    this.tone(90, 0.13, 'sawtooth', 0.035, 60);
  },

  startAmbient() {
    if (this.ambient || !this.ac) return;
    const ac = this.ac;
    const g = ac.createGain();
    g.gain.value = 0.0001;
    g.connect(this.master);
    const o1 = ac.createOscillator();
    const o2 = ac.createOscillator();
    o1.type = 'sine'; o2.type = 'sine';
    o1.frequency.value = 55;
    o2.frequency.value = 82.41;
    o1.detune.value = -4;
    o2.detune.value = 5;
    o1.connect(g); o2.connect(g);
    o1.start(); o2.start();
    g.gain.exponentialRampToValueAtTime(0.028, ac.currentTime + 3);
    const notes = [220, 246.94, 261.63, 293.66, 329.63, 392, 440];
    const timer = setInterval(() => {
      if (!this.ac || this.muted) return;
      const n = notes[Math.floor(Math.random() * notes.length)];
      this.tone(n / 2, 1.7, 'triangle', 0.022, null, 0);
      this.tone(n, 1.1, 'sine', 0.012, null, 0.06);
      if (Math.random() < 0.35) this.tone(n * 1.5, 0.9, 'sine', 0.008, null, 0.2);
    }, 2600);
    this.ambient = { g, o1, o2, timer };
  },

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ac) {
      this.master.gain.cancelScheduledValues(this.ac.currentTime);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ac.currentTime, 0.05);
    }
    try { localStorage.setItem('hollow-muted', muted ? '1' : '0'); } catch (e) {}
    ui.muteBtn.querySelector('use').setAttribute('href', muted ? '#icon-mute' : '#icon-sound');
    ui.muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }
};
try { Sfx.muted = localStorage.getItem('hollow-muted') === '1'; } catch (e) {}

/* ============================================================
   LAYOUT + STATIC STAGE PAINTING
   ============================================================ */

function updateTouchUI() {
  touchUI = window.matchMedia('(pointer: coarse)').matches || innerWidth < 820;
  document.body.classList.toggle('touch', touchUI);
  if (ui.rewardHint) {
    ui.rewardHint.innerHTML = touchUI
      ? 'Tap a boon to claim it'
      : 'Press <kbd>1</kbd> <kbd>2</kbd> or <kbd>3</kbd>';
  }
}

function computeArena() {
  const mobile = W < 760;
  const short = H < 560;
  const padX = mobile ? 16 : clamp(W * 0.062, 34, 100);
  const top = short ? 62 : mobile ? 96 : 108;
  const bottom = short ? 26 : mobile ? 198 : 84;
  const w = Math.min(W - padX * 2, 1320);
  const h = Math.min(H - top - bottom, 760);
  const x = (W - w) * 0.5;
  const y = top + Math.max(0, (H - top - bottom - h) * 0.5);
  arena = { x, y, w, h, cx: x + w * 0.5, cy: y + h * 0.5 };
}

function resize() {
  W = innerWidth;
  H = innerHeight;
  DPR = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(W * DPR));
  canvas.height = Math.max(1, Math.round(H * DPR));
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  updateTouchUI();
  computeArena();
  buildStatic();
  initMotes();
  if (game.player) {
    const p = game.player;
    p.x = clamp(p.x, arena.x + p.r + 14, arena.x + arena.w - p.r - 14);
    p.y = clamp(p.y, arena.y + p.r + 14, arena.y + arena.h - p.r - 14);
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function roundPath(c, x, y, w, h, r) {
  r = Math.min(r, w * 0.5, h * 0.5);
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function drawGate(c) {
  const base = arena.y + 5;
  const maxGh = Math.max(42, base - 14);
  const gh = Math.min(clamp(arena.h * 0.22, 82, 150), maxGh);
  const gw = Math.min(clamp(arena.w * 0.17, 112, 218), gh * 1.9);
  const x = arena.cx - gw * 0.5;
  const top = base - gh;
  const arch = gw * 0.5;

  // outer stone
  c.save();
  c.beginPath();
  c.moveTo(x - 13, base);
  c.lineTo(x - 13, top + arch);
  c.quadraticCurveTo(x - 13, top - 16, arena.cx, top - 16);
  c.quadraticCurveTo(x + gw + 13, top - 16, x + gw + 13, top + arch);
  c.lineTo(x + gw + 13, base);
  c.closePath();
  const stone = c.createLinearGradient(0, top - 20, 0, base);
  stone.addColorStop(0, '#1b2637');
  stone.addColorStop(0.5, '#101825');
  stone.addColorStop(1, '#090e17');
  c.fillStyle = stone;
  c.fill();
  c.strokeStyle = 'rgba(217,165,74,.22)';
  c.lineWidth = 1;
  c.stroke();

  // inner arch
  c.beginPath();
  c.moveTo(x, base);
  c.lineTo(x, top + arch + 10);
  c.quadraticCurveTo(x, top + 7, arena.cx, top + 7);
  c.quadraticCurveTo(x + gw, top + 7, x + gw, top + arch + 10);
  c.lineTo(x + gw, base);
  c.closePath();
  const inner = c.createLinearGradient(0, top, 0, base);
  inner.addColorStop(0, '#061119');
  inner.addColorStop(0.6, '#0a1c20');
  inner.addColorStop(1, '#071013');
  c.fillStyle = inner;
  c.fill();
  c.strokeStyle = 'rgba(98,227,205,.18)';
  c.stroke();

  // door veins
  c.save();
  c.clip();
  c.globalCompositeOperation = 'lighter';
  const glow = c.createRadialGradient(arena.cx, base - 10, 4, arena.cx, base - 10, gh * 0.8);
  glow.addColorStop(0, 'rgba(98,227,205,.20)');
  glow.addColorStop(0.5, 'rgba(62,150,150,.07)');
  glow.addColorStop(1, 'rgba(62,150,150,0)');
  c.fillStyle = glow;
  c.fillRect(x, top, gw, gh + 10);
  c.strokeStyle = 'rgba(98,227,205,.11)';
  c.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.moveTo(x + gw * (0.18 + i * 0.16), base);
    c.lineTo(x + gw * (0.35 + i * 0.08), top + 20);
    c.stroke();
  }
  c.restore();

  // gold keystone
  c.beginPath();
  c.moveTo(arena.cx - 6, top - 10);
  c.lineTo(arena.cx + 6, top - 10);
  c.lineTo(arena.cx + 3, top + 6);
  c.lineTo(arena.cx - 3, top + 6);
  c.closePath();
  c.fillStyle = 'rgba(217,165,74,.34)';
  c.fill();

  decor.gate = { x: arena.cx, y: base - gh * 0.55, r: gw * 0.65 };
  c.restore();
}

function drawGreekBand(c, x1, x2, y) {
  const step = 24;
  c.save();
  c.strokeStyle = 'rgba(217,165,74,.13)';
  c.lineWidth = 1;
  c.beginPath();
  for (let x = x1; x <= x2 - step; x += step) {
    c.moveTo(x + 3, y + 7);
    c.lineTo(x + 3, y + 2);
    c.lineTo(x + step - 7, y + 2);
    c.lineTo(x + step - 7, y + 7);
    c.lineTo(x + 9, y + 7);
    c.lineTo(x + 9, y + 5);
  }
  c.stroke();
  c.restore();
}

function drawBrazierBase(c, b) {
  c.save();
  c.translate(b.x, b.y);
  c.fillStyle = 'rgba(0,0,0,.4)';
  c.beginPath(); c.ellipse(0, 7, 15, 5, 0, 0, TAU); c.fill();
  c.strokeStyle = '#090d13'; c.lineWidth = 4; c.lineCap = 'round';
  [[-8, 10, -4, 18], [8, 10, 4, 18], [0, 11, 0, 20]].forEach(l => {
    c.beginPath(); c.moveTo(l[0], l[1]); c.lineTo(l[2], l[3]); c.stroke();
  });
  const bowl = c.createLinearGradient(0, -9, 0, 8);
  bowl.addColorStop(0, '#453629');
  bowl.addColorStop(0.5, '#1d1813');
  bowl.addColorStop(1, '#080a0d');
  c.fillStyle = bowl;
  c.beginPath(); c.ellipse(0, 0, 15, 7, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(217,165,74,.42)'; c.lineWidth = 1;
  c.beginPath(); c.ellipse(0, -2, 14, 5, 0, 0, TAU); c.stroke();
  c.fillStyle = 'rgba(255,176,72,.16)';
  c.beginPath(); c.ellipse(0, -2, 10, 3, 0, 0, TAU); c.fill();
  c.restore();
}

function buildStatic() {
  bgCanvas.width = Math.max(1, Math.round(W * DPR));
  bgCanvas.height = Math.max(1, Math.round(H * DPR));
  bgCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const c = bgCtx;
  const rnd = mulberry32(Math.floor(W * 13 + H * 7 + 97));

  c.clearRect(0, 0, W, H);

  // abyssal room backdrop
  const base = c.createRadialGradient(arena.cx, arena.cy, 40, arena.cx, arena.cy, Math.max(W, H) * 0.78);
  base.addColorStop(0, '#111b2c');
  base.addColorStop(0.5, '#080d17');
  base.addColorStop(1, '#03050a');
  c.fillStyle = base;
  c.fillRect(0, 0, W, H);

  // faint outer architecture
  c.save();
  c.globalAlpha = 0.5;
  c.strokeStyle = 'rgba(88,108,138,.08)';
  c.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const xx = (i / 7) * W;
    c.beginPath(); c.moveTo(xx, 0); c.lineTo(arena.cx + (xx - arena.cx) * 0.3, arena.y); c.stroke();
  }
  c.restore();

  drawGate(c);

  // floor shadow + floor
  c.save();
  c.shadowColor = 'rgba(0,0,0,.85)';
  c.shadowBlur = 60;
  c.shadowOffsetY = 18;
  roundPath(c, arena.x, arena.y, arena.w, arena.h, 26);
  c.fillStyle = '#0a101a';
  c.fill();
  c.restore();

  roundPath(c, arena.x, arena.y, arena.w, arena.h, 26);
  const floor = c.createLinearGradient(0, arena.y, 0, arena.y + arena.h);
  floor.addColorStop(0, '#223149');
  floor.addColorStop(0.38, '#1a2639');
  floor.addColorStop(1, '#0e1826');
  c.fillStyle = floor;
  c.fill();

  c.save();
  roundPath(c, arena.x, arena.y, arena.w, arena.h, 26);
  c.clip();

  // slab grid
  const tileW = 86, tileH = 56;
  const cols = Math.ceil(arena.w / tileW) + 2;
  const rows = Math.ceil(arena.h / tileH) + 2;
  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      const x = arena.x + col * tileW + (row % 2 ? tileW * 0.5 : 0);
      const y = arena.y + row * tileH;
      const tint = Math.floor(rnd() * 3);
      c.fillStyle = tint === 0 ? 'rgba(255,255,255,.012)' : tint === 1 ? 'rgba(0,0,0,.05)' : 'rgba(91,120,158,.018)';
      c.fillRect(x + 2, y + 2, tileW - 4, tileH - 4);
      c.strokeStyle = 'rgba(3,6,10,.34)';
      c.lineWidth = 1.2;
      c.strokeRect(x + 1, y + 1, tileW - 2, tileH - 2);
      c.strokeStyle = 'rgba(144,172,204,.035)';
      c.beginPath(); c.moveTo(x + 3, y + 2.5); c.lineTo(x + tileW - 3, y + 2.5); c.stroke();
    }
  }

  // central mosaic
  const R = Math.min(arena.w, arena.h) * 0.225;
  c.save();
  c.translate(arena.cx, arena.cy);
  c.strokeStyle = 'rgba(217,165,74,.16)';
  c.lineWidth = 1.4;
  [R, R * 0.78, R * 0.42].forEach(rr => { c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.stroke(); });
  c.strokeStyle = 'rgba(217,165,74,.10)';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    c.beginPath();
    c.moveTo(Math.cos(a) * R * 0.44, Math.sin(a) * R * 0.44);
    c.lineTo(Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75);
    c.stroke();
    c.save();
    c.rotate(a);
    c.beginPath();
    c.moveTo(R * 0.83, 0); c.lineTo(R * 0.88, -4); c.lineTo(R * 0.93, 0); c.lineTo(R * 0.88, 4); c.closePath();
    c.stroke();
    c.restore();
  }
  c.rotate(Math.PI / 4);
  c.strokeStyle = 'rgba(217,165,74,.12)';
  c.strokeRect(-R * 0.12, -R * 0.12, R * 0.24, R * 0.24);
  c.restore();

  // cracks
  for (let i = 0; i < 28; i++) {
    let x = arena.x + rnd() * arena.w;
    let y = arena.y + rnd() * arena.h;
    c.beginPath(); c.moveTo(x, y);
    const segs = 2 + Math.floor(rnd() * 4);
    let a = rnd() * TAU;
    for (let s = 0; s < segs; s++) {
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a) * (13 + rnd() * 32);
      y += Math.sin(a) * (13 + rnd() * 32);
      c.lineTo(x, y);
    }
    c.strokeStyle = 'rgba(1,3,6,.36)';
    c.lineWidth = 1.2;
    c.stroke();
    c.strokeStyle = 'rgba(150,175,205,.035)';
    c.lineWidth = 0.6;
    c.stroke();
  }

  // ash patches
  for (let i = 0; i < 18; i++) {
    c.fillStyle = 'rgba(0,0,0,' + (0.05 + rnd() * 0.1) + ')';
    c.beginPath();
    c.ellipse(arena.x + rnd() * arena.w, arena.y + rnd() * arena.h, 12 + rnd() * 34, 6 + rnd() * 16, rnd() * TAU, 0, TAU);
    c.fill();
  }

  // gate light spill
  const spill = c.createLinearGradient(0, arena.y, 0, arena.y + arena.h * 0.6);
  spill.addColorStop(0, 'rgba(98,227,205,.09)');
  spill.addColorStop(0.32, 'rgba(98,227,205,.025)');
  spill.addColorStop(1, 'rgba(98,227,205,0)');
  c.fillStyle = spill;
  c.fillRect(arena.x, arena.y, arena.w, arena.h * 0.65);

  // inner edge shadows
  const topShade = c.createLinearGradient(0, arena.y, 0, arena.y + 40);
  topShade.addColorStop(0, 'rgba(0,0,0,.55)');
  topShade.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = topShade;
  c.fillRect(arena.x, arena.y, arena.w, 40);
  const sideShade = c.createLinearGradient(arena.x, 0, arena.x + 40, 0);
  sideShade.addColorStop(0, 'rgba(0,0,0,.35)');
  sideShade.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sideShade;
  c.fillRect(arena.x, arena.y, 40, arena.h);
  c.save(); c.translate(arena.x + arena.w, 0); c.scale(-1, 1); c.fillStyle = sideShade; c.fillRect(0, arena.y, 40, arena.h); c.restore();

  c.restore();

  // floor edge and gold inlay
  roundPath(c, arena.x, arena.y, arena.w, arena.h, 26);
  c.strokeStyle = 'rgba(3,5,9,.95)';
  c.lineWidth = 12;
  c.stroke();
  c.strokeStyle = 'rgba(145,111,52,.34)';
  c.lineWidth = 1.2;
  roundPath(c, arena.x + 7, arena.y + 7, arena.w - 14, arena.h - 14, 20);
  c.stroke();
  c.strokeStyle = 'rgba(217,165,74,.12)';
  c.lineWidth = 1;
  roundPath(c, arena.x + 13, arena.y + 13, arena.w - 26, arena.h - 26, 16);
  c.stroke();

  // wall glyph bands
  drawGreekBand(c, arena.x + 34, arena.x + arena.w - 34, arena.y + 15);
  drawGreekBand(c, arena.x + 34, arena.x + arena.w - 34, arena.y + arena.h - 23);

  // corners
  c.strokeStyle = 'rgba(217,165,74,.28)';
  c.lineWidth = 1.4;
  [[arena.x + 18, arena.y + 18, 1, 1], [arena.x + arena.w - 18, arena.y + 18, -1, 1],
   [arena.x + 18, arena.y + arena.h - 18, 1, -1], [arena.x + arena.w - 18, arena.y + arena.h - 18, -1, -1]].forEach(cor => {
    const [x, y, sx, sy] = cor;
    c.beginPath();
    c.moveTo(x, y + 18 * sy);
    c.lineTo(x, y);
    c.lineTo(x + 18 * sx, y);
    c.stroke();
  });

  // braziers
  decor.braziers = [
    { x: arena.x + 46, y: arena.y + 55, phase: 0.3 },
    { x: arena.x + arena.w - 46, y: arena.y + 55, phase: 2.1 },
    { x: arena.x + 46, y: arena.y + arena.h - 58, phase: 4.2 },
    { x: arena.x + arena.w - 46, y: arena.y + arena.h - 58, phase: 1.2 }
  ];
  decor.braziers.forEach(b => drawBrazierBase(c, b));
  decor.sigilR = Math.min(arena.w, arena.h) * 0.225;
}

function initMotes() {
  const count = clamp(Math.round(W * H / 24000), 22, 72);
  decor.motes = Array.from({ length: count }, () => ({
    x: rand(0, W),
    y: rand(0, H),
    size: rand(0.6, 1.9),
    speed: rand(7, 24),
    drift: rand(-10, 10),
    phase: rand(0, TAU),
    color: Math.random() < 0.72 ? 'gold' : Math.random() < 0.6 ? 'teal' : 'violet'
  }));
}

/* ============================================================
   INPUT
   ============================================================ */

function aimAngle() {
  const p = game.player;
  if (!p) return -PI / 2;
  if (touchUI) {
    const target = nearestEnemy(p.x, p.y, 620);
    if (target) return Math.atan2(target.y - p.y, target.x - p.x);
    const mv = moveVector();
    if (mv.len > 0.1) return Math.atan2(mv.y, mv.x);
    return p.angle;
  }
  if (game.pointer.moved) {
    return Math.atan2(game.pointer.y - p.y, game.pointer.x - p.x);
  }
  const target = nearestEnemy(p.x, p.y, 900);
  if (target) return Math.atan2(target.y - p.y, target.x - p.x);
  const mv = moveVector();
  return mv.len > 0.1 ? Math.atan2(mv.y, mv.x) : p.angle;
}

function moveVector() {
  let x = 0, y = 0;
  if (game.keys.has('KeyW') || game.keys.has('ArrowUp')) y -= 1;
  if (game.keys.has('KeyS') || game.keys.has('ArrowDown')) y += 1;
  if (game.keys.has('KeyA') || game.keys.has('ArrowLeft')) x -= 1;
  if (game.keys.has('KeyD') || game.keys.has('ArrowRight')) x += 1;
  x += game.joy.x;
  y += game.joy.y;
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y, len: Math.min(1, len) };
}

function selectWeapon(id) {
  if (!WEAPONS[id]) return;
  game.selectedWeapon = id;
  $$('.weapon-card').forEach(card => {
    const on = card.dataset.weapon === id;
    card.classList.toggle('selected', on);
    card.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if (Sfx.ac) Sfx.ui();
}

$$('.weapon-card').forEach(card => {
  card.addEventListener('click', () => selectWeapon(card.dataset.weapon));
});

ui.startBtn.addEventListener('click', () => beginRun(game.selectedWeapon));

window.addEventListener('keydown', e => {
  const code = e.code;
  const isGameKey = code === 'Space' || code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight';
  if (isGameKey && !e.target.closest('input,textarea')) e.preventDefault();

  if (game.mode === 'title') {
    if (code === 'Digit1' || code === 'Numpad1') selectWeapon('blade');
    if (code === 'Digit2' || code === 'Numpad2') selectWeapon('spear');
    if (code === 'Digit3' || code === 'Numpad3') selectWeapon('bow');
    if (code === 'Enter' || code === 'Space') beginRun(game.selectedWeapon);
    return;
  }

  if (game.mode === 'reward') {
    if (code === 'Digit1' || code === 'Numpad1') pickBoon(0);
    if (code === 'Digit2' || code === 'Numpad2') pickBoon(1);
    if (code === 'Digit3' || code === 'Numpad3') pickBoon(2);
    return;
  }

  if (code === 'Escape' || code === 'KeyP') {
    if (game.mode === 'playing' || game.mode === 'paused') togglePause();
    return;
  }

  if (game.mode !== 'playing') return;
  game.keys.add(code);

  if (code === 'Space' || code === 'ShiftLeft') tryDash();
  if (code === 'KeyK' || code === 'KeyQ') trySpecial();
  if (code === 'KeyJ') tryAttack();
});

window.addEventListener('keyup', e => {
  game.keys.delete(e.code);
});

window.addEventListener('blur', () => {
  game.keys.clear();
  game.pointer.down = false;
  game.touchAttack = false;
  resetJoystick();
});

canvas.addEventListener('mousemove', e => {
  game.pointer.x = e.clientX;
  game.pointer.y = e.clientY;
  if (game.mode === 'playing') game.pointer.moved = true;
});

window.addEventListener('mousedown', e => {
  if (touchUI || game.mode !== 'playing') return;
  if (e.target.closest('button, .screen, .hud-buttons')) return;
  if (e.button === 0) {
    game.pointer.down = true;
    tryAttack();
  } else if (e.button === 2) {
    trySpecial();
  }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) game.pointer.down = false;
});
window.addEventListener('contextmenu', e => {
  if (game.mode === 'playing') e.preventDefault();
});
canvas.addEventListener('touchstart', e => {
  if (game.mode !== 'playing') return;
  const t = e.touches[0];
  if (t) {
    game.pointer.x = t.clientX;
    game.pointer.y = t.clientY;
  }
}, { passive: true });

let joyPointer = null;
function resetJoystick() {
  game.joy.x = 0; game.joy.y = 0;
  joyPointer = null;
  ui.stickKnob.style.transform = 'translate(0px, 0px)';
}
function updateJoystick(e) {
  const r = ui.joystick.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const max = r.width * 0.33;
  const d = Math.hypot(dx, dy);
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }
  ui.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  game.joy.x = dx / max;
  game.joy.y = dy / max;
}
ui.joystick.addEventListener('pointerdown', e => {
  if (game.mode !== 'playing') return;
  e.preventDefault();
  joyPointer = e.pointerId;
  ui.joystick.setPointerCapture(e.pointerId);
  updateJoystick(e);
});
ui.joystick.addEventListener('pointermove', e => {
  if (e.pointerId !== joyPointer) return;
  e.preventDefault();
  updateJoystick(e);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => {
  ui.joystick.addEventListener(ev, e => {
    if (e.pointerId === joyPointer) resetJoystick();
  });
});

function bindHoldButton(btn, down, up) {
  btn.addEventListener('pointerdown', e => {
    if (game.mode !== 'playing') return;
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('active');
    down();
  });
  const end = e => {
    btn.classList.remove('active');
    if (up) up();
  };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => btn.addEventListener(ev, end));
}
bindHoldButton(ui.touchAttack, () => { game.touchAttack = true; tryAttack(); }, () => { game.touchAttack = false; });
bindHoldButton(ui.touchDash, () => tryDash());
bindHoldButton(ui.touchSpecial, () => trySpecial());

ui.muteBtn.addEventListener('click', () => {
  Sfx.ensure();
  Sfx.setMuted(!Sfx.muted);
  if (!Sfx.muted) Sfx.startAmbient();
});
ui.pauseBtn.addEventListener('click', () => togglePause());
ui.resumeBtn.addEventListener('click', () => togglePause());
ui.abandonBtn.addEventListener('click', () => goTitle());
ui.retryBtn.addEventListener('click', () => beginRun(game.run ? game.run.weapon : game.selectedWeapon));

/* ============================================================
   RUN LIFECYCLE
   ============================================================ */

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const roman = n => ROMAN[n] || String(n);

function hideScreens() {
  [ui.title, ui.reward, ui.pause, ui.end].forEach(s => s.classList.add('hidden'));
}

function setMode(mode) {
  game.mode = mode;
  document.body.dataset.mode = mode;
  const inRun = mode === 'playing' || mode === 'reward' || mode === 'paused';
  ui.hud.classList.toggle('hidden', !inRun);
  if (mode !== 'playing') {
    game.pointer.down = false;
    game.touchAttack = false;
    if (mode !== 'paused') resetJoystick();
  }
}

function showBanner(kicker, title, sub) {
  ui.bannerKicker.textContent = kicker || '';
  ui.bannerTitle.textContent = title || '';
  ui.bannerSub.textContent = sub || '';
  ui.banner.classList.remove('show');
  void ui.banner.offsetWidth;
  ui.banner.classList.add('show');
}

function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(game.toastTimer);
  game.toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2400);
}

function makePlayer() {
  return {
    x: arena.cx, y: arena.y + arena.h * 0.7, r: 17,
    vx: 0, vy: 0, angle: -PI / 2,
    hp: 100, maxHp: 100, iframes: 0, hurtT: 0,
    dashT: 0, dashDur: 0.16, dashCd: 0, dashDirX: 1, dashDirY: 0,
    attackCd: 0, attackAnim: 0, attackDur: 0, combo: 0, comboTimer: 0,
    specialCd: 0, swingDir: 1, walk: 0, dead: false, trail: []
  };
}

function initRun(weapon) {
  if (!WEAPONS[weapon]) weapon = game.selectedWeapon || 'blade';
  game.selectedWeapon = weapon;
  game.player = makePlayer();
  game.run = {
    chamber: 0, weapon, souls: 0, kills: 0, elapsed: 0,
    wave: 0, phase: 'intro', phaseT: 0, boons: [],
    buffs: {
      dmg: 1, speed: 1, atkSpeed: 1, crit: 0.06, critMult: 2,
      dashCd: 1, dmgReduce: 0, lifesteal: 0, maxHp: 100
    }
  };
  game.enemies = [];
  game.projectiles = [];
  game.effects = [];
  game.particles = [];
  game.numbers = [];
  game.pickups = [];
  game.spawnQueue = [];
  game.pendingBoons = [];
  game.hudBoonCount = -1;
  game.hitstop = 0;
  game.shake = 0;
  game.pointer.moved = false;
  updateWeaponHUD();
  updateBoonRow();
  startChamber(1);
}

function beginRun(weapon) {
  Sfx.ensure();
  if (!Sfx.muted) Sfx.startAmbient();
  hideScreens();
  setMode('playing');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  initRun(weapon);
  updateHUD();
}

function goTitle() {
  hideScreens();
  ui.title.classList.remove('hidden');
  setMode('title');
  game.player = null;
  game.run = null;
  game.enemies = [];
  game.projectiles = [];
  game.effects = [];
  game.particles = [];
  game.numbers = [];
  game.pickups = [];
  game.spawnQueue = [];
  game.pickups = [];
  game.pointer.moved = false;
}

function startChamber(n) {
  const run = game.run;
  if (!run) return;
  run.chamber = n;
  run.wave = 0;
  run.phase = 'intro';
  run.phaseT = 0.08;
  game.enemies = [];
  game.projectiles = [];
  game.effects = [];
  game.particles = [];
  game.numbers = [];
  game.pickups = [];
  game.spawnQueue = [];
  game.hitstop = 0;
  game.shake = 6;

  const p = game.player;
  p.x = arena.cx;
  p.y = arena.y + arena.h * 0.7;
  p.vx = p.vy = 0;
  p.angle = -PI / 2;
  p.iframes = 0.9;
  p.dashT = 0;
  p.dashCd = 0;
  p.attackCd = 0;
  p.specialCd = 0;
  p.attackAnim = 0;
  p.combo = 0;
  p.comboTimer = 0;
  p.trail = [];
  p.dead = false;

  if (n > 1) heal(12, false);

  const chamber = CHAMBERS[n - 1];
  showBanner('CHAMBER ' + roman(n), chamber.name, chamber.sub);
  updateHUD();
}

function startWave(w) {
  const run = game.run;
  if (!run || run.phase === 'cleared') return;
  run.wave = w;
  run.phase = 'combat';
  run.phaseT = 0;
  const comps = waveComposition(run.chamber, w);
  game.spawnQueue = comps.map((c, i) => ({
    type: c.type,
    elite: !!c.elite,
    delay: 0.01 + i * 0.04 + rand(0, 0.02),
    pos: findSpawnPoint()
  }));
  if (w > 1) {
    showBanner('WAVE ' + roman(w), w === 3 ? 'THE FINAL PRESS' : 'THE DEAD PRESS IN', '');
    Sfx.waveClear();
  }
  updateHUD();
}

function waveComposition(chamber, wave) {
  let list;
  if (chamber === 1) {
    if (wave === 1) list = ['wretch', 'wretch', 'wretch'];
    else if (wave === 2) list = ['wretch', 'wretch', 'wraith', 'wretch', 'wraith'];
    else list = ['brute', 'wretch', 'wretch', 'wraith', 'wraith', 'wretch'];
  } else if (chamber === 2) {
    if (wave === 1) list = ['wretch', 'wretch', 'wretch', 'wraith'];
    else if (wave === 2) list = ['wretch', 'wraith', 'wretch', 'wraith', 'wretch', 'wraith'];
    else list = ['brute', 'brute', 'wraith', 'wraith', 'wretch', 'wretch', 'wretch'];
  } else {
    if (wave === 1) list = ['wretch', 'wretch', 'wraith', 'wraith', 'wretch'];
    else if (wave === 2) list = ['brute', 'wretch', 'wretch', 'wraith', 'wraith', 'wretch', 'wraith'];
    else list = ['brute', 'brute', 'wraith', 'wraith', 'wraith', 'wretch', 'wretch', 'wretch', 'wretch'];
  }
  return list.map((type, i) => ({
    type,
    elite: chamber >= 3 && (i === 0 || (wave === 3 && type === 'brute'))
  }));
}

function findSpawnPoint() {
  const p = game.player;
  const margin = 58;
  let best = { x: arena.cx, y: arena.y + margin };
  let bestD = -1;
  for (let i = 0; i < 30; i++) {
    let x, y;
    const roll = Math.random();
    if (roll < 0.42) {
      x = rand(arena.x + margin, arena.x + arena.w - margin);
      y = rand(arena.y + margin, arena.y + arena.h * 0.33);
    } else if (roll < 0.7) {
      x = Math.random() < 0.5 ? rand(arena.x + margin, arena.x + arena.w * 0.28) : rand(arena.x + arena.w * 0.72, arena.x + arena.w - margin);
      y = rand(arena.y + margin, arena.y + arena.h - margin);
    } else {
      x = rand(arena.x + margin, arena.x + arena.w - margin);
      y = rand(arena.y + arena.h * 0.7, arena.y + arena.h - margin);
    }
    const d = hypot(x - p.x, y - p.y);
    if (d > bestD) { bestD = d; best = { x, y }; }
    if (d > Math.min(430, arena.w * 0.38)) break;
  }
  return best;
}

function spawnEnemy(entry) {
  const def = ENEMY_TYPES[entry.type];
  const run = game.run;
  const elite = entry.elite;
  const chamberScale = 1 + (run.chamber - 1) * 0.24;
  const r = def.r * (elite ? 1.28 : 1);
  const hp = Math.round(def.hp * chamberScale * (elite ? 1.9 : 1));
  const p = entry.pos;
  game.enemies.push({
    type: entry.type,
    x: p.x, y: p.y, r,
    hp, maxHp: hp,
    speed: def.speed * (1 + (run.chamber - 1) * 0.075) * (elite ? 1.08 : 1),
    damage: def.damage * (1 + (run.chamber - 1) * 0.12) * (elite ? 1.15 : 1),
    color: def.color,
    elite,
    angle: Math.atan2(game.player.y - p.y, game.player.x - p.x),
    state: 'spawn', spawnT: SPAWN_TIME, spawnMax: SPAWN_TIME, stateT: 0, atkCd: rand(0.5, 1.2),
    kx: 0, ky: 0, hitFlash: 0, phase: rand(0, TAU),
    strafe: Math.random() < 0.5 ? -1 : 1,
    lungeHit: false, lvx: 0, lvy: 0, slamAngle: 0, dead: false
  });
}

function nearestEnemy(x, y, maxDist = Infinity) {
  let best = null, bestD = maxDist;
  for (const e of game.enemies) {
    if (e.dead || e.state === 'spawn') continue;
    const d = hypot(e.x - x, e.y - y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/* ============================================================
   PLAYER ACTIONS
   ============================================================ */

function tryDash() {
  const p = game.player;
  const run = game.run;
  if (!p || !run || game.mode !== 'playing' || p.dead || p.dashT > 0 || p.dashCd > 0) return;
  let mv = moveVector();
  if (mv.len < 0.15) {
    mv = { x: Math.cos(p.angle), y: Math.sin(p.angle), len: 1 };
  }
  const len = Math.hypot(mv.x, mv.y) || 1;
  p.dashDirX = mv.x / len;
  p.dashDirY = mv.y / len;
  p.dashT = p.dashDur;
  p.dashCd = 1.05 * run.buffs.dashCd;
  p.iframes = Math.max(p.iframes, 0.28);
  p.vx = p.dashDirX * 340;
  p.vy = p.dashDirY * 340;
  game.shake = Math.max(game.shake, 3);
  Sfx.dash();
  for (let i = 0; i < 8; i++) {
    addParticle(p.x, p.y + 6, -p.dashDirX * rand(30, 150) + rand(-40, 40), -p.dashDirY * rand(30, 150) + rand(-40, 40), i % 3 ? '#7a6a50' : '#d9a54a', rand(1, 3), rand(0.18, 0.38), { drag: 2.4 });
  }
}

function tryAttack() {
  const p = game.player;
  const run = game.run;
  if (!p || !run || game.mode !== 'playing' || p.dead || p.dashT > 0 || p.attackCd > 0) return;
  p.angle = aimAngle();
  const w = WEAPONS[run.weapon];
  const crit = Math.random() < run.buffs.crit;
  const speed = run.buffs.atkSpeed;

  if (run.weapon === 'blade') {
    const combo = p.comboTimer > 0 ? (p.combo + 1) % 3 : 0;
    p.combo = combo;
    p.comboTimer = 0.82;
    const dmg = [15, 17, 27][combo];
    const range = combo === 2 ? 98 : 84;
    const arc = combo === 2 ? 2.25 : 1.85;
    p.attackCd = (combo === 2 ? 0.41 : 0.275) / speed;
    p.attackAnim = p.attackDur = combo === 2 ? 0.32 : 0.24;
    p.swingDir = combo === 1 ? -1 : 1;
    hitArc(p.angle, range, arc, dmg, combo === 2 ? 340 : 190, crit, w.color, combo);
    game.effects.push({
      type: 'slash', x: p.x, y: p.y, angle: p.angle, radius: range,
      arc, age: 0, dur: combo === 2 ? 0.34 : 0.25, color: w.color, combo
    });
    Sfx.swing();
    if (combo === 2) {
      game.shake = Math.max(game.shake, 6);
      for (let i = 0; i < 10; i++) {
        const a = p.angle + rand(-1.1, 1.1);
        addParticle(p.x + Math.cos(a) * range * 0.7, p.y + Math.sin(a) * range * 0.7, Math.cos(a) * rand(40, 160), Math.sin(a) * rand(40, 160), w.color, rand(1, 3), rand(0.2, 0.4), { glow: true });
      }
    }
  } else if (run.weapon === 'spear') {
    p.attackCd = 0.46 / speed;
    p.attackAnim = p.attackDur = 0.3;
    hitArc(p.angle, 132, 0.72, 27, 330, crit, w.color);
    game.effects.push({ type: 'thrust', x: p.x, y: p.y, angle: p.angle, length: 136, age: 0, dur: 0.22, color: w.color });
    Sfx.swing();
  } else {
    p.attackCd = 0.29 / speed;
    p.attackAnim = p.attackDur = 0.2;
    fireArrow(p.angle, 16, crit, 0);
    Sfx.shoot();
  }
}

function trySpecial() {
  const p = game.player;
  const run = game.run;
  if (!p || !run || game.mode !== 'playing' || p.dead || p.dashT > 0 || p.specialCd > 0) return;
  p.angle = aimAngle();
  const w = WEAPONS[run.weapon];
  const crit = Math.random() < run.buffs.crit;
  p.specialCd = w.specialCd;
  p.attackAnim = p.attackDur = 0.34;
  p.swingDir *= -1;

  if (run.weapon === 'blade') {
    const radius = 136;
    for (const e of game.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      if (hypot(e.x - p.x, e.y - p.y) <= radius + e.r) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        damageEnemy(e, 37, { crit, knockback: 560, angle: a, color: w.color });
      }
    }
    game.effects.push({ type: 'spin', x: p.x, y: p.y, radius, age: 0, dur: 0.5, color: w.color });
    game.shake = Math.max(game.shake, 12);
    game.hitstop = Math.max(game.hitstop, 0.06);
    Sfx.swing();
    Sfx.slam();
  } else if (run.weapon === 'spear') {
    game.projectiles.push({
      type: 'spear', friendly: true, x: p.x + Math.cos(p.angle) * 24, y: p.y + Math.sin(p.angle) * 24,
      angle: p.angle, speed: 980, damage: 23, crit, r: 7, life: 2.2,
      phase: 'out', age: 0, outTime: 0.42, hitSet: new Set(), color: '#62e3cd'
    });
    Sfx.shoot();
  } else {
    for (let i = -2; i <= 2; i++) {
      fireArrow(p.angle + i * 0.16, 14, crit, 0.03 * Math.abs(i), 1.05);
    }
    Sfx.shoot();
  }
  game.shake = Math.max(game.shake, 4);
}

function fireArrow(angle, damage, crit, spread = 0, speedMult = 1) {
  const p = game.player;
  const a = angle + rand(-spread, spread);
  game.projectiles.push({
    type: 'arrow', friendly: true, x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24,
    vx: Math.cos(a) * 960 * speedMult, vy: Math.sin(a) * 960 * speedMult,
    angle: a, damage, crit, r: 5, life: 1.35, color: '#f0c674', trail: 0
  });
}

function hitArc(angle, range, arc, damage, knockback, crit, color, combo = 0) {
  const p = game.player;
  let hit = false;
  for (const e of game.enemies) {
    if (e.dead || e.state === 'spawn') continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = hypot(dx, dy);
    if (d > range + e.r) continue;
    const da = Math.abs(angDiff(angle, Math.atan2(dy, dx)));
    if (da > arc * 0.5) continue;
    damageEnemy(e, damage, { crit, knockback, angle: Math.atan2(dy, dx), color });
    hit = true;
  }
  if (hit) {
    game.hitstop = Math.max(game.hitstop, combo === 2 ? 0.05 : 0.03);
  }
  return hit;
}

/* ============================================================
   COMBAT FEEDBACK
   ============================================================ */

function damageEnemy(e, amount, opts = {}) {
  if (!e || e.dead) return false;
  const run = game.run;
  const crit = opts.crit === undefined ? Math.random() < run.buffs.crit : opts.crit;
  const dmg = Math.max(1, Math.round(amount * run.buffs.dmg * (crit ? run.buffs.critMult : 1)));
  e.hp -= dmg;
  e.hitFlash = Math.max(e.hitFlash, 0.14);
  const angle = opts.angle !== undefined ? opts.angle : Math.atan2(e.y - game.player.y, e.x - game.player.x);
  if (opts.knockback) {
    const kb = e.type === 'brute' ? opts.knockback * 0.35 : opts.knockback;
    e.kx += Math.cos(angle) * kb;
    e.ky += Math.sin(angle) * kb;
  }
  addNumber(e.x, e.y - e.r - 8, String(dmg), crit ? '#ffd778' : '#fff1d6', crit);
  burst(e.x, e.y, opts.color || e.color, crit ? 13 : 6, crit ? 250 : 150);
  game.hitstop = Math.max(game.hitstop, crit ? 0.055 : 0.03);
  game.shake = Math.max(game.shake, crit ? 8 : 3.5);
  Sfx.hit(crit);
  if (e.hp <= 0) killEnemy(e);
  return true;
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  const run = game.run;
  run.kills++;
  burst(e.x, e.y, e.color, e.type === 'brute' ? 26 : 16, e.type === 'brute' ? 330 : 240);
  game.shake = Math.max(game.shake, e.type === 'brute' ? 14 : 5);
  Sfx.enemyDie();
  const n = e.type === 'brute' ? 4 : e.elite ? 3 : Math.random() < 0.35 ? 2 : 1;
  for (let i = 0; i < n; i++) dropSoul(e.x, e.y);
  if (e.type === 'brute' || Math.random() < 0.12) dropHeart(e.x, e.y);
  if (run.buffs.lifesteal > 0) heal(run.buffs.lifesteal, false);
}

function heal(amount, show = true) {
  const p = game.player;
  if (!p || p.dead) return;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  const gained = Math.round(p.hp - before);
  if (show && gained > 0) addNumber(p.x, p.y - 28, '+' + gained, '#7fe3a0', false);
}

function damagePlayer(amount, sourceAngle) {
  if (game.mode !== 'playing') return;
  const p = game.player;
  const run = game.run;
  if (!p || p.dead || p.iframes > 0 || p.dashT > 0) return;
  const dmg = Math.max(1, Math.round(amount * (1 - run.buffs.dmgReduce)));
  p.hp -= dmg;
  p.iframes = 0.78;
  p.hurtT = 0.35;
  game.shake = Math.max(game.shake, 13);
  burst(p.x, p.y, '#ef5a62', 12, 230);
  ui.flash.classList.remove('hurt');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('hurt');
  Sfx.hurt();
  if (p.hp <= 0) {
    p.hp = 0;
    playerDeath();
  }
}

function playerDeath() {
  const p = game.player;
  if (!p || p.dead) return;
  p.dead = true;
  burst(p.x, p.y, '#ef5a62', 40, 380);
  burst(p.x, p.y, '#f4d08a', 16, 250);
  game.shake = 22;
  Sfx.death();
  setMode('dead');
  setTimeout(() => showEnd(false), 700);
}

function winRun() {
  if (game.mode === 'victory' || game.mode === 'dead') return;
  setMode('victory');
  Sfx.clear();
  setTimeout(() => showEnd(true), 500);
}

function showEnd(won) {
  const run = game.run;
  if (!run) return;
  ui.end.classList.toggle('won', won);
  ui.endKicker.innerHTML = '<span></span>' + (won ? 'ESCAPED THE HOLLOW' : 'THE DESCENT ENDS') + '<span></span>';
  ui.endTitle.textContent = won ? 'THE CHAMBER YIELDS' : 'YOU DIED';
  ui.endSub.textContent = won
    ? 'You step through the last door. The dark lets go.'
    : 'Slain in Chamber ' + roman(run.chamber) + '. The Styx is patient.';
  ui.endChamber.textContent = roman(run.chamber);
  ui.endKills.textContent = run.kills;
  ui.endSouls.textContent = run.souls;
  ui.endTime.textContent = formatTime(run.elapsed);
  ui.end.classList.remove('hidden');
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/* ============================================================
   ENEMIES
   ============================================================ */

function updateSpawning(dt) {
  for (let i = game.spawnQueue.length - 1; i >= 0; i--) {
    const s = game.spawnQueue[i];
    s.delay -= dt;
    if (s.delay <= 0) {
      spawnEnemy(s);
      game.spawnQueue.splice(i, 1);
    }
  }
}

function updateEnemies(dt) {
  const p = game.player;
  if (!p) return;
  for (const e of game.enemies) {
    if (e.dead) continue;
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.state === 'spawn') {
      e.spawnT -= dt;
      if (e.spawnT <= 0) {
        e.state = 'idle';
        e.atkCd = rand(0.35, 0.8);
      }
      continue;
    }
    e.atkCd -= dt;
    e.kx *= Math.exp(-7 * dt);
    e.ky *= Math.exp(-7 * dt);
    e.x += e.kx * dt;
    e.y += e.ky * dt;

    if (e.type === 'wretch') updateWretch(e, dt);
    else if (e.type === 'wraith') updateWraith(e, dt);
    else updateBrute(e, dt);

    e.x = clamp(e.x, arena.x + e.r + 8, arena.x + arena.w - e.r - 8);
    e.y = clamp(e.y, arena.y + e.r + 8, arena.y + arena.h - e.r - 8);
  }

  // soft body separation
  for (let i = 0; i < game.enemies.length; i++) {
    const a = game.enemies[i];
    if (a.dead || a.state === 'spawn') continue;
    for (let j = i + 1; j < game.enemies.length; j++) {
      const b = game.enemies[j];
      if (b.dead || b.state === 'spawn') continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = hypot(dx, dy);
      const min = a.r + b.r - 2;
      if (d > 0 && d < min) {
        const push = (min - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }

  game.enemies = game.enemies.filter(e => !e.dead);
}

function updateWretch(e, dt) {
  const p = game.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  if (e.state !== 'lunge') e.angle = lerpAngle(e.angle, ang, 1 - Math.exp(-10 * dt));

  if (e.state === 'windup') {
    e.stateT -= dt;
    if (e.stateT <= 0) {
      e.state = 'lunge';
      e.stateT = 0.22;
      e.lungeHit = false;
      e.lvx = Math.cos(e.angle) * 560;
      e.lvy = Math.sin(e.angle) * 560;
      Sfx.growl();
      game.effects.push({ type: 'ring', x: e.x, y: e.y, r0: 8, r1: 34, age: 0, dur: 0.25, color: '#ef5a62', width: 2 });
    }
    return;
  }
  if (e.state === 'lunge') {
    e.x += e.lvx * dt;
    e.y += e.lvy * dt;
    e.stateT -= dt;
    if (!e.lungeHit && d < e.r + p.r + 5) {
      damagePlayer(e.damage, e.angle);
      e.lungeHit = true;
    }
    if (e.stateT <= 0) {
      e.state = 'recover';
      e.stateT = 0.45;
    }
    return;
  }
  if (e.state === 'recover') {
    e.stateT -= dt;
    if (e.stateT <= 0) {
      e.state = 'idle';
      e.atkCd = rand(0.75, 1.25);
    }
    return;
  }
  if (d > e.r + p.r + 8) {
    e.x += Math.cos(ang) * e.speed * dt;
    e.y += Math.sin(ang) * e.speed * dt;
  }
  if (d < 84 && e.atkCd <= 0) {
    e.state = 'windup';
    e.stateT = 0.36;
    e.angle = ang;
  }
}

function updateWraith(e, dt) {
  const p = game.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  e.angle = lerpAngle(e.angle, ang, 1 - Math.exp(-5 * dt));

  if (e.state === 'cast') {
    e.stateT -= dt;
    if (e.stateT <= 0) {
      fireOrb(e, ang);
      e.state = 'idle';
      e.atkCd = rand(2.05, 2.8);
    }
    return;
  }

  const desired = 255;
  let mx = 0, my = 0;
  if (d < desired - 50) { mx -= dx / d; my -= dy / d; }
  else if (d > desired + 70) { mx += dx / d; my += dy / d; }
  const strafe = Math.sin(game.time * 0.9 + e.phase) * e.strafe;
  mx += Math.cos(ang + PI / 2) * strafe;
  my += Math.sin(ang + PI / 2) * strafe;
  const ml = hypot(mx, my) || 1;
  e.x += mx / ml * e.speed * dt;
  e.y += my / ml * e.speed * dt;

  if (e.atkCd <= 0 && d < 540) {
    e.state = 'cast';
    e.stateT = 0.55;
  }
}

function fireOrb(e, angle) {
  const sx = e.x + Math.cos(angle) * 20;
  const sy = e.y + Math.sin(angle) * 20;
  game.projectiles.push({
    type: 'orb', friendly: false, x: sx, y: sy,
    vx: Math.cos(angle) * 250, vy: Math.sin(angle) * 250,
    r: 6, life: 3.4, damage: e.damage, angle, color: '#b58cff', trail: 0
  });
  game.effects.push({ type: 'ring', x: sx, y: sy, r0: 4, r1: 26, age: 0, dur: 0.24, color: '#a983ff', width: 2 });
  Sfx.orb();
}

function updateBrute(e, dt) {
  const p = game.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  e.angle = lerpAngle(e.angle, ang, 1 - Math.exp(-4 * dt));

  if (e.state === 'wind') {
    e.stateT -= dt;
    if (e.stateT <= 0) {
      bruteSlam(e);
      e.state = 'recover';
      e.stateT = 0.6;
      e.atkCd = 2.6;
    }
    return;
  }
  if (e.state === 'recover') {
    e.stateT -= dt;
    if (e.stateT <= 0) e.state = 'idle';
    return;
  }
  if (d > e.r + p.r + 8) {
    e.x += Math.cos(ang) * e.speed * dt;
    e.y += Math.sin(ang) * e.speed * dt;
  }
  if (d < 160 && e.atkCd <= 0) {
    e.state = 'wind';
    e.stateT = 0.82;
    e.slamAngle = ang;
    e.atkCd = 3.4;
  }
}

function bruteSlam(e) {
  const p = game.player;
  const radius = e.elite ? 148 : 130;
  game.effects.push({ type: 'slam', x: e.x, y: e.y, radius, age: 0, dur: 0.55, color: '#ef5a62' });
  game.effects.push({ type: 'ring', x: e.x, y: e.y, r0: radius * 0.3, r1: radius * 1.15, age: 0, dur: 0.4, color: '#f4d08a', width: 3 });
  game.shake = Math.max(game.shake, 20);
  for (let i = 0; i < 18; i++) {
    const a = rand(0, TAU);
    addParticle(e.x + Math.cos(a) * radius * 0.6, e.y + Math.sin(a) * radius * 0.35, Math.cos(a) * rand(80, 280), Math.sin(a) * rand(60, 190), i % 3 ? '#8d7a5c' : '#ef5a62', rand(2, 4), rand(0.3, 0.7), { drag: 2, gravity: 120 });
  }
  Sfx.slam();
  if (p && !p.dead && hypot(p.x - e.x, p.y - e.y) < radius + p.r) {
    damagePlayer(e.damage, Math.atan2(p.y - e.y, p.x - e.x));
  }
}

/* ============================================================
   PROJECTILES
   ============================================================ */

function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((cx - x1) * dx + (cy - y1) * dy) / l2;
  t = clamp(t, 0, 1);
  const px = x1 + dx * t, py = y1 + dy * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r;
}

function updateProjectiles(dt) {
  for (const pr of game.projectiles) {
    pr.life -= dt;
    if (pr.type === 'spear') {
      pr.age += dt;
      if (pr.phase === 'out') {
        const nx = pr.x + Math.cos(pr.angle) * pr.speed * dt;
        const ny = pr.y + Math.sin(pr.angle) * pr.speed * dt;
        for (const e of game.enemies) {
          if (e.dead || e.state === 'spawn' || pr.hitSet.has(e)) continue;
          if (segCircle(pr.x, pr.y, nx, ny, e.x, e.y, e.r + pr.r)) {
            pr.hitSet.add(e);
            damageEnemy(e, pr.damage, { crit: pr.crit, knockback: 260, angle: pr.angle, color: pr.color });
            pr.life -= 0.01;
          }
        }
        pr.x = nx; pr.y = ny;
        if (Math.random() < 0.8) addParticle(pr.x, pr.y, rand(-20, 20), rand(-20, 20), pr.color, rand(1, 2.5), rand(0.15, 0.3), { glow: true });
        if (pr.age >= pr.outTime) {
          pr.phase = 'return';
          pr.hitSet = new Set();
          pr.age = 0;
        }
      } else {
        const p = game.player;
        const dx = p.x - pr.x, dy = p.y - pr.y;
        const d = hypot(dx, dy) || 1;
        pr.angle = Math.atan2(dy, dx);
        const step = Math.min(1100 * dt, d);
        const nx = pr.x + dx / d * step;
        const ny = pr.y + dy / d * step;
        for (const e of game.enemies) {
          if (e.dead || e.state === 'spawn' || pr.hitSet.has(e)) continue;
          if (segCircle(pr.x, pr.y, nx, ny, e.x, e.y, e.r + pr.r)) {
            pr.hitSet.add(e);
            damageEnemy(e, pr.damage * 0.8, { crit: pr.crit, knockback: 180, angle: Math.atan2(dy, dx), color: pr.color });
          }
        }
        pr.x = nx; pr.y = ny;
        if (Math.random() < 0.8) addParticle(pr.x, pr.y, rand(-20, 20), rand(-20, 20), pr.color, rand(1, 2.5), rand(0.15, 0.3), { glow: true });
        if (d < 30) pr.life = 0;
      }
    } else {
      const nx = pr.x + (pr.vx || 0) * dt;
      const ny = pr.y + (pr.vy || 0) * dt;
      if (pr.friendly) {
        let hitSomething = false;
        for (const e of game.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          if (segCircle(pr.x, pr.y, nx, ny, e.x, e.y, e.r + pr.r)) {
            damageEnemy(e, pr.damage, { crit: pr.crit, knockback: 150, angle: pr.angle, color: pr.color });
            hitSomething = true;
            break;
          }
        }
        if (hitSomething) pr.life = 0;
        pr.trail = (pr.trail || 0) + dt;
        if (pr.trail > 0.03) {
          pr.trail = 0;
          addParticle(pr.x, pr.y, rand(-8, 8), rand(-8, 8), pr.color, rand(1, 2), rand(0.12, 0.24), { glow: true });
        }
      } else {
        const p = game.player;
        if (p && !p.dead && segCircle(pr.x, pr.y, nx, ny, p.x, p.y, p.r + pr.r)) {
          damagePlayer(pr.damage, pr.angle);
          pr.life = 0;
        }
        if (Math.random() < 0.5) addParticle(pr.x, pr.y, rand(-10, 10), rand(-10, 10), pr.color, rand(1, 2.5), rand(0.2, 0.4), { glow: true });
      }
      pr.x = nx; pr.y = ny;
      pr.angle = Math.atan2(pr.vy || Math.sin(pr.angle), pr.vx || Math.cos(pr.angle));
    }
    if (pr.x < arena.x - 120 || pr.x > arena.x + arena.w + 120 || pr.y < arena.y - 120 || pr.y > arena.y + arena.h + 120) {
      if (!(pr.type === 'spear' && pr.phase === 'return')) pr.life = Math.min(pr.life, 0);
    }
  }
  game.projectiles = game.projectiles.filter(p => p.life > 0);
}

/* ============================================================
   PICKUPS, EFFECTS, PARTICLES
   ============================================================ */

function dropSoul(x, y) {
  game.pickups.push({
    type: 'soul', x, y, vx: rand(-95, 95), vy: rand(-95, 95),
    r: 6, life: 20, age: 0, value: 1, dead: false
  });
}

function dropHeart(x, y) {
  game.pickups.push({
    type: 'heart', x, y, vx: rand(-70, 70), vy: rand(-70, 70),
    r: 7, life: 18, age: 0, value: 8, dead: false
  });
}

function updatePickups(dt) {
  const p = game.player;
  if (!p) return;
  for (const pk of game.pickups) {
    if (pk.dead) continue;
    pk.age += dt;
    pk.life -= dt;
    pk.x += pk.vx * dt;
    pk.y += pk.vy * dt;
    pk.vx *= Math.exp(-4.5 * dt);
    pk.vy *= Math.exp(-4.5 * dt);
    const dx = p.x - pk.x, dy = p.y - pk.y;
    const d = hypot(dx, dy) || 1;
    if (pk.age > 0.25 && d < 280) {
      const speed = 340 + (280 - d) * 3;
      pk.x += dx / d * speed * dt;
      pk.y += dy / d * speed * dt;
    }
    if (d < p.r + 10) {
      pk.dead = true;
      if (pk.type === 'soul') {
        game.run.souls += pk.value;
        for (let i = 0; i < 5; i++) addParticle(pk.x, pk.y, rand(-60, 60), rand(-60, 60), '#62e3cd', rand(1, 2.5), rand(0.2, 0.45), { glow: true });
      } else {
        heal(pk.value, true);
        for (let i = 0; i < 8; i++) addParticle(pk.x, pk.y, rand(-70, 70), rand(-70, 70), '#ef6b78', rand(1, 3), rand(0.25, 0.5), { glow: true });
      }
    }
  }
  game.pickups = game.pickups.filter(pk => !pk.dead && pk.life > 0);
}

function addParticle(x, y, vx, vy, color, size, life, opts = {}) {
  if (game.particles.length > 620) game.particles.shift();
  game.particles.push({
    x, y, vx, vy, color, size,
    life, maxLife: life,
    gravity: opts.gravity || 0,
    drag: opts.drag || 2,
    glow: !!opts.glow,
    shape: opts.shape || 'circle'
  });
}

function burst(x, y, color, n = 6, speed = 160) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const s = rand(speed * 0.25, speed);
    addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, color, rand(1.2, 3.6), rand(0.18, 0.5), { glow: true, drag: 2.6 });
  }
}

function addNumber(x, y, text, color, crit) {
  game.numbers.push({
    x, y, text, color, crit,
    life: crit ? 0.95 : 0.75, maxLife: crit ? 0.95 : 0.75,
    vx: rand(-14, 14), vy: crit ? -82 : -62
  });
}

function updateEffects(dt) {
  for (const e of game.effects) e.age += dt;
  game.effects = game.effects.filter(e => e.age < e.dur);
}

function updateParticles(dt) {
  for (const pt of game.particles) {
    pt.life -= dt;
    pt.vx *= Math.exp(-pt.drag * dt);
    pt.vy *= Math.exp(-pt.drag * dt);
    pt.vy += pt.gravity * dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
  game.particles = game.particles.filter(pt => pt.life > 0);
}

function updateNumbers(dt) {
  for (const n of game.numbers) {
    n.life -= dt;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    n.vy += 74 * dt;
  }
  game.numbers = game.numbers.filter(n => n.life > 0);
}

function updateMotes(dt) {
  for (const m of decor.motes) {
    m.y -= m.speed * dt;
    m.x += Math.sin(game.time * 0.45 + m.phase) * m.drift * dt;
    if (m.y < -8) { m.y = H + 8; m.x = rand(0, W); }
    if (m.x < -8) m.x = W + 8;
    if (m.x > W + 8) m.x = -8;
  }
  if ((game.mode === 'playing' || game.mode === 'title') && Math.random() < dt * 7) {
    const b = pick(decor.braziers);
    addParticle(b.x + rand(-5, 5), b.y - 10, rand(-7, 7), rand(-28, -12), Math.random() < 0.7 ? '#f0b25a' : '#ff8a3c', rand(0.7, 1.7), rand(0.7, 1.8), { drag: 0.6, glow: true });
  }
}

/* ============================================================
   RUN PHASE + HUD
   ============================================================ */

function updatePhase(dt) {
  const run = game.run;
  if (!run) return;
  if (run.phase === 'intro') {
    run.phaseT -= dt;
    if (run.phaseT <= 0) startWave(1);
  } else if (run.phase === 'combat') {
    if (game.enemies.length === 0 && game.spawnQueue.length === 0) {
      if (run.wave < 3) {
        run.phase = 'wavebreak';
        run.phaseT = 1.05;
        showBanner('WAVE ' + roman(run.wave) + ' CLEARED', 'THE DEAD MAKE ROOM', '');
        Sfx.waveClear();
      } else {
        run.phase = 'cleared';
        run.phaseT = 1.5;
        game.projectiles = [];
        showBanner('CHAMBER ' + roman(run.chamber) + ' CLEARED', 'THE GATE OPENS', '');
        Sfx.clear();
      }
    }
  } else if (run.phase === 'wavebreak') {
    run.phaseT -= dt;
    if (run.phaseT <= 0) startWave(run.wave + 1);
  } else if (run.phase === 'cleared') {
    run.phaseT -= dt;
    if (run.phaseT <= 0) {
      if (run.chamber >= 3) winRun();
      else openReward();
    }
  }
}

function openReward() {
  const run = game.run;
  if (!run) return;
  setMode('reward');
  game.pendingBoons = chooseBoons(3);
  ui.boonGrid.innerHTML = game.pendingBoons.map((b, i) =>
    '<button class="boon-card" data-index="' + i + '" style="--bc:' + b.color + '">' +
      '<span class="b-key">' + (i + 1) + '</span>' +
      '<span class="b-icon"><svg><use href="#icon-' + b.icon + '"/></svg></span>' +
      '<span class="b-rarity">' + b.rarity + '</span>' +
      '<span class="b-name">' + b.name + '</span>' +
      '<span class="b-desc">' + b.desc + '</span>' +
      '<span class="b-flavor">' + b.flavor + '</span>' +
    '</button>'
  ).join('');
  ui.boonGrid.querySelectorAll('.boon-card').forEach(card => {
    card.addEventListener('click', () => pickBoon(Number(card.dataset.index)));
  });
  ui.reward.classList.remove('hidden');
}

function chooseBoons(count) {
  const run = game.run;
  const pool = BOONS.filter(b => !run.boons.some(o => o.id === b.id));
  const out = [];
  while (out.length < count && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

function pickBoon(index) {
  if (game.mode !== 'reward') return;
  const b = game.pendingBoons[index];
  if (!b) return;
  b.apply(game.run);
  game.run.boons.push(b);
  game.pendingBoons = [];
  ui.reward.classList.add('hidden');
  setMode('playing');
  updateBoonRow();
  showToast(b.name + ' — ' + b.desc);
  Sfx.boon();
  if (game.run.chamber >= 3) winRun();
  else startChamber(game.run.chamber + 1);
}

function updateWeaponHUD() {
  const run = game.run;
  if (!run) return;
  const w = WEAPONS[run.weapon];
  ui.hudWeaponName.textContent = w.name;
  ui.hudWeaponPerk.textContent = w.perk;
  ui.hudWeaponIcon.style.setProperty('--wc', w.color);
  ui.hudWeaponIcon.innerHTML = '<svg><use href="#icon-' + w.icon + '"/></svg>';
}

function updateBoonRow() {
  const run = game.run;
  if (!run) return;
  if (game.hudBoonCount === run.boons.length) return;
  game.hudBoonCount = run.boons.length;
  ui.boonRow.innerHTML = run.boons.map(b =>
    '<span class="boon-pip" style="--bc:' + b.color + '" title="' + b.name + ': ' + b.desc + '">' +
      '<svg><use href="#icon-' + b.icon + '"/></svg>' +
    '</span>'
  ).join('');
}

function setAbility(el, cd, max) {
  const frac = clamp(cd / max, 0, 1);
  el.style.setProperty('--cd', frac.toFixed(3));
  el.classList.toggle('cooling', frac > 0.002);
}

function updateHUD() {
  const run = game.run;
  const p = game.player;
  if (!run || !p) return;
  const pct = clamp(p.hp / p.maxHp, 0, 1);
  ui.hpFill.style.width = (pct * 100).toFixed(2) + '%';
  ui.hpChip.style.width = (pct * 100).toFixed(2) + '%';
  ui.hpText.textContent = Math.ceil(p.hp) + ' / ' + p.maxHp;
  ui.chamberLabel.textContent = 'CHAMBER ' + roman(run.chamber);

  ui.wavePips.forEach((pip, i) => {
    const done = run.phase === 'cleared' || run.wave > i + 1 || (run.phase === 'wavebreak' && run.wave === i + 1);
    const current = run.phase === 'combat' && run.wave === i + 1;
    pip.classList.toggle('done', done);
    pip.classList.toggle('current', current);
  });

  const foes = game.enemies.filter(e => !e.dead).length + game.spawnQueue.length;
  if (run.phase === 'cleared') ui.foeCount.textContent = 'THE GATE IS OPEN';
  else if (run.phase === 'intro') ui.foeCount.textContent = 'THE CHAMBER STIRS';
  else ui.foeCount.textContent = 'FOES REMAIN — ' + foes;

  ui.soulCount.textContent = run.souls;
  ui.killCount.textContent = run.kills;

  const w = WEAPONS[run.weapon];
  setAbility(ui.abAttack, Math.max(0, p.attackCd), w.attackCd / run.buffs.atkSpeed);
  setAbility(ui.abSpecial, Math.max(0, p.specialCd), w.specialCd);
  setAbility(ui.abDash, Math.max(0, p.dashCd), 1.05 * run.buffs.dashCd);

  ui.touchDash.classList.toggle('cooling', p.dashCd > 0.02);
  ui.touchSpecial.classList.toggle('cooling', p.specialCd > 0.02);
  updateBoonRow();
}

function togglePause() {
  if (game.mode === 'playing') {
    setMode('paused');
    const run = game.run;
    ui.pauseSub.textContent = run ? 'Chamber ' + roman(run.chamber) + ' · Wave ' + (run.wave || 0) + ' · ' + formatTime(run.elapsed) : '';
    ui.pause.classList.remove('hidden');
    Sfx.ui();
  } else if (game.mode === 'paused') {
    ui.pause.classList.add('hidden');
    setMode('playing');
    Sfx.ui();
  }
}

/* ============================================================
   UPDATE LOOP
   ============================================================ */

function update(dt) {
  game.time += dt;
  updateMotes(dt);
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 46);

  if (game.mode === 'playing') {
    const run = game.run;
    if (!run) return;
    run.elapsed += dt;
    if (game.hitstop > 0) game.hitstop = Math.max(0, game.hitstop - dt);
    const sdt = game.hitstop > 0 ? dt * 0.07 : dt;
    updateSpawning(sdt);
    if (game.mode === 'playing') updatePlayer(sdt);
    if (game.mode === 'playing') updateEnemies(sdt);
    if (game.mode === 'playing') updateProjectiles(sdt);
    if (game.mode === 'playing') updatePickups(sdt);
    updateEffects(dt);
    updateParticles(dt);
    updateNumbers(dt);
    if (game.mode === 'playing') updatePhase(sdt);
    updateHUD();
  } else {
    updateEffects(dt);
    updateParticles(dt);
    updateNumbers(dt);
    if (game.mode === 'reward' || game.mode === 'dead' || game.mode === 'victory') updatePickups(dt * 0.35);
  }
}

function updatePlayer(dt) {
  const p = game.player;
  const run = game.run;
  if (!p || !run || p.dead) return;

  p.iframes = Math.max(0, p.iframes - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.attackCd = Math.max(0, p.attackCd - dt);
  p.specialCd = Math.max(0, p.specialCd - dt);
  p.comboTimer = Math.max(0, p.comboTimer - dt);
  p.attackAnim = Math.max(0, p.attackAnim - dt);

  if (game.mode === 'playing') p.angle = aimAngle();

  const mv = moveVector();
  if (p.dashT > 0) {
    p.dashT = Math.max(0, p.dashT - dt);
    p.x += p.dashDirX * 1080 * dt;
    p.y += p.dashDirY * 1080 * dt;
    p.trail.push({ x: p.x, y: p.y, angle: p.angle, t: 0.2, max: 0.2 });
    if (Math.random() < 0.65) {
      addParticle(p.x, p.y + 7, rand(-40, 40), rand(-40, 40), Math.random() < 0.5 ? '#6b5a3e' : '#d9a54a', rand(1, 2.8), rand(0.15, 0.3), { drag: 2.5 });
    }
  } else {
    const speed = 322 * run.buffs.speed;
    const targetX = mv.x * speed;
    const targetY = mv.y * speed;
    const k = 1 - Math.exp(-(mv.len > 0.05 ? 13 : 9) * dt);
    p.vx += (targetX - p.vx) * k;
    p.vy += (targetY - p.vy) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  p.walk += hypot(p.vx, p.vy) * dt * 0.022;
  p.x = clamp(p.x, arena.x + p.r + 14, arena.x + arena.w - p.r - 14);
  p.y = clamp(p.y, arena.y + p.r + 14, arena.y + arena.h - p.r - 14);

  for (const t of p.trail) t.t -= dt;
  p.trail = p.trail.filter(t => t.t > 0);

  const held = game.pointer.down || game.keys.has('KeyJ') || game.touchAttack;
  if (held) tryAttack();
}

/* ============================================================
   RENDER
   ============================================================ */

function drawGateGlow() {
  if (!decor.gate) return;
  const t = game.time;
  const pulse = 0.82 + Math.sin(t * 1.4) * 0.1 + Math.sin(t * 3.7) * 0.04;
  const g = decor.gate;
  const grad = ctx.createRadialGradient(g.x, g.y, 3, g.x, g.y, g.r * 1.5 * pulse);
  grad.addColorStop(0, 'rgba(98,227,205,.20)');
  grad.addColorStop(0.4, 'rgba(73,183,188,.08)');
  grad.addColorStop(1, 'rgba(73,183,188,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grad;
  ctx.fillRect(g.x - g.r * 2, g.y - g.r * 2, g.r * 4, g.r * 4);
  ctx.restore();
}

function drawBrazierFlames() {
  const t = game.time;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of decor.braziers) {
    const flick = 0.86 + Math.sin(t * 8.7 + b.phase) * 0.09 + Math.sin(t * 17.3 + b.phase * 2.7) * 0.05;
    const glow = ctx.createRadialGradient(b.x, b.y - 10, 2, b.x, b.y - 10, 120 * flick);
    glow.addColorStop(0, 'rgba(255,181,88,.19)');
    glow.addColorStop(0.35, 'rgba(255,128,42,.075)');
    glow.addColorStop(1, 'rgba(255,110,30,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(b.x, b.y - 10, 122 * flick, 0, TAU); ctx.fill();

    const sway = Math.sin(t * 6.4 + b.phase) * 3.5;
    const h = 25 * flick;
    const flame = (w, hh, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(b.x - w * 0.55, b.y - 4);
      ctx.quadraticCurveTo(b.x - w, b.y - hh * 0.42, b.x + sway * 0.2, b.y - hh);
      ctx.quadraticCurveTo(b.x + w, b.y - hh * 0.42, b.x + w * 0.55, b.y - 4);
      ctx.closePath();
      ctx.fill();
    };
    flame(9, h, 'rgba(255,112,32,.36)');
    flame(6, h * 0.82, 'rgba(255,186,72,.46)');
    flame(3, h * 0.55, 'rgba(255,248,205,.72)');
    if (Math.random() < 0.12) {
      addParticle(b.x + rand(-4, 4), b.y - 20, rand(-6, 6), rand(-40, -20), '#ffb85c', rand(0.8, 1.7), rand(0.6, 1.3), { drag: 0.5, glow: true });
    }
  }
  ctx.restore();
}

function drawMotes() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of decor.motes) {
    const alpha = 0.12 + (Math.sin(game.time * 0.9 + m.phase) * 0.5 + 0.5) * 0.26;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = m.color === 'gold' ? '#e8b563' : m.color === 'teal' ? '#62e3cd' : '#a983ff';
    ctx.beginPath(); ctx.arc(m.x, m.y, m.size, 0, TAU); ctx.fill();
    if (m.size > 1.4) {
      ctx.globalAlpha = alpha * 0.28;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.size * 2.6, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

function drawTitleAura() {
  const t = game.time;
  const cx = arena.cx, cy = arena.cy;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.035);
  ctx.strokeStyle = 'rgba(217,165,74,.075)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 12]);
  ctx.beginPath(); ctx.arc(0, 0, Math.min(arena.w, arena.h) * 0.31, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(-t * 0.07);
  ctx.strokeStyle = 'rgba(217,165,74,.045)';
  ctx.beginPath(); ctx.arc(0, 0, Math.min(arena.w, arena.h) * 0.38, 0, TAU); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(Math.min(arena.w, arena.h) * 0.31, 0);
    ctx.rotate(PI / 4);
    ctx.strokeStyle = 'rgba(217,165,74,.10)';
    ctx.strokeRect(-3, -3, 6, 6);
    ctx.restore();
  }
  ctx.restore();

  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.min(arena.w, arena.h) * 0.42);
  g.addColorStop(0, 'rgba(217,165,74,.035)');
  g.addColorStop(0.6, 'rgba(98,227,205,.018)');
  g.addColorStop(1, 'rgba(98,227,205,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(arena.x, arena.y, arena.w, arena.h);
  ctx.restore();
}

function drawReticle() {
  if (touchUI || !game.pointer.moved || game.mode !== 'playing') return;
  const x = game.pointer.x, y = game.pointer.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(244,208,138,.72)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(244,208,138,.36)';
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(244,208,138,.78)';
  ctx.beginPath();
  ctx.moveTo(-13, 0); ctx.lineTo(-8, 0); ctx.moveTo(8, 0); ctx.lineTo(13, 0);
  ctx.moveTo(0, -13); ctx.lineTo(0, -8); ctx.moveTo(0, 8); ctx.lineTo(0, 13);
  ctx.stroke();
  ctx.fillStyle = '#f4d08a';
  ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawLowHealth() {
  if (game.mode !== 'playing' || !game.player) return;
  const pct = game.player.hp / game.player.maxHp;
  if (pct > 0.36) return;
  const pulse = 0.25 + Math.sin(game.time * 5.4) * 0.11;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.24, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(150,10,25,0)');
  g.addColorStop(0.75, 'rgba(150,10,25,' + (0.08 + pulse * 0.08) + ')');
  g.addColorStop(1, 'rgba(150,10,25,' + (0.28 + pulse * 0.12) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#04060b';
  ctx.fillRect(0, 0, W, H);

  const sh = game.shake;
  const sx = sh > 0.3 ? (Math.random() * 2 - 1) * sh * 0.55 : 0;
  const sy = sh > 0.3 ? (Math.random() * 2 - 1) * sh * 0.4 : 0;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.drawImage(bgCanvas, 0, 0, W, H);
  drawGateGlow();
  drawBrazierFlames();
  drawMotes();

  if (game.mode === 'title') {
    drawTitleAura();
    ctx.restore();
    return;
  }

  drawSpawnRunes();
  drawPickups();

  const drawables = [];
  for (const e of game.enemies) {
    if (!e.dead) drawables.push({ y: e.y, draw: () => drawEnemy(e) });
  }
  if (game.player) {
    const p = game.player;
    drawables.push({ y: p.y + 0.5, draw: drawPlayer });
  }
  drawables.sort((a, b) => a.y - b.y);
  drawables.forEach(d => d.draw());

  drawEnemyBars();
  drawProjectiles();
  drawEffects();
  drawParticles();
  drawNumbers();
  ctx.restore();

  drawReticle();
  drawLowHealth();
}

/* ============================================================
   ENTITY PAINTING
   ============================================================ */

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

function drawSpawnRunes() {
  const t = game.time;
  for (const e of game.enemies) {
    if (e.dead) continue;
    if (e.state === 'spawn') {
      const prog = clamp(1 - e.spawnT / (e.spawnMax || SPAWN_TIME), 0, 1);
      const a = 0.2 + prog * 0.55;
      ctx.save();
      ctx.translate(e.x, e.y + 8);
      ctx.scale(1, 0.42);
      ctx.rotate(t * 1.4 + e.phase);
      ctx.globalAlpha = a;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.arc(0, 0, e.r * 2.25, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(0, 0, e.r * 1.35, 0, TAU); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const ang = i / 3 * TAU;
        ctx.moveTo(Math.cos(ang) * e.r * 1.35, Math.sin(ang) * e.r * 1.35);
        ctx.lineTo(Math.cos(ang + 1.4) * e.r * 1.95, Math.sin(ang + 1.4) * e.r * 1.95);
      }
      ctx.stroke();
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.9 * prog, 0, TAU); ctx.fill();
      ctx.restore();
    }

    if (e.type === 'brute' && e.state === 'wind') {
      const prog = clamp(1 - e.stateT / 0.82, 0, 1);
      const radius = e.elite ? 148 : 130;
      ctx.save();
      ctx.translate(e.x, e.y + 7);
      ctx.scale(1, 0.45);
      ctx.fillStyle = 'rgba(198,48,60,' + (0.05 + prog * 0.10) + ')';
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(239,90,98,' + (0.35 + prog * 0.4) + ')';
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 8]);
      ctx.beginPath(); ctx.arc(0, 0, radius, -PI / 2, -PI / 2 + TAU * prog); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(239,90,98,.28)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, radius * 0.62, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    if (e.type === 'wretch' && e.state === 'windup') {
      const prog = clamp(1 - e.stateT / 0.36, 0, 1);
      ctx.save();
      ctx.translate(e.x, e.y + 7);
      ctx.scale(1, 0.42);
      ctx.rotate(e.angle);
      const g = ctx.createLinearGradient(0, 0, 100, 0);
      g.addColorStop(0, 'rgba(239,90,98,.28)');
      g.addColorStop(1, 'rgba(239,90,98,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(6, -7);
      ctx.lineTo(102 * (0.4 + prog * 0.6), 0);
      ctx.lineTo(6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (e.type === 'wraith' && e.state === 'cast') {
      const p = game.player;
      const prog = clamp(1 - e.stateT / 0.55, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.12 + prog * 0.16;
      ctx.strokeStyle = '#a983ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 9]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(e.x, e.y, 22 + prog * 7, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
}

function drawEnemy(e) {
  const scale = e.r / ENEMY_TYPES[e.type].r;
  const spawnAlpha = e.state === 'spawn' ? clamp(1 - e.spawnT / (e.spawnMax || SPAWN_TIME), 0, 1) : 1;
  if (spawnAlpha <= 0.02) return;

  // shadow
  ctx.save();
  ctx.globalAlpha = 0.34 * spawnAlpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + e.r * 0.6, e.r * 1.2, e.r * 0.48, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (e.elite) {
    ctx.save();
    ctx.translate(e.x, e.y + e.r * 0.65);
    ctx.scale(1, 0.42);
    ctx.strokeStyle = 'rgba(244,208,138,.65)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 6]);
    ctx.rotate(game.time * 0.5);
    ctx.beginPath(); ctx.arc(0, 0, e.r * 1.65, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#d9a54a';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 1.65, 0, TAU); ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = spawnAlpha;
  ctx.translate(e.x, e.y);
  const rise = (1 - spawnAlpha) * 12;
  ctx.translate(0, rise);
  ctx.rotate(e.angle);
  ctx.scale(scale * (0.7 + spawnAlpha * 0.3), scale * (0.7 + spawnAlpha * 0.3));
  if (e.type === 'wretch') drawWretch(e);
  else if (e.type === 'wraith') drawWraith(e);
  else drawBrute(e);

  if (e.hitFlash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(e.hitFlash * 5, 0, 0.9);
    ctx.fillStyle = '#fff4e6';
    ctx.beginPath(); ctx.ellipse(0, 0, e.r * 0.95, e.r * 0.85, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawWretch(e) {
  const t = game.time;
  const wob = Math.sin(t * 10 + e.phase) * 1.5;
  ctx.save();
  ctx.translate(0, wob);

  // skittering limbs
  ctx.strokeStyle = '#5d2029';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const swing = Math.sin(t * 13 + e.phase + i * 2) * 4;
    const side = i % 2 === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(-4 - i * 3, side * 7);
    ctx.lineTo(-14 - i * 4 + swing, side * 13);
    ctx.lineTo(-20 - i * 3 + swing, side * 9);
    ctx.stroke();
  }

  // back spines
  ctx.fillStyle = '#40151c';
  for (let i = 0; i < 3; i++) {
    const bx = -12 + i * 6;
    ctx.beginPath();
    ctx.moveTo(bx, -8);
    ctx.lineTo(bx - 3, -16 - i * 2);
    ctx.lineTo(bx + 4, -8);
    ctx.closePath();
    ctx.fill();
  }

  // body
  const g = ctx.createLinearGradient(-16, -10, 18, 10);
  g.addColorStop(0, '#8b3038');
  g.addColorStop(0.55, '#651f29');
  g.addColorStop(1, '#351018');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(-2, 0, 16, 11.5, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.stroke();

  // claws
  ctx.strokeStyle = '#d9a54a';
  ctx.lineWidth = 1.6;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(7, side * 8);
    ctx.lineTo(18, side * 12);
    ctx.lineTo(23, side * 9);
    ctx.stroke();
  }

  // head
  ctx.fillStyle = '#7a2631';
  ctx.beginPath(); ctx.ellipse(12, 0, 8.2, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a141c';
  ctx.beginPath(); ctx.ellipse(14, 0, 5, 4.4, 0, 0, TAU); ctx.fill();

  // horns
  ctx.fillStyle = '#c9ab79';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(13, side * 5.5);
    ctx.quadraticCurveTo(22, side * 12, 24, side * 15);
    ctx.quadraticCurveTo(18, side * 8, 16, side * 5.2);
    ctx.closePath();
    ctx.fill();
  }

  // eyes
  const eye = e.state === 'windup' ? '#fff0b2' : '#ffb15e';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = eye;
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.arc(16.5, side * 2.7, 1.5 + (e.state === 'windup' ? 0.7 : 0), 0, TAU); ctx.fill();
  }
  ctx.restore();

  if (e.state === 'windup') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3 + Math.sin(t * 30) * 0.12;
    ctx.fillStyle = '#ef5a62';
    ctx.beginPath(); ctx.ellipse(1, 0, 22, 18, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawWraith(e) {
  const t = game.time;
  const bob = Math.sin(t * 2.2 + e.phase) * 4;
  const castProg = e.state === 'cast' ? clamp(1 - e.stateT / 0.55, 0, 1) : 0;
  ctx.save();
  ctx.translate(0, bob);

  // tattered cloak
  const g = ctx.createLinearGradient(-24, 0, 16, 0);
  g.addColorStop(0, 'rgba(46,28,82,.12)');
  g.addColorStop(0.35, '#5a3d8e');
  g.addColorStop(0.75, '#332057');
  g.addColorStop(1, '#1c1233');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(2, -9);
  ctx.quadraticCurveTo(-12, -18, -22, -9);
  ctx.lineTo(-28 + Math.sin(t * 4 + e.phase) * 3, -3);
  ctx.lineTo(-20, 0);
  ctx.lineTo(-27 + Math.cos(t * 3.4 + e.phase) * 4, 6);
  ctx.lineTo(-14, 8);
  ctx.lineTo(-18 + Math.sin(t * 5 + e.phase) * 3, 14);
  ctx.quadraticCurveTo(-2, 16, 6, 8);
  ctx.closePath();
  ctx.fill();

  // hood
  ctx.fillStyle = '#2a1a45';
  ctx.beginPath(); ctx.ellipse(6, 0, 11, 10, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#100b1d';
  ctx.beginPath(); ctx.ellipse(9, 0, 7, 7, 0, 0, TAU); ctx.fill();

  // eyes
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = e.state === 'cast' ? '#eadcff' : '#b58cff';
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.arc(12, side * 3, 1.7, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(12, side * 3, 5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // orb
  const orbR = 3.5 + castProg * 5.5;
  const ox = 20, oy = 0;
  const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, orbR * 3.2);
  og.addColorStop(0, 'rgba(245,235,255,.95)');
  og.addColorStop(0.25, 'rgba(181,140,255,.75)');
  og.addColorStop(1, 'rgba(169,131,255,0)');
  ctx.fillStyle = og;
  ctx.beginPath(); ctx.arc(ox, oy, orbR * 3.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d9c6ff';
  ctx.beginPath(); ctx.arc(ox, oy, orbR * 0.55, 0, TAU); ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawBrute(e) {
  const t = game.time;
  const wind = e.state === 'wind';
  const bob = Math.sin(t * 3.4 + e.phase) * 1.2;
  ctx.save();
  ctx.translate(0, bob);

  // legs
  ctx.strokeStyle = '#2b231c';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-8, side * 14);
    ctx.lineTo(-13, side * 24);
    ctx.lineTo(-8, side * 31);
    ctx.stroke();
  }

  // body armor
  const g = ctx.createLinearGradient(-24, -18, 26, 18);
  g.addColorStop(0, '#6d5a40');
  g.addColorStop(0.45, '#3e3528');
  g.addColorStop(1, '#171510');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(-3, 0, 27, 23, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.4; ctx.stroke();

  // shoulder plates
  ctx.fillStyle = '#544530';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-2, side * 22, 11, 8, side * 0.3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(217,165,74,.22)';
    ctx.stroke();
  }

  // glowing cracks
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = wind ? 'rgba(255,160,100,.9)' : 'rgba(240,180,90,.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-15, -7); ctx.lineTo(-7, -2); ctx.lineTo(-10, 6); ctx.lineTo(1, 9);
  ctx.moveTo(-1, -15); ctx.lineTo(5, -9); ctx.lineTo(2, -2);
  ctx.stroke();
  ctx.restore();

  // head / helm
  ctx.fillStyle = '#27231c';
  ctx.beginPath(); ctx.ellipse(18, 0, 12, 10, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4e4434';
  ctx.beginPath(); ctx.ellipse(17, 0, 9, 8, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = wind ? '#ffd2b0' : '#ef7b63';
  ctx.fillRect(22, -3.2, 4, 1.6);
  ctx.fillRect(22, 1.6, 4, 1.6);
  ctx.globalAlpha = 0.25;
  ctx.beginPath(); ctx.arc(24, 0, 7, 0, TAU); ctx.fill();
  ctx.restore();

  // hammer arm
  const raise = wind ? Math.sin(t * 25) * 2 - 8 : 0;
  ctx.save();
  ctx.translate(8, 15);
  ctx.rotate(-0.3 + raise * 0.012);
  ctx.strokeStyle = '#3b2c1d';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(32, 0); ctx.stroke();
  ctx.fillStyle = '#5b4a32';
  roundPath(ctx, 30, -10, 16, 20, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(217,165,74,.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(239,90,98,.55)';
  ctx.fillRect(33, -1, 10, 2);
  ctx.restore();

  if (wind) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 + Math.sin(t * 22) * 0.08;
    ctx.fillStyle = '#ef5a62';
    ctx.beginPath(); ctx.ellipse(0, 0, 37, 33, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawEnemyBars() {
  for (const e of game.enemies) {
    if (e.dead || e.state === 'spawn' || e.hp >= e.maxHp) continue;
    const w = e.type === 'brute' ? 58 : 36;
    const y = e.y - e.r - (e.type === 'brute' ? 20 : 14);
    const x = e.x - w / 2;
    const f = clamp(e.hp / e.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,9,.75)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = 'rgba(255,255,255,.09)';
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = e.elite ? '#f4d08a' : '#c6303c';
    ctx.fillRect(x, y, w * f, 3);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillRect(x, y, w * f, 1);
    ctx.restore();
  }
}

function drawPlayer() {
  const p = game.player;
  if (!p) return;
  const t = game.time;

  // dash echoes
  for (const tr of p.trail) {
    const a = tr.t / tr.max;
    ctx.save();
    ctx.globalAlpha = a * 0.18;
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.angle);
    ctx.fillStyle = '#62e3cd';
    ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.7, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // warm underworld light catches the hero
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const aura = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 46);
  aura.addColorStop(0, 'rgba(98,227,205,.10)');
  aura.addColorStop(0.5, 'rgba(98,227,205,.035)');
  aura.addColorStop(1, 'rgba(98,227,205,0)');
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(p.x, p.y, 46, 0, TAU); ctx.fill();
  ctx.restore();

  // shadow
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 15, p.r * 1.15, p.r * 0.46, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  const bob = p.dashT > 0 ? 0 : Math.sin(p.walk * 2) * 1.2;
  const blink = p.iframes > 0 && Math.floor(t * 26) % 2 === 0 && p.dashT <= 0;
  ctx.save();
  ctx.globalAlpha = blink ? 0.45 : 1;
  ctx.translate(p.x, p.y + bob);
  ctx.rotate(p.angle);
  ctx.scale(1.14, 1.14);

  if (p.dashT > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(98,227,205,.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const off = -12 - i * 11;
      ctx.beginPath(); ctx.moveTo(off, -12); ctx.lineTo(off - 18, 0); ctx.lineTo(off, 12); ctx.stroke();
    }
    ctx.restore();
  }

  // legs
  const step = p.dashT > 0 ? 0 : Math.sin(p.walk * 2) * 5;
  ctx.fillStyle = '#161b27';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-9 + step * side, side * 7, 7.2, 4.6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(217,165,74,.25)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // cloak / scarf
  const scarfSway = Math.sin(t * 4.5) * 3;
  ctx.strokeStyle = '#a52a36';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-7, -5);
  ctx.quadraticCurveTo(-18, -10 + scarfSway, -29, -4 + scarfSway);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(239,90,98,.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-7, -5);
  ctx.quadraticCurveTo(-19, -8 + scarfSway, -30, -2 + scarfSway);
  ctx.stroke();

  ctx.fillStyle = '#1a2a3a';
  ctx.beginPath();
  ctx.moveTo(-12, -13);
  ctx.quadraticCurveTo(-23, -5, -17, 9);
  ctx.quadraticCurveTo(-6, 14, 4, 10);
  ctx.lineTo(4, -10);
  ctx.quadraticCurveTo(-4, -16, -12, -13);
  ctx.closePath();
  ctx.fill();

  // torso
  const bodyG = ctx.createLinearGradient(-10, -12, 10, 12);
  bodyG.addColorStop(0, '#33546b');
  bodyG.addColorStop(0.55, '#1c3245');
  bodyG.addColorStop(1, '#0d1724');
  ctx.fillStyle = bodyG;
  ctx.beginPath(); ctx.ellipse(0, 0, 11, 12.5, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(217,165,74,.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // shoulder guards
  for (const side of [-1, 1]) {
    ctx.fillStyle = side < 0 ? '#2b4457' : '#233a4c';
    ctx.beginPath(); ctx.ellipse(0, side * 10, 5.5, 4.2, side * 0.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(217,165,74,.28)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // chest sigil
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(98,227,205,.8)';
  ctx.beginPath();
  ctx.moveTo(4, 0); ctx.lineTo(7, 3); ctx.lineTo(4, 6); ctx.lineTo(1, 3); ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.arc(4, 3, 7, 0, TAU); ctx.fill();
  ctx.restore();

  // head / helm
  ctx.fillStyle = '#101a26';
  ctx.beginPath(); ctx.arc(7, 0, 7.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(217,165,74,.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#0a111a';
  ctx.beginPath(); ctx.arc(8.6, 0, 4.3, 0, TAU); ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#f4d08a';
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.arc(10.5, side * 2.2, 1.1, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // laurel / helm crest
  ctx.strokeStyle = 'rgba(217,165,74,.75)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(5, 0, 9.3, -2.35, 2.35);
  ctx.stroke();
  ctx.fillStyle = '#d9a54a';
  for (let i = 0; i < 4; i++) {
    const ang = -1.6 + i * 0.55;
    ctx.beginPath();
    ctx.ellipse(5 + Math.cos(ang) * 9.6, Math.sin(ang) * 9.6, 2, 1.1, ang, 0, TAU);
    ctx.fill();
  }

  // arm + weapon
  const attacking = p.attackAnim > 0;
  const animT = attacking ? clamp(1 - p.attackAnim / Math.max(0.001, p.attackDur), 0, 1) : 0;
  ctx.save();
  ctx.translate(8, 7);
  drawWeapon(ctx, p, animT, attacking);
  ctx.restore();
  ctx.fillStyle = '#c9a46a';
  ctx.beginPath(); ctx.arc(8, 7, 3, 0, TAU); ctx.fill();

  ctx.restore();
}

function drawWeapon(c, p, animT, attacking) {
  const w = game.run ? game.run.weapon : game.selectedWeapon;
  const swing = attacking ? Math.sin(animT * PI) : 0;

  if (w === 'blade') {
    c.save();
    c.rotate(-0.34 + swing * 1.9 * p.swingDir);
    const gl = c.createLinearGradient(0, -3, 48, 2);
    gl.addColorStop(0, '#65717d');
    gl.addColorStop(0.5, '#e8edf2');
    gl.addColorStop(0.86, '#b9c4cd');
    gl.addColorStop(1, '#f7f4e8');
    c.fillStyle = gl;
    c.beginPath();
    c.moveTo(5, -3.4);
    c.lineTo(38, -2.4);
    c.lineTo(48, 0);
    c.lineTo(38, 2.4);
    c.lineTo(5, 3.4);
    c.closePath();
    c.fill();
    c.fillStyle = '#3a2a18';
    c.fillRect(1, -5.4, 5, 10.8);
    c.fillStyle = '#d9a54a';
    c.fillRect(5.5, -6, 1.6, 12);
    c.strokeStyle = 'rgba(255,255,255,.5)';
    c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(15, -1.4); c.lineTo(40, -0.6); c.stroke();
    c.restore();
  } else if (w === 'spear') {
    c.save();
    const thrust = attacking ? swing * 20 : 0;
    c.translate(thrust, 0);
    c.rotate(-0.1);
    c.strokeStyle = '#5b3f25';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(-18, 0); c.lineTo(59, 0); c.stroke();
    c.strokeStyle = 'rgba(240,198,116,.45)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(-17, -1); c.lineTo(58, -1); c.stroke();
    c.fillStyle = '#d7dde2';
    c.beginPath();
    c.moveTo(57, -4.4); c.lineTo(74, 0); c.lineTo(57, 4.4);
    c.closePath();
    c.fill();
    c.fillStyle = '#d9a54a';
    c.beginPath();
    c.moveTo(54, -5); c.lineTo(60, -3); c.lineTo(60, 3); c.lineTo(54, 5);
    c.closePath();
    c.fill();
    c.strokeStyle = '#a52a36';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(-8, 0); c.lineTo(-18, 7); c.moveTo(-8, 0); c.lineTo(-18, -7); c.stroke();
    c.restore();
  } else {
    c.save();
    c.translate(8, 0);
    c.rotate(-0.06);
    const pull = attacking ? swing * 5 : 0;
    c.strokeStyle = '#6f5432';
    c.lineWidth = 2.6;
    c.beginPath(); c.arc(4, 0, 17, -1.15, 1.15); c.stroke();
    c.strokeStyle = '#d9a54a';
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(4, 0, 17, -1.15, 1.15); c.stroke();
    c.strokeStyle = 'rgba(240,240,230,.55)';
    c.lineWidth = 0.8;
    const topY = Math.sin(-1.15) * 17, botY = Math.sin(1.15) * 17;
    c.beginPath(); c.moveTo(11.5, topY); c.lineTo(11.5 - pull, 0); c.lineTo(11.5, botY); c.stroke();
    if (attacking) {
      c.strokeStyle = '#f0c674';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(11, 0); c.lineTo(36, 0); c.stroke();
      c.fillStyle = '#f4d08a';
      c.beginPath(); c.moveTo(37, 0); c.lineTo(32, -3); c.lineTo(32, 3); c.closePath(); c.fill();
    }
    c.restore();
  }
}

function drawPickups() {
  const t = game.time;
  for (const pk of game.pickups) {
    if (pk.dead) continue;
    const bob = Math.sin(t * 4 + pk.x * 0.03) * 2.4;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.type === 'soul') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
      g.addColorStop(0, 'rgba(98,227,205,.35)');
      g.addColorStop(1, 'rgba(98,227,205,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill();
      ctx.rotate(t * 1.6 + pk.age);
      ctx.fillStyle = '#8ff5e2';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 0); ctx.lineTo(0, 7); ctx.lineTo(-5, 0); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.65)';
      ctx.beginPath();
      ctx.moveTo(0, -4); ctx.lineTo(2, 0); ctx.lineTo(0, 4); ctx.lineTo(-2, 0); ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 19);
      g.addColorStop(0, 'rgba(239,107,120,.35)');
      g.addColorStop(1, 'rgba(239,107,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 19, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f07a86';
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.bezierCurveTo(-10, 0, -7, -8, -2.5, -7);
      ctx.quadraticCurveTo(0, -6.4, 0, -4.4);
      ctx.quadraticCurveTo(0, -6.4, 2.5, -7);
      ctx.bezierCurveTo(7, -8, 10, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath(); ctx.arc(-2.5, -2.8, 1.4, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/* ============================================================
   PROJECTILE + EFFECT PAINTING
   ============================================================ */

function drawProjectiles() {
  for (const pr of game.projectiles) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.rotate(pr.angle || 0);
    if (pr.type === 'arrow') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(244,208,138,.5)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-4, 0); ctx.stroke();
      ctx.strokeStyle = '#f4d08a';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(4, 0); ctx.stroke();
      ctx.fillStyle = '#fff4d8';
      ctx.beginPath();
      ctx.moveTo(9, 0); ctx.lineTo(3, -3.2); ctx.lineTo(3, 3.2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(240,198,116,.6)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-17, -3); ctx.moveTo(-22, 0); ctx.lineTo(-17, 3); ctx.stroke();
      ctx.restore();
    } else if (pr.type === 'spear') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(-30, 0, 30, 0);
      g.addColorStop(0, 'rgba(98,227,205,0)');
      g.addColorStop(0.65, 'rgba(98,227,205,.55)');
      g.addColorStop(1, 'rgba(180,255,240,.9)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(29, 0); ctx.stroke();
      ctx.strokeStyle = '#d8e4dd';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(28, 0); ctx.stroke();
      ctx.fillStyle = '#d8e4dd';
      ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(27, -4.5); ctx.lineTo(27, 4.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(217,165,74,.65)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(26, -5); ctx.lineTo(31, -2); ctx.moveTo(26, 5); ctx.lineTo(31, 2); ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
      g.addColorStop(0, 'rgba(245,235,255,.95)');
      g.addColorStop(0.3, 'rgba(181,140,255,.7)');
      g.addColorStop(1, 'rgba(169,131,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e6d8ff';
      ctx.beginPath(); ctx.arc(0, 0, 4.4, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

function drawEffects() {
  for (const e of game.effects) {
    const p = clamp(e.age / e.dur, 0, 1);
    const alpha = 1 - p;
    ctx.save();
    if (e.type === 'slash') {
      const radius = e.radius * (0.9 + p * 0.13);
      const a0 = e.angle - e.arc * 0.5;
      const a1 = e.angle + e.arc * 0.5;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.globalAlpha = alpha * 0.38;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = (e.combo === 2 ? 18 : 13) * (1 - p) + 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, radius, a0, a1); ctx.stroke();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#fff4df';
      ctx.lineWidth = (e.combo === 2 ? 4.5 : 3) * (1 - p) + 0.8;
      ctx.beginPath(); ctx.arc(e.x, e.y, radius * 0.98, a0 + 0.08, a1 - 0.08); ctx.stroke();
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(e.x, e.y, radius * 0.8, a0 + 0.2, a1 - 0.08); ctx.stroke();
    } else if (e.type === 'thrust') {
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      const reveal = Math.min(1, p * 2.2);
      const len = e.length * reveal;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, 'rgba(98,227,205,.05)');
      g.addColorStop(0.5, 'rgba(140,250,230,.55)');
      g.addColorStop(1, 'rgba(230,255,248,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(len, -2);
      ctx.lineTo(len, 2);
      ctx.lineTo(0, 9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,255,248,.9)';
      ctx.lineWidth = 2 * (1 - p) + 0.6;
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(len, 0); ctx.stroke();
    } else if (e.type === 'spin') {
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      const rot = game.time * 8 + p * 4;
      for (let i = 0; i < 3; i++) {
        const r = e.radius * (0.62 + p * 0.32 + i * 0.04);
        const a0 = rot + i * TAU / 3;
        ctx.globalAlpha = alpha * (0.4 - i * 0.08);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 10 * (1 - p) + 1.5;
        ctx.beginPath(); ctx.arc(0, 0, r, a0, a0 + 1.7); ctx.stroke();
        ctx.globalAlpha = alpha * 0.75;
        ctx.strokeStyle = '#fff2da';
        ctx.lineWidth = 2 * (1 - p) + 0.5;
        ctx.beginPath(); ctx.arc(0, 0, r, a0 + 0.1, a0 + 1.5); ctx.stroke();
      }
      ctx.globalAlpha = alpha * 0.18;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.9, 0, TAU); ctx.fill();
    } else if (e.type === 'ring') {
      const r = lerp(e.r0 || 4, e.r1 || 30, p);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = e.width || 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = alpha * 0.18;
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.8, 0, TAU); ctx.stroke();
    } else if (e.type === 'slam') {
      const r = e.radius * (0.25 + p * 0.8);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.18;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 4 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = '#f4d08a';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.06, 0, TAU); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + p * 0.2;
        ctx.globalAlpha = alpha * 0.45;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * r * 0.45, e.y + Math.sin(a) * r * 0.45);
        ctx.lineTo(e.x + Math.cos(a) * r * 0.9, e.y + Math.sin(a) * r * 0.9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const pt of game.particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    const size = pt.size * (0.45 + a * 0.65);
    ctx.globalAlpha = a * 0.22;
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, size * 2.5, 0, TAU); ctx.fill();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, size, 0, TAU); ctx.fill();
    if (pt.size > 2.2) {
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = '#fff6df';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, size * 0.35, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

function drawNumbers() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const n of game.numbers) {
    const p = clamp(n.life / n.maxLife, 0, 1);
    const pop = n.crit ? 1 + (1 - p) * 0.2 : 1;
    const size = (n.crit ? 22 : 16) * pop;
    ctx.globalAlpha = Math.min(1, p * 1.6);
    ctx.font = '700 ' + size + 'px Georgia, "Times New Roman", serif';
    const text = n.crit ? n.text + '!' : n.text;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(3,5,9,.8)';
    ctx.strokeText(text, n.x, n.y);
    ctx.fillStyle = n.color;
    ctx.fillText(text, n.x, n.y);
    if (n.crit) {
      ctx.globalAlpha = Math.min(1, p * 1.6) * 0.55;
      ctx.fillStyle = '#f4d08a';
      ctx.fillText(text, n.x, n.y);
    }
  }
  ctx.restore();
}

/* ============================================================
   BOOT
   ============================================================ */

ui.muteBtn.querySelector('use').setAttribute('href', Sfx.muted ? '#icon-mute' : '#icon-sound');
ui.muteBtn.setAttribute('aria-pressed', Sfx.muted ? 'true' : 'false');

window.addEventListener('resize', resize);
resize();

let lastFrame = performance.now();
function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
  lastFrame = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Small debug surface for automated checks and curious tinkerers.
window.__hollow = {
  game,
  beginRun,
  startChamber,
  startWave,
  openReward,
  pickBoon,
  showEnd,
  winRun,
  killAll() {
    for (const e of game.enemies) if (!e.dead) killEnemy(e);
  },
  damageAll(n) {
    for (const e of game.enemies) if (!e.dead) damageEnemy(e, n, { crit: false });
  },
  damagePlayer,
  heal,
  updateHUD
};

})();
