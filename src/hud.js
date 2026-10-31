import { clamp, TAU } from './utils.js';
import { CITY, ROAD_LINES, BLOCK_CENTERS } from './world.js';

const DISTRICTS = [
  { name: 'DOWNTOWN', x: 0, z: 0 },
  { name: 'NEON MILE', x: 0, z: -160 },
  { name: 'WEST END', x: -160, z: 0 },
  { name: 'EASTSIDE', x: 160, z: 0 },
  { name: 'SOUTH DOCKS', x: 0, z: 160 },
  { name: 'THE STRIP', x: 160, z: -160 },
];

export class HUD {
  constructor(world) {
    this.world = world;
    this.el = {
      hud: document.getElementById('hud'),
      stars: Array.from(document.querySelectorAll('#stars .star')),
      heat: document.getElementById('heat-fill'),
      timer: document.getElementById('timer'),
      score: document.getElementById('score'),
      health: document.getElementById('health-fill'),
      nitro: document.getElementById('nitro-fill'),
      speed: document.getElementById('speed-val'),
      gear: document.getElementById('gear'),
      district: document.getElementById('district'),
      district2: document.getElementById('district-2'),
      copCount: document.getElementById('cop-count'),
      bust: document.getElementById('bust-meter'),
      bustFill: document.getElementById('bust-fill'),
      toasts: document.getElementById('toast-stack'),
      hint: document.getElementById('hint-bar'),
      start: document.getElementById('start-screen'),
      pause: document.getElementById('pause-screen'),
      over: document.getElementById('over-screen'),
      overKicker: document.getElementById('over-kicker'),
      overTitle: document.getElementById('over-title'),
      overTime: document.getElementById('over-time'),
      overScore: document.getElementById('over-score'),
      overTakedowns: document.getElementById('over-takedowns'),
      overSpeed: document.getElementById('over-speed'),
      newBest: document.getElementById('new-best'),
      best: document.getElementById('best-score'),
      damage: document.getElementById('damage-flash'),
      loading: document.getElementById('loading'),
      soundHint: document.getElementById('sound-hint'),
    };
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.speedo = document.getElementById('speedo');
    this.speedCtx = this.speedo.getContext('2d');
    this.toastTimers = [];
    this.lastDistrict = '';
    this.hintTimer = 0;
    this.flashTimer = 0;
    this.damageTimer = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.setupCanvases();
    window.addEventListener('resize', () => this.setupCanvases());
  }

