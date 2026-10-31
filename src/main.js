import * as THREE from '../vendor/three.module.js';
import { World, ROAD_COORDS, BOUNDARY } from './world.js';
import { Vehicle, Character, buildCarMesh } from './vehicles.js';
import { TrafficSystem, PedestrianSystem, PoliceSystem } from './traffic.js';
import { FX } from './fx.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { clamp, damp, dist2, money, canvasTexture, glowTexture, Rand } from './util.js';

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
const IS_MOBILE = IS_TOUCH || innerWidth < 820;

const MISSION_NAMES = [
  'WARM UP', 'CITY RUN', 'HOT CARGO', 'HEAT SEEKER',
  'FIVE STAR RUN', 'NIGHT SHIFT', 'LAST DELIVERY', 'NO BRAKES',
];

function loadBest() {
  try { return Number(localStorage.getItem('madout2-best')) || 0; } catch { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem('madout2-best', String(Math.round(v))); } catch { /* ignore */ }
}

function pickupTexture(symbol, color) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, 58);
    g.addColorStop(0, color);
    g.addColorStop(0.62, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 56, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 38, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 58px Impact, Arial Black, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 8;
    ctx.fillText(symbol, w / 2, h / 2 + 4);
  }, { wrap: false });
}

function markerArrowTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(w / 2, 12);
    ctx.lineTo(w - 22, h - 22);
    ctx.lineTo(w / 2, h - 46);
    ctx.lineTo(22, h - 22);
    ctx.closePath();
    ctx.fill();
  }, { wrap: false });
}

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, IS_MOBILE ? 1.6 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2400);
    this.camera.position.set(-140, 58, 170);
    this.camera.lookAt(0, 12, 0);

    this.state = {
      started: false, paused: false, over: false,
      cash: 0, health: 100, nitro: 100, wanted: 0, heatTimer: 0,
      jobs: 0, best: loadBest(),
      quality: IS_MOBILE ? 'low' : 'high', muted: false,
      mission: null, missionTime: 0, missionDist: 0, objective: null,
      onFoot: false, gear: 'N', kmh: 0, boosting: false, drift: 0,
      playerX: 0, playerZ: 0, heading: 0, cops: [], pickups: [],
    };

    this.rand = new Rand(90210);
    this.time = 0;
    this.shake = 0;
    this.missionCooldown = 0;
    this.nextMissionIndex = 0;
    this.damageCooldown = 0;
    this.regenTimer = 0;
    this.skidTimer = 0;
    this.bustedGuard = 0;
    this.lastCopHit = 0;

    this.world = new World(this.scene, IS_MOBILE ? 'low' : 'high');
    this.fx = new FX(this.scene);
    this.audio = new AudioEngine();
    this.ui = new UI(this.world);
    this.ui.setBest(this.state.best);
    this.ui.setStarted(false);

    this.vehicle = new Vehicle(this.scene, { kind: 'sport', color: 0xff4d1a });
    this.vehicle.reset(0, 14, 0);
    this.character = new Character(this.scene);
    this.character.pos.set(2.4, 0, 14);

    this.traffic = new TrafficSystem(this.scene, this.world, IS_MOBILE ? 18 : 26);
    this.peds = new PedestrianSystem(this.scene, this.world, IS_MOBILE ? 18 : 28);
    this.police = new PoliceSystem(this.scene, this.world);
    this.parked = [];
    this.buildParkedCars();

    this.pickups = [];
    this.buildPickups();
    this.buildMarker();
    this.setupInput();

    this.clock = new THREE.Clock();
    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
    addEventListener('orientationchange', () => setTimeout(this.resize, 250));

    if (IS_TOUCH) document.body.classList.add('touch');

    document.getElementById('loading')?.classList.add('hidden');
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /* ================================================================ */
  /* setup                                                            */
  /* ================================================================ */
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.state.quality === 'high' ? 2 : 1.1));
  }

  setupInput() {
    this.keys = {};
    this.touch = { left: false, right: false, gas: false, brake: false, hand: false, nitro: false };

    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      this.keys[k] = true;
      if (e.repeat) return;
      if (k === 'e') this.toggleVehicle();
      if (k === 'p' || k === 'escape') this.togglePause();
      if (k === 'm') this.toggleSound();
      if (k === 'r' && this.state.started && !this.state.paused && !this.state.over) this.respawnPlayer(true);
    });
    addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    addEventListener('blur', () => { this.keys = {}; });

    document.querySelectorAll('[data-act]').forEach((btn) => {
      const act = btn.dataset.act;
      const down = (e) => {
        e.preventDefault();
        btn.classList.add('pressed');
        if (act === 'action') { this.toggleVehicle(); return; }
        this.touch[act] = true;
      };
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        if (act !== 'action') this.touch[act] = false;
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    document.getElementById('startBtn').addEventListener('click', () => this.startGame());
    document.getElementById('resumeBtn').addEventListener('click', () => this.togglePause(false));
    document.getElementById('restartBtn').addEventListener('click', () => this.restartRun());
    document.getElementById('qualityBtn').addEventListener('click', () => this.toggleQuality());
    document.getElementById('soundBtn').addEventListener('click', () => this.toggleSound());
    document.getElementById('continueBtn').addEventListener('click', () => this.continueRun());
    document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state.started && !this.state.paused && !this.state.over) this.togglePause(true);
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  buildPickups() {
    const defs = [
      { type: 'cash', count: 32, color: '#59d94f', symbol: '$', value: [120, 420] },
      { type: 'repair', count: 8, color: '#3fd0e6', symbol: '+', value: [0, 0] },
      { type: 'nitro', count: 8, color: '#ff9a2a', symbol: 'N', value: [0, 0] },
    ];
    for (const def of defs) {
      const tex = pickupTexture(def.symbol, def.color);
      for (let i = 0; i < def.count; i++) {
        const p = this.world.randomRoadPoint(this.rand);
        const mat = new THREE.SpriteMaterial({
          map: tex, transparent: true, depthWrite: false, depthTest: true,
          color: 0xffffff, toneMapped: false,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(2.3, 2.3, 1);
        sprite.position.set(p.x, 2.1, p.z);
        this.scene.add(sprite);
        this.pickups.push({
          type: def.type,
          pos: new THREE.Vector3(p.x, 0, p.z),
          mesh: sprite,
          active: true,
          respawn: 0,
          phase: this.rand.range(0, Math.PI * 2),
          value: def.type === 'cash' ? Math.round(this.rand.range(def.value[0], def.value[1]) / 10) * 10 : 0,
        });
      }
    }
  }

  buildParkedCars() {
    const kinds = ['sedan', 'suv', 'van', 'sport', 'sedan', 'sedan'];
    const colors = [0x2f7de1, 0xe8e6df, 0x1b1d22, 0x2fbf71, 0xb02a3a, 0xf2c14e, 0x8b5cf6];
    const spots = [
      { axis: 'z', road: 0, t: 30, side: -1 },
      { axis: 'z', road: 0, t: 52, side: 1 },
      { axis: 'z', road: 0, t: 86, side: -1 },
      { axis: 'z', road: 0, t: -34, side: 1 },
      { axis: 'x', road: 0, t: 34, side: -1 },
      { axis: 'x', road: 0, t: 72, side: 1 },
      { axis: 'z', road: 64, t: 26, side: -1 },
      { axis: 'z', road: -64, t: -20, side: 1 },
    ];
    for (let i = 0; i < 16; i++) {
      const p = this.world.randomRoadPoint(this.rand);
      const road = ROAD_COORDS.reduce((a, b) => (Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a));
      const roadZ = ROAD_COORDS.reduce((a, b) => (Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a));
      if (p.axis === 'x') spots.push({ axis: 'x', road: roadZ, t: p.x, side: this.rand.sign() });
      else spots.push({ axis: 'z', road, t: p.z, side: this.rand.sign() });
    }

    for (const s of spots) {
      const lane = 6.6 * s.side;
      const x = s.axis === 'x' ? s.t : s.road + lane;
      const z = s.axis === 'x' ? s.road + lane : s.t;
      if (Math.abs(x) > 205 || Math.abs(z) > 205) continue;
      if (dist2(x, z, 0, 14) < 12) continue;
      const kind = this.rand.pick(kinds);
      const color = this.rand.pick(colors);
      const mesh = buildCarMesh({ kind, color, detailed: false });
      mesh.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const heading = s.axis === 'x' ? Math.PI / 2 : 0;
      mesh.group.position.set(x, 0, z);
      mesh.group.rotation.y = heading;
      this.scene.add(mesh.group);
      this.parked.push({
        mesh, pos: new THREE.Vector3(x, 0, z), kind, color, heading,
        radius: 1.9, rock: 0,
      });
    }
  }

  removeParked(car) {
    const i = this.parked.indexOf(car);
    if (i >= 0) this.parked.splice(i, 1);
    this.scene.remove(car.mesh.group);
  }

  buildMarker() {
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0.95, toneMapped: false, side: THREE.DoubleSide,
    });
    const ringGeo = new THREE.TorusGeometry(3.1, 0.17, 8, 40);
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.5;
    const ring2 = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
    ring2.scale.setScalar(0.62);
    ring2.position.y = 0.55;
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffb347, transparent: true, opacity: 0.085, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 3.3, 40, 18, 1, true), beamMat);
    beam.position.y = 20;
    const arrow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: markerArrowTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    arrow.scale.set(4, 4, 1);
    arrow.position.y = 7.2;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,209,102,0.8)', 'rgba(255,150,40,0)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5,
    }));
    glow.scale.set(12, 12, 1);
    glow.position.y = 1.2;
    g.add(ring, ring2, beam, arrow, glow);
    g.visible = false;
    this.scene.add(g);
    this.marker = { group: g, ring, ring2, beam, arrow, glow };
  }

  /* ================================================================ */
  /* lifecycle                                                        */
  /* ================================================================ */
  startGame() {
    if (this.state.started) return;
    this.audio.init();
    this.audio.setMuted(this.state.muted);
    this.state.started = true;
    this.ui.setStarted(true);
    this.resetRun();
    this.startMission(0);
    this.snapCamera();
    this.ui.toast('WELCOME TO BIG CITY LIFE', 'info');
    setTimeout(() => this.ui.toast('DRIVE TO THE GOLD MARKER', 'mission'), 1100);
    this.clock.getDelta();
  }

  resetRun() {
    const st = this.state;
    st.cash = 0;
    st.health = 100;
    st.nitro = 100;
    st.wanted = 0;
    st.heatTimer = 0;
    st.jobs = 0;
    st.over = false;
    st.paused = false;
    st.onFoot = false;
    st.mission = null;
    st.objective = null;
    st.missionTime = 0;
    st.missionDist = 0;
    this.nextMissionIndex = 0;
    this.missionCooldown = 0;
    this.character.hide();
    this.vehicle.mesh.group.visible = true;
    this.vehicle.reset(0, 14, 0);
    this.vehicle.nitro = 100;
    this.police.clear();
    this.traffic.respawnFarFrom(this.vehicle);
    this.marker.group.visible = false;
    this.ui.showOver(false, 'busted', st, st.best);
    this.ui.showPause(false, st);
  }

  restartRun() {
    this.audio.resume();
    this.resetRun();
    this.startMission(0);
    this.snapCamera();
    this.clock.getDelta();
  }

  togglePause(force) {
    const st = this.state;
    if (!st.started || st.over) return;
    const next = typeof force === 'boolean' ? force : !st.paused;
    if (next === st.paused) return;
    st.paused = next;
    this.ui.showPause(next, st);
    if (next) this.audio.suspend(); else { this.audio.resume(); this.clock.getDelta(); }
  }

  toggleQuality() {
    const st = this.state;
    st.quality = st.quality === 'high' ? 'low' : 'high';
    const high = st.quality === 'high';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 2 : 1.1));
    if (this.world.sun) this.world.sun.castShadow = high;
    this.scene.traverse((o) => {
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.needsUpdate = true;
      }
    });
    this.ui.showPause(true, st);
    this.ui.toast(high ? 'QUALITY: HIGH' : 'QUALITY: PERFORMANCE', 'info');
  }

  toggleSound() {
    const st = this.state;
    st.muted = !st.muted;
    this.audio.setMuted(st.muted);
    this.ui.showPause(st.paused, st);
    this.ui.toast(st.muted ? 'SOUND OFF' : 'SOUND ON', 'info');
  }

  /* ================================================================ */
  /* frame                                                            */
  /* ================================================================ */
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const st = this.state;

    if (!st.started) {
      this.attract(dt);
    } else if (!st.paused && !st.over) {
      this.update(dt);
    } else {
      this.world.update(dt * 0.15, this.time, this.focusPos());
      this.fx.update(dt * 0.3, null, this.time);
      this.police.update(dt * 0.1, this.playerRef(), st.wanted, this.time, {});
    }
    this.renderer.render(this.scene, this.camera);
  }

  attract(dt) {
    const t = this.time * 0.075;
    const r = 168;
    this.camera.position.set(Math.cos(t) * r, 54 + Math.sin(t * 0.7) * 8, Math.sin(t) * r);
    this.camera.lookAt(0, 14, 0);
    this.traffic.update(dt, this.vehicle, this.time);
    this.peds.update(dt, this.vehicle, this.time);
    this.world.update(dt, this.time, null);
    this.fx.update(dt, null, this.time);
    this.marker.group.visible = false;
  }

  update(dt) {
    const st = this.state;
    const input = this.getInput();
    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);

    if (st.onFoot) this.updateOnFoot(dt, input);
    else this.updateDriving(dt, input);

    this.updateWanted(dt);
    this.updatePolice(dt);
    this.updateTraffic(dt);
    this.updatePeds(dt);
    this.updatePickups(dt);
    this.updateMission(dt);

    this.fx.update(dt, this.vehicle, this.time);
    this.world.update(dt, this.time, this.focusPos());
    this.updateCamera(dt);
    this.updateUIState(dt);

    this.audio.update({
      speed: st.onFoot ? this.character.speed : this.vehicle.speed,
      throttle: Math.max(0, input.throttle),
      driving: !st.onFoot,
      drift: st.onFoot ? 0 : this.vehicle.driftFactor,
      wanted: st.wanted,
      copDistance: this.nearestCopDistance(),
    });
  }

  /* ================================================================ */
  /* input                                                            */
  /* ================================================================ */
  getInput() {
    const k = this.keys;
    const t = this.touch;
    const gas = t.gas || k['w'] || k['arrowup'];
    const brake = t.brake || k['s'] || k['arrowdown'];
    const left = t.left || k['a'] || k['arrowleft'];
    const right = t.right || k['d'] || k['arrowright'];
    return {
      throttle: (gas ? 1 : 0) - (brake ? 1 : 0),
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      handbrake: !!(t.hand || k[' ']),
      nitro: !!(t.nitro || k['shift']),
    };
  }

  /* ================================================================ */
  /* driving                                                          */
  /* ================================================================ */
  updateDriving(dt, input) {
    const st = this.state;
    const v = this.vehicle;
    const wasBoosting = v.boosting;
    v.update(dt, input, this.world, this.time);
    st.nitro = v.nitro;

    if (v.boosting && !wasBoosting) this.audio.nitroWhoosh();
    if (v.boosting && v.speed > 6) {
      const fwd = v.forward();
      this.fx.nitro(v.pos.x - fwd.x * 2.1, 0.45, v.pos.z - fwd.z * 2.1, v.heading);
    }

    // tire effects
    const drifting = v.driftFactor > 0.14 && Math.abs(v.speed) > 5;
    if (drifting) {
      const fwd = v.forward();
      const right = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading));
      const rearX = v.pos.x - fwd.x * 1.35;
      const rearZ = v.pos.z - fwd.z * 1.35;
      if (this.skidTimer <= 0) {
        this.skidTimer = 0.045;
        this.fx.skid(rearX + right.x * 0.82, rearZ + right.z * 0.82, v.heading, v.driftFactor);
        this.fx.skid(rearX - right.x * 0.82, rearZ - right.z * 0.82, v.heading, v.driftFactor);
      }
      if (Math.random() < 0.8) this.fx.tireSmoke(rearX + right.x * 0.82, rearZ + right.z * 0.82, v.driftFactor);
      if (Math.random() < 0.8) this.fx.tireSmoke(rearX - right.x * 0.82, rearZ - right.z * 0.82, v.driftFactor);
    }
    this.skidTimer -= dt;

    if (v.surface !== 'road' && Math.abs(v.speed) > 7 && Math.random() < 0.45) {
      this.fx.dust(v.pos.x, v.pos.z, 0.5);
    }

    // building impact
    if (v.collision) {
      const impact = v.collision.impact;
      const damage = clamp(impact * 0.75, 0, 42);
      this.damage(damage, true);
      this.fx.impact(
        v.pos.x + v.collision.nx * 1.5, 0.8, v.pos.z + v.collision.nz * 1.5,
        v.collision.nx, v.collision.nz, impact,
      );
      this.audio.crash(impact);
      this.shake = Math.max(this.shake, clamp(impact * 0.06, 0.15, 1.1));
      v.collision = null;
    }

    this.checkCarCollisions(dt);
    this.checkPedCollisions();
    this.updateTouchAction();

    if (st.health <= 0) this.endRun('wrecked');
  }

  checkCarCollisions(dt) {
    const v = this.vehicle;
    const st = this.state;
    // traffic
    for (const car of this.traffic.cars) {
      const dx = car.pos.x - v.pos.x;
      const dz = car.pos.z - v.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = 3.1;
      if (d > minD || d < 0.001) continue;
      const nx = dx / d, nz = dz / d;
      const overlap = minD - d;
      v.pos.x -= nx * overlap * 0.65;
      v.pos.z -= nz * overlap * 0.65;
      car.pos.x += nx * overlap * 0.35;
      car.pos.z += nz * overlap * 0.35;
      const impact = v.vel.x * nx + v.vel.z * nz;
      if (impact > 3.5) {
        const dmg = clamp(impact * 0.5, 0, 18);
        this.damage(dmg, false);
        this.traffic.knock(car, nx, nz, Math.min(16, impact * 0.9));
        v.vel.multiplyScalar(0.72);
        this.fx.impact(v.pos.x + nx * 1.6, 0.8, v.pos.z + nz * 1.6, nx, nz, impact);
        this.audio.crash(impact * 0.7);
        this.shake = Math.max(this.shake, clamp(impact * 0.035, 0.1, 0.7));
      }
    }
    // parked cars
    for (const car of this.parked) {
      const dx = car.pos.x - v.pos.x;
      const dz = car.pos.z - v.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = 3.0;
      if (d > minD || d < 0.001) continue;
      const nx = dx / d, nz = dz / d;
      const overlap = minD - d;
      v.pos.x -= nx * overlap;
      v.pos.z -= nz * overlap;
      const impact = v.vel.x * nx + v.vel.z * nz;
      if (impact > 3) {
        this.damage(clamp(impact * 0.4, 0, 14), false);
        v.vel.multiplyScalar(0.7);
        car.rock = 1;
        this.fx.impact(v.pos.x + nx * 1.6, 0.8, v.pos.z + nz * 1.6, nx, nz, impact);
        this.audio.crash(impact * 0.7);
        this.shake = Math.max(this.shake, clamp(impact * 0.03, 0.08, 0.5));
      }
    }
    // police
    for (const cop of this.police.cars) {
      if (!cop.active) continue;
      const dx = cop.pos.x - v.pos.x;
      const dz = cop.pos.z - v.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = 3.3;
      if (d > minD || d < 0.001) continue;
      const nx = dx / d, nz = dz / d;
      const overlap = minD - d;
      v.pos.x -= nx * overlap * 0.6;
      v.pos.z -= nz * overlap * 0.6;
      cop.pos.x += nx * overlap * 0.4;
      cop.pos.z += nz * overlap * 0.4;
      const impact = v.vel.x * nx + v.vel.z * nz;
      if (impact > 3) {
        this.police.damage(cop, impact * 5.5, {
          onCopWrecked: () => {
            this.fx.explosion(cop.pos.x, 0.6, cop.pos.z);
            this.audio.crash(2.5);
            this.addWanted(0.5);
            this.ui.toast('POLICE UNIT DOWN +HEAT', 'heat');
          },
        });
        this.damage(clamp(impact * 0.25, 0, 8), false);
        v.vel.multiplyScalar(0.75);
        this.fx.impact(v.pos.x + nx * 1.7, 0.9, v.pos.z + nz * 1.7, nx, nz, impact);
        this.audio.crash(impact);
        this.shake = Math.max(this.shake, 0.4);
        if (this.time - this.lastCopHit > 1.5) {
          this.lastCopHit = this.time;
          this.addWanted(0.25);
        }
      }
    }
  }

  checkPedCollisions() {
    const v = this.vehicle;
    const speed = Math.abs(v.speed);
    if (speed < 4) return;
    for (const ped of this.peds.peds) {
      if (ped.down > 0) continue;
      const d = dist2(ped.pos.x, ped.pos.z, v.pos.x, v.pos.z);
      if (d < 2.3) {
        this.peds.hit(ped);
        this.addWanted(0.8);
        this.fx.impact(ped.pos.x, 1, ped.pos.z, 0, 0, 6);
        this.audio.crash(0.8);
        this.shake = Math.max(this.shake, 0.3);
        this.ui.toast('CIVILIAN HIT +HEAT', 'heat');
        v.vel.multiplyScalar(0.9);
        break;
      }
    }
  }

  updateTouchAction() {
    const v = this.vehicle;
    if (Math.abs(v.speed) < 1.6 && !this.state.onFoot) {
      this.ui.setAction('EXIT', true, false);
    } else {
      this.ui.setAction('', false);
    }
  }

  /* ================================================================ */
  /* on foot                                                          */
  /* ================================================================ */
  updateOnFoot(dt, input) {
    const st = this.state;
    this.character.update(dt, input, this.world);

    // find a car to enter
    let label = '';
    let nearest = null;
    const dOwn = dist2(this.character.pos.x, this.character.pos.z, this.vehicle.pos.x, this.vehicle.pos.z);
    if (dOwn < 5) {
      label = 'ENTER';
      nearest = 'own';
    } else {
      let best = 5;
      for (const car of this.traffic.cars) {
        const d = dist2(this.character.pos.x, this.character.pos.z, car.pos.x, car.pos.z);
        if (d < best) { best = d; nearest = car; }
      }
      for (const car of this.parked) {
        const d = dist2(this.character.pos.x, this.character.pos.z, car.pos.x, car.pos.z);
        if (d < best) { best = d; nearest = car; }
      }
      if (nearest) label = 'STEAL';
    }
    this._enterTarget = nearest;
    this.ui.setAction(label, !!nearest);
    this.updateRegen(dt);
  }

  toggleVehicle() {
    const st = this.state;
    if (!st.started || st.paused || st.over) return;
    if (st.onFoot) {
      const target = this._enterTarget;
      if (!target) return;
      if (target === 'own') {
        st.onFoot = false;
        this.character.hide();
        this.vehicle.mesh.group.visible = true;
        this.ui.toast('BACK IN THE DRIVER SEAT', 'info');
      } else {
        // steal the nearest traffic or parked car
        if (this.traffic.cars.includes(target)) this.traffic.remove(target);
        else this.removeParked(target);
        this.vehicle.setLook(target.kind, target.color);
        this.vehicle.reset(target.pos.x, target.pos.z, target.heading);
        this.vehicle.nitro = Math.max(35, this.vehicle.nitro);
        st.onFoot = false;
        this.character.hide();
        this.ui.toast('RIDE STOLEN', 'cash');
        this.addWanted(0.15);
        this.audio.beep(720, 0.1, 'triangle', 0.1);
      }
      this.ui.setAction('', false);
      this.snapCamera();
      return;
    }

    if (Math.abs(this.vehicle.speed) > 12) {
      this.ui.toast('SLOW DOWN TO GET OUT', 'info');
      return;
    }
    const v = this.vehicle;
    v.vel.set(0, 0, 0);
    v.speed = 0;
    st.onFoot = true;
    const right = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading));
    const px = v.pos.x + right.x * 2.2;
    const pz = v.pos.z + right.z * 2.2;
    this.character.reset(px, pz, v.heading);
    this.world.resolveCircle(this.character.pos, 0.5);
    this.character.sync(0);
    this.ui.toast('ON FOOT — FIND A RIDE', 'info');
    this.snapCamera();
  }

  /* ================================================================ */
  /* world systems                                                    */
  /* ================================================================ */
  updateWanted(dt) {
    const st = this.state;
    if (st.wanted <= 0) { st.wanted = 0; return; }
    st.heatTimer = Math.max(0, st.heatTimer - dt);
    if (st.heatTimer <= 0) {
      st.wanted = Math.max(0, st.wanted - dt * 0.11);
      if (st.wanted < 0.02) st.wanted = 0;
    }
  }

  addWanted(amount) {
    const st = this.state;
    if (st.over) return;
    const before = Math.ceil(st.wanted);
    st.wanted = clamp(st.wanted + amount, 0, 5);
    st.heatTimer = 22;
    const after = Math.ceil(st.wanted);
    if (after > before) {
      this.ui.toast(`WANTED LEVEL ${after}`, 'heat');
      this.audio.beep(420 + after * 70, 0.16, 'square', 0.08);
    }
  }

  nearestCopDistance() {
    let best = Infinity;
    for (const c of this.police.cars) {
      if (!c.active) continue;
      const p = this.playerPos();
      const d = dist2(c.pos.x, c.pos.z, p.x, p.z);
      if (d < best) best = d;
    }
    return best;
  }

  updatePolice(dt) {
    const st = this.state;
    if (st.wanted <= 0) {
      if (this.police.cars.length) this.police.clear();
      return;
    }
    const maxCops = Math.min(7, Math.floor(st.wanted * 1.6));
    const alive = this.police.cars.filter((c) => c.active);
    if (alive.length > maxCops) {
      alive.sort((a, b) => {
        const pa = this.playerPos();
        return dist2(b.pos.x, b.pos.z, pa.x, pa.z) - dist2(a.pos.x, a.pos.z, pa.x, pa.z);
      });
      for (let i = 0; i < alive.length - maxCops; i++) {
        alive[i].active = false;
        alive[i].mesh.group.visible = false;
      }
    }

    const player = this.playerRef();
    this.police.update(dt, player, st.wanted, this.time, {
      onShoot: (cop, dist) => {
        this.audio.gunshot();
        const p = this.playerPos();
        this.fx.gunshot(cop.pos.x, 1.1, cop.pos.z, p.x, 1.1, p.z);
        if (dist < 30) {
          this.damage(1.8 + Math.random() * 1.4, false);
          this.shake = Math.max(this.shake, 0.18);
        }
      },
      onBusted: () => {
        if (this.bustedGuard > 0) return;
        this.bustedGuard = 3;
        this.endRun('busted');
      },
    });
    this.bustedGuard = Math.max(0, this.bustedGuard - dt);
  }

  updateTraffic(dt) {
    const player = this.state.onFoot
      ? { pos: this.character.pos, speed: this.character.speed }
      : { pos: this.vehicle.pos, speed: this.vehicle.speed };
    this.traffic.update(dt, player, this.time);
    for (const car of this.parked) {
      if (car.rock > 0) {
        car.rock = Math.max(0, car.rock - dt * 1.8);
        car.mesh.group.rotation.z = Math.sin(this.time * 22) * car.rock * 0.04;
        car.mesh.group.position.y = Math.abs(Math.sin(this.time * 18)) * car.rock * 0.05;
      }
    }
  }

  updatePeds(dt) {
    const player = this.state.onFoot
      ? { pos: this.character.pos, speed: this.character.speed }
      : { pos: this.vehicle.pos, speed: this.vehicle.speed };
    this.peds.update(dt, player, this.time);
  }

  updatePickups(dt) {
    const st = this.state;
    const p = this.playerPos();
    for (const item of this.pickups) {
      if (!item.active) {
        item.respawn -= dt;
        if (item.respawn <= 0) {
          const np = this.world.randomRoadPoint(this.rand);
          item.pos.set(np.x, 0, np.z);
          item.mesh.position.set(np.x, 2.1, np.z);
          item.active = true;
          item.mesh.visible = true;
          item.value = item.type === 'cash' ? Math.round(this.rand.range(120, 420) / 10) * 10 : 0;
        }
        continue;
      }
      const bob = Math.sin(this.time * 2.4 + item.phase) * 0.25;
      item.mesh.position.y = 2.05 + bob;
      const d = dist2(item.pos.x, item.pos.z, p.x, p.z);
      const reach = st.onFoot ? 2.0 : 3.2;
      if (d > reach) continue;
      item.active = false;
      item.mesh.visible = false;
      item.respawn = this.rand.range(22, 38);
      if (item.type === 'cash') {
        st.cash += item.value;
        this.audio.cash();
        this.fx.pickup(item.pos.x, 1, item.pos.z, 0x7dff6e);
        this.ui.toast(`+${money(item.value)}`, 'cash');
        this.updateBest();
      } else if (item.type === 'repair') {
        st.health = Math.min(100, st.health + 50);
        this.audio.pickup();
        this.fx.pickup(item.pos.x, 1, item.pos.z, 0x3fd0e6);
        this.ui.toast('VEHICLE REPAIRED', 'info');
      } else {
        if (!st.onFoot) this.vehicle.nitro = 100;
        this.audio.pickup();
        this.fx.pickup(item.pos.x, 1, item.pos.z, 0xff9a2a);
        this.ui.toast('NITRO REFILLED', 'info');
      }
    }
  }

  updateRegen(dt) {
    const st = this.state;
    this.regenTimer -= dt;
    if (this.regenTimer <= 0 && st.health < 100 && !st.over) {
      st.health = Math.min(100, st.health + 3 * dt);
    }
  }

  damage(amount, heavy = false) {
    const st = this.state;
    if (st.over) return;
    st.health -= amount;
    this.regenTimer = 9;
    this.damageCooldown = 0.2;
    const flash = document.getElementById('damageFlash');
    flash.classList.add('hit');
    setTimeout(() => flash.classList.remove('hit'), 70);
    if (heavy) this.shake = Math.max(this.shake, clamp(amount * 0.04, 0.2, 0.9));
    if (st.health <= 0) {
      st.health = 0;
      this.endRun('wrecked');
    }
  }

  /* ================================================================ */
  /* missions                                                         */
  /* ================================================================ */
  startMission(index) {
    const st = this.state;
    const p = this.playerPos();
    const total = 3 + Math.min(3, Math.floor(index / 2));
    const checkpoints = [];
    for (let i = 0; i < total; i++) {
      let best = null;
      for (let tries = 0; tries < 50; tries++) {
        const cand = this.world.randomRoadPoint(this.rand);
        const prev = checkpoints.length ? checkpoints[checkpoints.length - 1] : p;
        if (dist2(cand.x, cand.z, prev.x, prev.z) < 65) continue;
        if (dist2(cand.x, cand.z, p.x, p.z) > 260) continue;
        best = cand;
        break;
      }
      if (!best) best = this.world.randomRoadPoint(this.rand);
      checkpoints.push(best);
    }

    const time = 32 + total * 19;
    const reward = 380 + index * 260 + total * 60;
    st.mission = {
      name: MISSION_NAMES[index] || `JOB ${index + 1}`,
      index: 0,
      total,
      time,
      reward,
      checkpoints,
      number: index + 1,
    };
    st.missionTime = time;
    st.missionDist = dist2(p.x, p.z, checkpoints[0].x, checkpoints[0].z);
    st.objective = checkpoints[0];
    this.marker.group.visible = true;
    this.marker.group.position.set(checkpoints[0].x, 0, checkpoints[0].z);
    this.missionCooldown = 0;
    st.missionIdle = null;
    this.ui.toast(`JOB ${index + 1} — ${st.mission.name}`, 'mission');

    if (index >= 3 && st.wanted < 2) {
      st.wanted = 2;
      st.heatTimer = 25;
      setTimeout(() => this.ui.toast('THE HEAT IS ON', 'heat'), 700);
    }
  }

  updateMission(dt) {
    const st = this.state;
    if (st.mission) {
      const m = st.mission;
      const p = this.playerPos();
      const obj = m.checkpoints[m.index];
      st.objective = obj;
      st.missionTime = Math.max(0, st.missionTime - dt);
      st.missionDist = dist2(p.x, p.z, obj.x, obj.z);
      this.marker.group.position.set(obj.x, 0, obj.z);
      this.marker.ring.rotation.z += dt * 1.4;
      this.marker.ring2.rotation.z -= dt * 2.1;
      const pulse = 1 + Math.sin(this.time * 4) * 0.08;
      this.marker.ring.scale.setScalar(pulse);
      this.marker.arrow.position.y = 7.2 + Math.sin(this.time * 2.4) * 0.4;
      this.marker.beam.material.opacity = 0.07 + Math.sin(this.time * 3) * 0.025;

      if (st.missionDist < 8.5) {
        m.index++;
        this.audio.beep(880, 0.1, 'triangle', 0.1);
        if (m.index >= m.total) {
          this.completeMission();
        } else {
          st.objective = m.checkpoints[m.index];
          st.missionTime += 4;
          this.marker.group.position.set(st.objective.x, 0, st.objective.z);
          this.fx.pickup(st.objective.x, 1, st.objective.z, 0xffd166);
          this.ui.toast(`CHECKPOINT ${m.index} / ${m.total}`, 'mission');
        }
      } else if (st.missionTime <= 0) {
        this.failMission();
      }
      return;
    }

    if (this.missionCooldown > 0) {
      this.missionCooldown -= dt;
      if (this.missionCooldown <= 0) this.startMission(this.nextMissionIndex);
    }
  }

  completeMission() {
    const st = this.state;
    const m = st.mission;
    st.cash += m.reward;
    st.jobs++;
    st.health = Math.min(100, st.health + 15);
    this.audio.missionComplete();
    this.fx.pickup(this.playerPos().x, 2, this.playerPos().z, 0xffd166);
    this.ui.toast(`JOB COMPLETE +${money(m.reward)}`, 'cash');
    this.updateBest();
    st.mission = null;
    st.objective = null;
    this.marker.group.visible = false;
    this.nextMissionIndex = m.number;
    this.missionCooldown = 4.5;
    st.missionIdle = 'complete';
    this.ui.toast('NEXT JOB INCOMING…', 'mission');
  }

  failMission() {
    const st = this.state;
    st.mission = null;
    st.objective = null;
    this.marker.group.visible = false;
    this.ui.toast('JOB FAILED — OUT OF TIME', 'heat');
    this.audio.beep(180, 0.4, 'sawtooth', 0.12);
    this.missionCooldown = 3;
    st.missionIdle = 'failed';
  }

  /* ================================================================ */
  /* end states                                                       */
  /* ================================================================ */
  endRun(kind) {
    const st = this.state;
    if (st.over) return;
    st.over = true;
    st.wanted = 0;
    st.mission = null;
    st.objective = null;
    this.marker.group.visible = false;
    this.police.clear();
    const penalty = kind === 'busted' ? 0.15 : 0.2;
    st.cash = Math.max(0, st.cash * (1 - penalty));
    this.updateBest();
    if (kind === 'wrecked') {
      this.fx.explosion(this.vehicle.pos.x, 0.7, this.vehicle.pos.z);
      this.audio.crash(3);
      this.vehicle.mesh.group.visible = false;
    }
    this.audio.busted();
    this.ui.setAction('', false);
    this.ui.showOver(true, kind, st, st.best);
    this.ui.showPause(false, st);
    this.audio.suspend();
  }

  continueRun() {
    const st = this.state;
    st.over = false;
    st.health = 100;
    st.nitro = 100;
    st.wanted = 0;
    st.heatTimer = 0;
    st.onFoot = false;
    st.mission = null;
    st.objective = null;
    this.character.hide();
    this.vehicle.mesh.group.visible = true;
    this.vehicle.nitro = 100;
    const spawn = this.safeSpawn();
    this.vehicle.reset(spawn.x, spawn.z, spawn.heading);
    this.police.clear();
    this.traffic.respawnFarFrom(this.vehicle);
    this.ui.showOver(false, 'busted', st, st.best);
    this.ui.setAction('', false);
    this.marker.group.visible = false;
    this.missionCooldown = 2.5;
    this.nextMissionIndex = Math.max(0, this.nextMissionIndex);
    this.snapCamera();
    this.audio.resume();
    this.audio.beep(520, 0.14, 'triangle', 0.1);
    this.ui.toast('BACK ON THE STREETS', 'info');
    this.clock.getDelta();
  }

  safeSpawn() {
    for (let i = 0; i < 20; i++) {
      const p = this.world.randomRoadPoint(this.rand);
      const cops = this.police.cars.filter((c) => c.active);
      if (cops.every((c) => dist2(c.pos.x, c.pos.z, p.x, p.z) > 60)) {
        return { ...p, heading: p.axis === 'x' ? Math.PI / 2 : 0 };
      }
    }
    return { x: 0, z: 14, heading: 0 };
  }

  respawnPlayer(manual = false) {
    const st = this.state;
    if (st.over) return;
    const spawn = this.safeSpawn();
    st.onFoot = false;
    this.character.hide();
    this.vehicle.mesh.group.visible = true;
    this.vehicle.reset(spawn.x, spawn.z, spawn.heading);
    this.vehicle.nitro = Math.max(this.vehicle.nitro, 50);
    this.police.clear();
    st.wanted = 0;
    st.heatTimer = 0;
    st.health = Math.max(st.health, 55);
    this.marker.group.visible = !!st.mission;
    this.snapCamera();
    this.ui.toast(manual ? 'VEHICLE RECOVERED' : 'BACK IN THE RIDE', 'info');
  }

  updateBest() {
    const st = this.state;
    if (st.cash > st.best) {
      st.best = st.cash;
      saveBest(st.best);
      this.ui.setBest(st.best);
    }
  }

  /* ================================================================ */
  /* camera / ui                                                      */
  /* ================================================================ */
  focusPos() {
    return this.state.onFoot ? this.character.pos : this.vehicle.pos;
  }

  playerPos() {
    return this.state.onFoot ? this.character.pos : this.vehicle.pos;
  }

  playerRef() {
    return this.state.onFoot
      ? { pos: this.character.pos, speed: this.character.speed }
      : { pos: this.vehicle.pos, speed: this.vehicle.speed };
  }

  snapCamera() {
    const p = this.playerPos();
    if (this.state.onFoot) {
      const fwd = new THREE.Vector3(Math.sin(this.character.heading), 0, Math.cos(this.character.heading));
      this.camera.position.set(p.x - fwd.x * 4.4, 2.7, p.z - fwd.z * 4.4);
      this.camera.lookAt(p.x + fwd.x * 2, 1.2, p.z + fwd.z * 2);
    } else {
      const fwd = this.vehicle.forward();
      this.camera.position.set(p.x - fwd.x * 7.6, 3.3, p.z - fwd.z * 7.6);
      this.camera.lookAt(p.x + fwd.x * 5, 1.2, p.z + fwd.z * 5);
    }
  }

  updateCamera(dt) {
    const st = this.state;
    const p = this.playerPos();
    let fovTarget = 62;
    if (st.onFoot) {
      const fwd = new THREE.Vector3(Math.sin(this.character.heading), 0, Math.cos(this.character.heading));
      const desired = new THREE.Vector3(p.x - fwd.x * 4.6, 2.75, p.z - fwd.z * 4.6);
      this.camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
      if (this.camera.position.y < 1.4) this.camera.position.y = 1.4;
      this.camera.lookAt(p.x + fwd.x * 2.4, 1.25, p.z + fwd.z * 2.4);
      fovTarget = 60;
    } else {
      const v = this.vehicle;
      const speedRatio = clamp(Math.abs(v.speed) / v.maxSpeed, 0, 1);
      const fwd = v.forward();
      const back = 8.3 + speedRatio * 2.8 + (v.boosting ? 1.7 : 0);
      const height = 3.55 + speedRatio * 0.6;
      const desired = new THREE.Vector3(
        p.x - fwd.x * back,
        height,
        p.z - fwd.z * back,
      );
      this.camera.position.lerp(desired, 1 - Math.exp(-6.2 * dt));
      if (this.camera.position.y < 1.3) this.camera.position.y = 1.3;
      const look = new THREE.Vector3(
        p.x + fwd.x * (6 + speedRatio * 8),
        1.25,
        p.z + fwd.z * (6 + speedRatio * 8),
      );
      if (this.shake > 0.005) {
        look.x += (Math.random() - 0.5) * this.shake * 0.6;
        look.y += (Math.random() - 0.5) * this.shake * 0.4;
        look.z += (Math.random() - 0.5) * this.shake * 0.6;
      }
      this.camera.lookAt(look);
      fovTarget = 62 + speedRatio * 10 + (v.boosting ? 5 : 0);
    }
    this.camera.fov = damp(this.camera.fov, fovTarget, 4, dt);
    this.camera.updateProjectionMatrix();
  }

  updateUIState(dt) {
    const st = this.state;
    const p = this.playerPos();
    st.playerX = p.x;
    st.playerZ = p.z;
    st.heading = st.onFoot ? this.character.heading : this.vehicle.heading;
    st.kmh = st.onFoot ? 0 : this.vehicle.kmh;
    st.gear = st.onFoot ? 'WALK' : this.vehicle.speed < -0.5 ? 'R' : Math.abs(this.vehicle.speed) < 0.5 ? 'N' : 'D';
    st.boosting = !st.onFoot && this.vehicle.boosting;
    st.drift = st.onFoot ? 0 : this.vehicle.driftFactor;
    st.cops = this.police.cars;
    st.pickups = this.pickups;
    st.missionCooldown = Math.max(0, this.missionCooldown);
    this.ui.update(st, dt);
    this.updateRegen(dt);
  }
}

/* Boot */
window.addEventListener('load', () => {
  try {
    window.__game = new Game();
  } catch (err) {
    console.error(err);
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.remove('hidden');
      loading.innerHTML = '<div style="max-width:70ch;text-align:center;line-height:1.6;letter-spacing:0">' +
        '<b>WEBGL / WEBGPU UNAVAILABLE</b><br>' + String(err && err.message || err) + '</div>';
    }
  }
});
