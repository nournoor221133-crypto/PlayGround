import { clamp } from './util.js';
import { BOUNDARY, ROAD_COORDS } from './world.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(world) {
    this.world = world;
    this.el = {
      hud: $('hud'), touch: $('touch'),
      start: $('start'), pause: $('pause'), over: $('over'),
      speedVal: $('speedVal'), gauge: $('gaugeFill'), gear: $('gear'),
      cash: $('cash'), cashBox: $('cashBox'),
      health: $('healthBar'), nitro: $('nitroBar'),
      wanted: $('wanted'),
      missionName: $('missionName'), missionObjective: $('missionObjective'),
      missionDist: $('missionDist'), missionTimer: $('missionTimer'),
      missionBar: $('missionBar'), missionPanel: $('missionPanel'),
      compass: $('compass'), compassArrow: $('compassArrow'),
      minimap: $('minimap'),
      modeHint: $('modeHint'), actionBtn: $('actionBtn'),
      toasts: $('toasts'),
      pauseCash: $('pauseCash'), pauseWanted: $('pauseWanted'), pauseJobs: $('pauseJobs'),
      overKicker: $('overKicker'), overTitle: $('overTitle'), overText: $('overText'),
      overCash: $('overCash'), overJobs: $('overJobs'), overBest: $('overBest'),
      bestScore: $('bestScore'),
      qualityBtn: $('qualityBtn'), soundBtn: $('soundBtn'),
      loading: $('loading'),
    };
    this.stars = [];
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.className = 'star';
      this.el.wanted.appendChild(s);
      this.stars.push(s);
    }
    this.lastCash = -1;
    this.lastStars = -1;
    this.lastWanted = 0;
    this.minimapTimer = 0;
    this.mctx = this.el.minimap.getContext('2d');
    this.mapSize = this.el.minimap.width;
    this.range = 150;
    this._buildStaticMap();
    this.compassTimer = 0;
  }

  _buildStaticMap() {
    const S = 1024;
    const WORLD = 540;
    const scale = S / WORLD;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    const wx = (x) => (x + WORLD / 2) * scale;
    const wz = (z) => (z + WORLD / 2) * scale;

    // water
    ctx.fillStyle = '#0a2c3d';
    ctx.fillRect(0, 0, S, S);
    // beach
    ctx.fillStyle = '#6d5a3e';
    ctx.fillRect(wx(-BOUNDARY - 8), wz(-BOUNDARY - 8), (BOUNDARY * 2 + 16) * scale, (BOUNDARY * 2 + 16) * scale);
    // city ground
    ctx.fillStyle = '#1c2029';
    ctx.fillRect(wx(-235), wz(-235), 470 * scale, 470 * scale);

    // blocks
    ctx.fillStyle = '#2e323c';
    for (const bx of [-160, -96, -32, 32, 96, 160]) {
      for (const bz of [-160, -96, -32, 32, 96, 160]) {
        ctx.fillRect(wx(bx - 24), wz(bz - 24), 48 * scale, 48 * scale);
      }
    }

    // parks
    ctx.fillStyle = '#2c5a33';
    for (const p of this.world.parks) {
      ctx.fillRect(wx(p.x - p.w / 2), wz(p.z - p.d / 2), p.w * scale, p.d * scale);
    }

    // roads
    ctx.strokeStyle = '#5b616e';
    ctx.lineWidth = 16 * scale;
    ctx.lineCap = 'butt';
    for (const r of ROAD_COORDS) {
      ctx.beginPath(); ctx.moveTo(wx(r), wz(-192)); ctx.lineTo(wx(r), wz(192)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx(-192), wz(r)); ctx.lineTo(wx(192), wz(r)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,210,120,0.20)';
    ctx.lineWidth = 1.4;
    for (const r of ROAD_COORDS) {
      ctx.beginPath(); ctx.moveTo(wx(r), wz(-192)); ctx.lineTo(wx(r), wz(192)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx(-192), wz(r)); ctx.lineTo(wx(192), wz(r)); ctx.stroke();
    }

    // buildings
    for (const b of this.world.buildings) {
      const shade = 92 + Math.min(46, b.h * 0.45);
      ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 9})`;
      ctx.fillRect(wx(b.x - b.w / 2), wz(b.z - b.d / 2), b.w * scale, b.d * scale);
    }

    // seawall
    ctx.strokeStyle = 'rgba(220,200,160,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(wx(-BOUNDARY), wz(-BOUNDARY), BOUNDARY * 2 * scale, BOUNDARY * 2 * scale);

    this.staticMap = c;
    this.staticScale = scale;
  }

  setStarted(started) {
    this.el.hud.classList.toggle('hidden', !started);
    this.el.touch.classList.toggle('hidden', !started);
    this.el.start.classList.toggle('hidden', started);
  }

  showPause(show, state) {
    this.el.pause.classList.toggle('hidden', !show);
    if (show) {
      this.el.pauseCash.textContent = '$' + Math.round(state.cash).toLocaleString('en-US');
      this.el.pauseWanted.textContent = `${Math.ceil(state.wanted)}★`;
      this.el.pauseJobs.textContent = state.jobs;
      this.el.qualityBtn.textContent = `QUALITY: ${state.quality.toUpperCase()}`;
      this.el.soundBtn.textContent = `SOUND: ${state.muted ? 'OFF' : 'ON'}`;
    }
  }

  showOver(show, kind, state, best) {
    this.el.over.classList.toggle('hidden', !show);
    if (!show) return;
    this.el.overKicker.textContent = kind === 'busted' ? 'THE HEAT WON' : 'TOTALED';
    this.el.overTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WRECKED';
    this.el.overText.textContent = kind === 'busted'
      ? 'Cuffed on the curb. The city keeps your cut.'
      : 'The ride is scrap. You walk away — barely.';
    this.el.overCash.textContent = '$' + Math.round(state.cash).toLocaleString('en-US');
    this.el.overJobs.textContent = state.jobs;
    this.el.overBest.textContent = '$' + Math.round(best).toLocaleString('en-US');
  }

  setBest(best) {
    this.el.bestScore.textContent = '$' + Math.round(best).toLocaleString('en-US');
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 3200);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  setAction(label, visible, showHint = true) {
    this.el.actionBtn.textContent = label;
    this.el.actionBtn.classList.toggle('hidden', !visible);
    this.el.modeHint.classList.toggle('hidden', !visible || !showHint || !label);
    this.el.modeHint.textContent =
      label === 'STEAL' ? 'E · STEAL THIS RIDE' :
      label === 'EXIT' ? 'E · EXIT VEHICLE' : 'E · ENTER VEHICLE';
  }

  update(state, dt) {
    const speed = Math.round(state.kmh);
    this.el.speedVal.textContent = speed;
    const ratio = clamp(state.kmh / 260, 0, 1);
    this.el.gauge.style.strokeDashoffset = String(358 * (1 - ratio));
    this.el.gauge.style.stroke = state.boosting ? '#37e6ff' : ratio > 0.72 ? '#ff2d6f' : '#ff7a1a';
    this.el.gear.textContent = state.gear;

    const cashRounded = Math.round(state.cash);
    if (cashRounded !== this.lastCash) {
      this.el.cash.textContent = cashRounded.toLocaleString('en-US');
      if (this.lastCash >= 0 && cashRounded > this.lastCash) {
        this.el.cashBox.classList.remove('bump');
        void this.el.cashBox.offsetWidth;
        this.el.cashBox.classList.add('bump');
      }
      this.lastCash = cashRounded;
    }

    this.el.health.style.width = clamp(state.health, 0, 100) + '%';
    this.el.nitro.style.width = clamp(state.nitro, 0, 100) + '%';

    const starCount = Math.round(state.wanted);
    if (starCount !== this.lastStars) {
      this.stars.forEach((s, i) => {
        const on = i < starCount;
        if (on && !s.classList.contains('on')) {
          s.classList.add('pulse');
          setTimeout(() => s.classList.remove('pulse'), 460);
        }
        s.classList.toggle('on', on);
      });
      this.lastStars = starCount;
    }

    // mission panel
    if (state.mission) {
      const m = state.mission;
      this.el.missionPanel.classList.remove('complete', 'failed');
      this.el.missionName.textContent = m.name;
      this.el.missionObjective.textContent = `CHECKPOINT ${m.index + 1} / ${m.total}`;
      this.el.missionDist.textContent = Math.max(0, Math.round(state.missionDist)) + ' m';
      const time = Math.max(0, state.missionTime);
      this.el.missionTimer.textContent = `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
      this.el.missionBar.style.width = clamp((time / m.time) * 100, 0, 100) + '%';
      this.el.missionPanel.classList.toggle('urgent', time < 10);
    } else {
      this.el.missionPanel.classList.remove('urgent');
      if (state.missionIdle === 'complete' || state.missionIdle === 'failed') {
        const done = state.missionIdle === 'complete';
        this.el.missionName.textContent = done ? 'JOB COMPLETE' : 'JOB FAILED';
        this.el.missionObjective.textContent = done ? 'NEXT JOB INCOMING' : 'OUT OF TIME';
        this.el.missionDist.textContent = done ? 'PAID' : 'NO PAY';
        this.el.missionTimer.textContent = Math.max(1, Math.ceil(state.missionCooldown)) + 's';
        this.el.missionBar.style.width = clamp(state.missionCooldown / 4.5 * 100, 0, 100) + '%';
        this.el.missionPanel.classList.toggle('complete', done);
        this.el.missionPanel.classList.toggle('failed', !done);
      } else {
        this.el.missionName.textContent = 'FREEROAM';
        this.el.missionObjective.textContent = 'EXPLORE THE CITY';
        this.el.missionDist.textContent = '—';
        this.el.missionTimer.textContent = '—';
        this.el.missionBar.style.width = '0%';
        this.el.missionPanel.classList.remove('complete', 'failed');
      }
    }

    // compass to objective
    if (state.mission && state.objective) {
      const dx = state.objective.x - state.playerX;
      const dz = state.objective.z - state.playerZ;
      const rel = Math.atan2(dx, dz) - state.heading;
      this.el.compassArrow.style.transform = `rotate(${rel * 180 / Math.PI}deg)`;
      this.el.compass.classList.remove('hidden');
    } else {
      this.el.compass.classList.add('hidden');
    }

    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 1 / 20;
      this.drawMinimap(state);
    }
  }

  drawMinimap(state) {
    const ctx = this.mctx;
    const S = this.mapSize;
    const c = S / 2;
    const range = this.range;
    const zoom = S / (range * 2);
    const px = state.playerX;
    const pz = state.playerZ;

    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#08202c';
    ctx.fillRect(0, 0, S, S);

    // static map in world units
    ctx.save();
    ctx.translate(c, c);
    ctx.scale(zoom, zoom);
    ctx.translate(-px, -pz);
    ctx.drawImage(this.staticMap, -270, -270, 540, 540);
    ctx.restore();

    const sx = (x) => c + (x - px) * zoom;
    const sy = (z) => c + (z - pz) * zoom;

    // mission marker
    if (state.objective) {
      const x = sx(state.objective.x), y = sy(state.objective.z);
      const pulse = 6 + Math.sin(performance.now() / 180) * 1.6;
      ctx.fillStyle = 'rgba(255,209,102,0.95)';
      ctx.beginPath();
      ctx.moveTo(x, y - pulse);
      ctx.lineTo(x + pulse, y);
      ctx.lineTo(x, y + pulse);
      ctx.lineTo(x - pulse, y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // cops
    for (const cop of state.cops) {
      if (!cop.active) continue;
      const x = sx(cop.pos.x), y = sy(cop.pos.z);
      if (x < 0 || y < 0 || x > S || y > S) continue;
      ctx.fillStyle = '#ff3b4e';
      ctx.beginPath(); ctx.arc(x, y, 4.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,90,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
    }

    // pickups (cash only, nearby)
    for (const p of state.pickups) {
      if (!p.active || p.type !== 'cash') continue;
      const x = sx(p.pos.x), y = sy(p.pos.z);
      if (x < 0 || y < 0 || x > S || y > S) continue;
      ctx.fillStyle = 'rgba(125,255,110,0.85)';
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    }

    // player arrow
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(Math.PI - state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // north marker
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 18px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', c, 24);
    ctx.restore();
  }
}