  setupCanvases() {
    for (const [canvas, ctx, size] of [
      [this.map, this.mapCtx, 220],
      [this.speedo, this.speedCtx, 240],
    ]) {
      canvas.width = size * this.dpr;
      canvas.height = size * this.dpr;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    this.mapSize = 220;
    this.speedSize = 240;
  }

  setBest(v) {
    this.el.best.textContent = Number(v || 0).toLocaleString();
  }

  showHUD() {
    this.el.hud.classList.remove('hidden');
    this.el.start.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.over.classList.add('hidden');
  }

  showStart() {
    this.el.start.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.over.classList.add('hidden');
  }

  showPause(on) {
    this.el.pause.classList.toggle('hidden', !on);
  }

  showGameOver({ busted, time, score, takedowns, topSpeed, best }) {
    this.el.overKicker.textContent = busted ? 'BUSTED' : 'WRECKED';
    this.el.overTitle.textContent = busted ? 'Cuffs in the cold light.' : 'The night wins.';
    this.el.overTime.textContent = formatTime(time);
    this.el.overScore.textContent = Math.floor(score).toLocaleString();
    this.el.overTakedowns.textContent = takedowns;
    this.el.overSpeed.textContent = Math.round(topSpeed);
    this.el.newBest.classList.toggle('hidden', !best);
    this.el.over.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.setBest(Math.max(best ? score : 0, Number(localStorage.getItem('neonvice.best') || 0)));
  }

  hideLoading() {
    this.el.loading.classList.add('done');
    this.el.loading.style.pointerEvents = 'none';
    setTimeout(() => this.el.loading.classList.add('hidden'), 750);
  }

  toast(text, cls = '') {
    const d = document.createElement('div');
    d.className = `toast ${cls}`;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    const timer = setTimeout(() => {
      d.classList.add('out');
      setTimeout(() => d.remove(), 420);
    }, 1700);
    this.toastTimers.push(timer);
  }

  flashDamage() {
    this.el.damage.classList.add('hit');
    clearTimeout(this.damageTimer);
    this.damageTimer = setTimeout(() => this.el.damage.classList.remove('hit'), 90);
  }

  update(dt, s) {
    const { player, wanted, heat, health, nitro, score, time, cops, copBlips, pickups, helicopter, bustProgress, boosting, maxSpeed } = s;
    const kmh = Math.abs(player.speed) * 3.6;

    for (let i = 0; i < this.el.stars.length; i++) {
      const on = i < wanted;
      this.el.stars[i].classList.toggle('on', on);
      this.el.stars[i].classList.toggle('flash', on && i === wanted - 1 && wanted >= 4);
    }
    this.el.heat.style.width = `${clamp(heat, 0, 100)}%`;
    this.el.timer.textContent = formatTime(time);
    this.el.score.textContent = Math.floor(score).toLocaleString();
    this.el.health.style.width = `${clamp(health, 0, 100)}%`;
    this.el.health.classList.toggle('low', health < 30);
    this.el.nitro.style.width = `${clamp(nitro, 0, 100)}%`;
    this.el.speed.textContent = Math.round(kmh);
    this.el.gear.textContent = player.speed < -0.5 ? 'R' : kmh < 1 ? 'N' : String(Math.min(6, 1 + Math.floor(kmh / 32)));
    this.el.copCount.textContent = `${cops} UNIT${cops === 1 ? '' : 'S'}`;

    const district = this.districtAt(player.pos);
    if (district !== this.lastDistrict) {
      this.lastDistrict = district;
      this.el.district.textContent = district;
      this.el.district2.textContent = district;
    }

    this.el.bust.classList.toggle('hidden', bustProgress <= 0.01);
    this.el.bustFill.style.width = `${clamp(bustProgress * 100, 0, 100)}%`;

    if (this.hintTimer < 9) {
      this.hintTimer += dt;
      if (this.hintTimer >= 9) this.el.hint.style.opacity = '0';
    }

    this.drawMap(player, copBlips, pickups, helicopter, wanted);
    this.drawSpeedo(kmh, maxSpeed * 3.6, boosting, player.speed < -0.5);
  }

  districtAt(pos) {
    let best = DISTRICTS[0];
    let bd = Infinity;
    for (const d of DISTRICTS) {
      const dist = Math.hypot(pos.x - d.x, pos.z - d.z);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best.name;
  }

  drawMap(player, copBlips, pickups, helicopter, wanted) {
    const ctx = this.mapCtx;
    const S = this.mapSize;
    const c = S / 2;
    const scale = 0.78;
    const R = c - 5;

    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, R, 0, TAU);
    ctx.clip();

    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, S, S);

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(-player.heading);
    ctx.scale(scale, scale);
    ctx.translate(-player.pos.x, -player.pos.z);

    // blocks
    for (let i = 0; i < CITY.grid; i++) {
      for (let j = 0; j < CITY.grid; j++) {
        const x = BLOCK_CENTERS[i];
        const z = BLOCK_CENTERS[j];
        const isPark = this.world.parks?.has(`${i},${j}`);
        ctx.fillStyle = isPark ? '#0d2419' : '#0c1422';
        ctx.fillRect(x - CITY.block / 2, z - CITY.block / 2, CITY.block, CITY.block);
      }
    }

    // roads
    ctx.strokeStyle = '#1d2a3e';
    ctx.lineWidth = CITY.road;
    ctx.lineCap = 'butt';
    for (const r of ROAD_LINES) {
      ctx.beginPath();
      ctx.moveTo(r, -CITY.max);
      ctx.lineTo(r, CITY.max);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-CITY.max, r);
      ctx.lineTo(CITY.max, r);
      ctx.stroke();
    }
    // centre lines
    ctx.strokeStyle = 'rgba(255, 200, 87, 0.28)';
    ctx.lineWidth = 1.1;
    for (const r of ROAD_LINES) {
      ctx.beginPath();
      ctx.moveTo(r, -CITY.max);
      ctx.lineTo(r, CITY.max);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-CITY.max, r);
      ctx.lineTo(CITY.max, r);
      ctx.stroke();
    }

    // pickups
    ctx.fillStyle = '#ffc857';
    for (const p of pickups || []) {
      if (!p.visible) continue;
      ctx.beginPath();
      ctx.arc(p.position.x, p.position.z, 3.2, 0, TAU);
      ctx.fill();
    }

    // cops
    for (const cop of copBlips || []) {
      ctx.save();
      ctx.translate(cop.x, cop.z);
      ctx.rotate(cop.heading || 0);
      ctx.fillStyle = cop.disabled ? '#5b2430' : '#ff2d4a';
      ctx.beginPath();
      ctx.moveTo(0, -5.5);
      ctx.lineTo(4.5, 4.5);
      ctx.lineTo(-4.5, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (helicopter) {
      ctx.fillStyle = '#ff5c76';
      ctx.beginPath();
      ctx.arc(helicopter.x, helicopter.z, 5, 0, TAU);
      ctx.fill();
    }

    // view cone
    ctx.fillStyle = 'rgba(78, 240, 224, 0.06)';
    ctx.beginPath();
    ctx.moveTo(player.pos.x, player.pos.z);
    ctx.arc(player.pos.x, player.pos.z, 34, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // player arrow
    ctx.save();
    ctx.translate(c, c);
    ctx.fillStyle = '#eafcff';
    ctx.shadowColor = '#4ef0e0';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // sweep line
    const t = performance.now() / 1000;
    const sweep = (t * 0.7) % TAU;
    const grd = ctx.createConicGradient ? ctx.createConicGradient(sweep, c, c) : null;
    if (grd) {
      grd.addColorStop(0, 'rgba(78, 240, 224, 0.08)');
      grd.addColorStop(0.08, 'rgba(78, 240, 224, 0)');
      grd.addColorStop(1, 'rgba(78, 240, 224, 0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(c, c, R, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    // compass ticks
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const r0 = R - (i % 6 === 0 ? 7 : 3);
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      ctx.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
      ctx.stroke();
    }

    if (wanted > 0) {
      ctx.strokeStyle = `rgba(255, 45, 74, ${0.25 + Math.sin(t * 4) * 0.12})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c, c, R - 1.5, 0, TAU);
      ctx.stroke();
    }
  }

  drawSpeedo(kmh, maxKmh, boosting, reverse) {
    const ctx = this.speedCtx;
    const S = this.speedSize;
    const c = S / 2;
    const r = 92;
    const start = Math.PI * 0.75;
    const end = Math.PI * 2.25;
    const t = clamp(kmh / Math.max(120, maxKmh), 0, 1);

    ctx.clearRect(0, 0, S, S);

    // outer ring
    ctx.beginPath();
    ctx.arc(c, c, r + 8, 0, TAU);
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // track
    ctx.beginPath();
    ctx.arc(c, c, r, start, end);
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.stroke();

    // filled arc
    const grd = ctx.createLinearGradient(0, S, S, 0);
    if (boosting) {
      grd.addColorStop(0, '#ff2d78');
      grd.addColorStop(1, '#ffc857');
    } else {
      grd.addColorStop(0, '#2f8cff');
      grd.addColorStop(1, '#4ef0e0');
    }
    ctx.beginPath();
    ctx.arc(c, c, r, start, start + (end - start) * t);
    ctx.strokeStyle = grd;
    ctx.lineWidth = 7;
    ctx.shadowColor = boosting ? '#ff2d78' : '#4ef0e0';
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ticks
    for (let i = 0; i <= 11; i++) {
      const a = start + ((end - start) * i) / 11;
      const major = i % 2 === 0;
      const r0 = r - (major ? 18 : 13);
      const r1 = r - 9;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      ctx.strokeStyle = i / 11 > 0.8 ? 'rgba(255, 45, 120, 0.75)' : major ? 'rgba(200, 235, 255, 0.55)' : 'rgba(200, 235, 255, 0.2)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.stroke();
    }

    // needle
    const na = start + (end - start) * t;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(na);
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(r - 26, -2.2);
    ctx.lineTo(r - 26, 2.2);
    ctx.closePath();
    ctx.fillStyle = reverse ? '#ff5c76' : '#eafcff';
    ctx.shadowColor = reverse ? '#ff2d4a' : '#4ef0e0';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(c, c, 5, 0, TAU);
    ctx.fillStyle = '#0b0e18';
    ctx.fill();
    ctx.strokeStyle = 'rgba(78, 240, 224, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
