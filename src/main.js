import * as THREE from 'three';
import { createWorld, CITY } from './world.js';
import {
  CarBody, createCarMesh, collideWithWorld, collideCars,
} from './vehicles.js';
import { PoliceManager } from './police.js';
import { Traffic, Pedestrians } from './traffic.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { GameAudio } from './audio.js';
import { createInput } from './input.js';
import { clamp, damp, rand, makeShadowTexture, makeHeadlightTexture, makeGlowTexture } from './utils.js';

/* ------------------------------------------------------------------ */
/*  Renderer / scene                                                  */
/* ------------------------------------------------------------------ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
camera.position.set(16, 7, 24);
camera.lookAt(0, 1, 4);

const world = createWorld(scene, renderer);
const fx = new FX(scene);
const hud = new HUD(world);
const audio = new GameAudio();

/* ------------------------------------------------------------------ */
/*  Player car                                                        */
/* ------------------------------------------------------------------ */
const playerMesh = createCarMesh({ color: 0x1fe0c8, kind: 'player', accent: 0xeaffff });
scene.add(playerMesh.group);

const underglow = new THREE.Mesh(
  new THREE.PlaneGeometry(4.6, 7.8),
  new THREE.MeshBasicMaterial({
    map: makeGlowTexture(), color: 0x2fffe4, transparent: true, opacity: 0.42,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  })
);
underglow.rotation.x = -Math.PI / 2;
underglow.position.y = 0.05;
playerMesh.group.add(underglow);

const headCone = new THREE.Mesh(
  new THREE.PlaneGeometry(11, 26),
  new THREE.MeshBasicMaterial({
    map: makeHeadlightTexture(), transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  })
);
headCone.rotation.x = -Math.PI / 2;
headCone.position.set(0, 0.04, -14);
playerMesh.group.add(headCone);

// A soft hero light makes the paint read at night without a costly spotlight.
const heroLight = new THREE.PointLight(0x8fffe8, 34, 18, 1.6);
heroLight.position.set(0, 5.2, 0.6);
playerMesh.group.add(heroLight);

const player = new CarBody({
  x: 0, z: 6, heading: 0,
  maxSpeed: 42, accel: 27, turnRate: 2.2, grip: 7.4, radius: 1.44,
});
playerMesh.group.position.set(player.pos.x, 0, player.pos.z);

/* ------------------------------------------------------------------ */
/*  Shadows                                                           */
/* ------------------------------------------------------------------ */
const shadowGeo = new THREE.PlaneGeometry(3.8, 6.4);
shadowGeo.rotateX(-Math.PI / 2);
const shadows = new THREE.InstancedMesh(
  shadowGeo,
  new THREE.MeshBasicMaterial({
    map: makeShadowTexture(), transparent: true, opacity: 0.8,
    depthWrite: false, toneMapped: false,
  }),
  80
);
shadows.frustumCulled = false;
shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(shadows);
const shadowDummy = new THREE.Object3D();

/* ------------------------------------------------------------------ */
/*  Systems                                                           */
/* ------------------------------------------------------------------ */
const traffic = new Traffic(scene, world);
const peds = new Pedestrians(scene);
const police = new PoliceManager(scene, world, player, audio, fx);

const input = createInput({
  onPause: () => togglePause(),
  onMute: () => toggleMute(),
  onRestart: () => {
    if (state === 'menu') return;
    startGame();
  },
});

/* ------------------------------------------------------------------ */
/*  Game state                                                        */
/* ------------------------------------------------------------------ */
let state = 'menu'; // menu | playing | paused | over
let menuTime = 0;
let gameTime = 0;
let score = 0;
let heat = 14;
let health = 100;
let nitro = 100;
let wanted = 1;
let takedowns = 0;
let topSpeed = 0;
let bustProgress = 0;
let evadeTimer = 0;
let escapeTimer = 0;
let evadeToast = false;
let crashCooldown = 0;
let nearMissCooldown = 0;
let boostActive = false;
let overShown = false;
let overTimeout = null;

let best = 0;
try { best = Number(localStorage.getItem('neonvice.best') || 0); } catch { /* ignore */ }
hud.setBest(best);

/* ------------------------------------------------------------------ */
/*  Camera                                                            */
/* ------------------------------------------------------------------ */
const camPos = new THREE.Vector3(16, 7, 24);
const camLook = new THREE.Vector3(0, 1, 4);
const tmpV = new THREE.Vector3();

function snapCamera() {
  const fwd = player.forward;
  camPos.copy(player.pos).addScaledVector(fwd, -9.2).add(new THREE.Vector3(0, 4.1, 0));
  camLook.copy(player.pos).addScaledVector(fwd, 8).add(new THREE.Vector3(0, 1.35, 0));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.fov = 62;
  camera.updateProjectionMatrix();
}

function updateCamera(dt) {
  if (state === 'menu') {
    menuTime += dt;
    const drift = Math.sin(menuTime * 0.16) * 0.7;
    camPos.set(-7.6 + drift, 4.8 + Math.sin(menuTime * 0.4) * 0.25, -1.5);
    camLook.set(0.7, 1.05, -13.5);
    camera.position.lerp(camPos, 1 - Math.exp(-3 * dt));
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 58, 3, dt);
    camera.updateProjectionMatrix();
    return;
  }

  if (state === 'over') {
    const a = performance.now() * 0.00016;
    tmpV.set(player.pos.x + Math.cos(a) * 13, 7.5, player.pos.z + Math.sin(a) * 13);
    camera.position.lerp(tmpV, 1 - Math.exp(-1.2 * dt));
    camera.lookAt(player.pos.x, 1.1, player.pos.z);
    return;
  }

  if (state === 'paused') return;

  const speedT = clamp(Math.abs(player.speed) / 48, 0, 1);
  const fwd = player.forward;
  const back = 9.1 + speedT * 2.8;
  const height = 4.0 + speedT * 0.9;
  tmpV.copy(player.pos).addScaledVector(fwd, -back).add(new THREE.Vector3(0, height, 0));
  tmpV.addScaledVector(player.right, -player.steer * 0.7);
  camPos.lerp(tmpV, 1 - Math.exp(-4.8 * dt));

  tmpV.copy(player.pos).addScaledVector(fwd, 6 + speedT * 10).add(new THREE.Vector3(0, 1.35, 0));
  camLook.lerp(tmpV, 1 - Math.exp(-7.5 * dt));

  const shake = fx.shake * 0.35 + (player.impact > 7 ? 0.16 : 0);
  camera.position.copy(camPos);
  if (shake > 0.001) {
    camera.position.x += rand(-shake, shake);
    camera.position.y += rand(-shake, shake) * 0.65;
    camera.position.z += rand(-shake, shake);
  }
  camera.lookAt(camLook);
  const fovTarget = 62 + speedT * 10 + (boostActive ? 5 : 0);
  camera.fov = damp(camera.fov, fovTarget, 4, dt);
  camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------------ */
/*  Run lifecycle                                                     */
/* ------------------------------------------------------------------ */
function resetPlayer() {
  player.pos.set(CITY.start.x, 0, CITY.start.z);
  player.vel.set(0, 0, 0);
  player.heading = 0;
  player.steer = 0;
  player.speed = 0;
  player.roll = 0;
  player.pitch = 0;
  player.impact = 0;
  player.applyVisual(playerMesh.group, playerMesh.bodyMesh);
  underglow.material.opacity = 0.42;
  headCone.material.opacity = 0.42;
}

function resetPickups() {
  for (let i = 0; i < world.pickups.length; i++) {
    const p = world.pickups[i];
    p.userData.active = true;
    p.userData.timer = 0;
    p.visible = true;
    const spot = world.pickupSpots[(i * 3 + Math.floor(Math.random() * 5)) % world.pickupSpots.length];
    p.position.set(spot.x, 1.2, spot.z);
  }
}

function startGame() {
  audio.init();
  audio.click();
  audio.setMuted(audio.muted);

  resetPlayer();
  police.reset();
  traffic.reset();
  resetPickups();

  gameTime = 0;
  score = 0;
  heat = 14;
  health = 100;
  nitro = 100;
  wanted = 1;
  takedowns = 0;
  topSpeed = 0;
  bustProgress = 0;
  evadeTimer = 0;
  escapeTimer = 0;
  evadeToast = false;
  crashCooldown = 0;
  nearMissCooldown = 0;
  overShown = false;
  clearTimeout(overTimeout);

  state = 'playing';
  hud.showHUD();
  hud.showPause(false);
  snapCamera();

  // two units on the street immediately: one ahead in view, one closing from behind
  police.spawnAhead(36);
  police.spawnAhead(-64);
  police.update(0.016, 1);

  hud.toast('WANTED LEVEL 1', 'gold');
  setTimeout(() => { if (state === 'playing') hud.toast('LOSE THEM. SURVIVE THE NIGHT.', ''); }, 1400);
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    hud.showPause(true);
    audio.update(0, { active: false });
  } else if (state === 'paused') {
    state = 'playing';
    hud.showPause(false);
  }
}

function toggleMute() {
  const muted = audio.toggleMute();
  document.getElementById('sound-hint').textContent = muted ? 'Sound off' : 'Sound on';
  if (state !== 'menu') hud.toast(muted ? 'SOUND OFF' : 'SOUND ON');
}

function endRun(busted) {
  if (state === 'over') return;
  state = 'over';
  audio.update(0, { active: false });
  if (busted) {
    audio.crash(0.7);
    hud.toast('BUSTED', 'bad');
  } else {
    fx.explosion(player.pos.clone().add(new THREE.Vector3(0, 1, 0)));
    audio.explosion();
    hud.toast('WRECKED', 'bad');
  }

  const prevBest = best;
  const isBest = Math.floor(score) > prevBest;
  if (isBest) {
    best = Math.floor(score);
    try { localStorage.setItem('neonvice.best', String(best)); } catch { /* ignore */ }
  }
  hud.setBest(best);

  overTimeout = setTimeout(() => {
    if (state !== 'over') return;
    overShown = true;
    hud.showGameOver({
      busted,
      time: gameTime,
      score,
      takedowns,
      topSpeed,
      best: isBest,
    });
  }, 1300);
}

/* ------------------------------------------------------------------ */
/*  Pickups                                                           */
/* ------------------------------------------------------------------ */
function updatePickups(dt) {
  for (const p of world.pickups) {
    if (!p.userData.active) {
      p.userData.timer -= dt;
      if (p.userData.timer <= 0) {
        // respawn somewhere far enough away
        for (let k = 0; k < 14; k++) {
          const spot = world.pickupSpots[Math.floor(Math.random() * world.pickupSpots.length)];
          if (Math.hypot(spot.x - player.pos.x, spot.z - player.pos.z) > 45) {
            p.position.set(spot.x, 1.2, spot.z);
            break;
          }
        }
        p.userData.active = true;
        p.visible = true;
      }
      continue;
    }
    const d = Math.hypot(p.position.x - player.pos.x, p.position.z - player.pos.z);
    if (d < 3.6) {
      p.userData.active = false;
      p.userData.timer = rand(9, 16);
      p.visible = false;
      score += 300;
      nitro = Math.min(100, nitro + 30);
      health = Math.min(100, health + 8);
      audio.pickup();
      hud.toast('+$300', 'gold');
      fx.sparkBurst(p.position.clone(), 14, 0xffc857, 5);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Playing update                                                    */
/* ------------------------------------------------------------------ */
function updatePlaying(dt) {
  gameTime += dt;
  crashCooldown = Math.max(0, crashCooldown - dt);
  nearMissCooldown = Math.max(0, nearMissCooldown - dt);

  const raw = input.playerInput();
  boostActive = raw.boost && raw.throttle > 0 && nitro > 1 && Math.abs(player.speed) > 2;
  if (boostActive) {
    nitro = Math.max(0, nitro - dt * 24);
    if (nitro <= 0.5) boostActive = false;
  } else {
    nitro = Math.min(100, nitro + dt * 8.5);
  }

  player.update(dt, { ...raw, boost: boostActive });

  const impact = collideWithWorld(player, world.colliders, CITY.bounds);
  if (impact > 8) {
    const dmg = (impact - 7) * 0.48;
    health -= dmg;
    hud.flashDamage();
    fx.addShake(clamp(impact * 0.05, 0.15, 1));
    fx.sparks(player.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), Math.min(26, 5 + impact));
    audio.crash(clamp(impact / 22, 0.2, 1.2));
    if (impact > 19 && crashCooldown <= 0) {
      crashCooldown = 1.2;
      hud.toast('HEAVY IMPACT', 'bad');
    }
    heat = Math.min(100, heat + impact * 0.12);
  }

  // traffic collisions
  for (const car of traffic.cars) {
    const hit = collideCars(player, car.body);
    if (hit > 2.2) {
      const mid = new THREE.Vector3((player.pos.x + car.body.pos.x) / 2, 0.85, (player.pos.z + car.body.pos.z) / 2);
      fx.sparks(mid, Math.min(18, 4 + hit));
      fx.addShake(clamp(hit * 0.04, 0.08, 0.7));
      audio.crash(clamp(hit / 24, 0.15, 1));
      health -= hit * 0.28;
      heat = Math.min(100, heat + 2.4);
      traffic.hit(car, hit, player.pos.x, player.pos.z);
      hud.flashDamage();
    }
  }
  traffic.update(dt, player.pos);

  police.onHitPlayer = (rel) => {
    health -= clamp(rel * 0.62, 2, 26);
    heat = Math.min(100, heat + 2.2);
    fx.addShake(clamp(rel * 0.05, 0.2, 1.1));
    hud.flashDamage();
    if (rel > 12 && crashCooldown <= 0) {
      crashCooldown = 0.9;
      hud.toast('RAMMED', 'bad');
    }
  };
  police.onTakedown = () => {
    takedowns++;
    score += 800;
    heat = Math.min(100, heat + 7);
    hud.toast('TAKEDOWN +800', 'gold');
    fx.addShake(0.7);
  };

  police.update(dt, wanted);

  // near misses + cop scan
  let nearest = Infinity;
  for (const cop of police.cops) {
    if (cop.disabled) continue;
    const d = cop.body.pos.distanceTo(player.pos);
    nearest = Math.min(nearest, d);
    if (d < 6.5 && d > 2.6 && Math.abs(player.speed) > 17 && nearMissCooldown <= 0) {
      nearMissCooldown = 2.5;
      score += 60;
      heat = Math.min(100, heat + 0.6);
      if (Math.random() < 0.6) hud.toast('NEAR MISS +60', '');
    }
  }

  updatePickups(dt);

  // wanted / heat
  const copsActive = police.activeCount;
  if (escapeTimer > 0) {
    escapeTimer -= dt;
    if (escapeTimer <= 0) {
      heat = 12;
      hud.toast('NEW PURSUIT INBOUND', 'bad');
      police.spawnNearPlayer();
      police.spawnNearPlayer();
    }
  } else if (heat > 0) {
    heat = Math.min(100, heat + dt * (0.32 + wanted * 0.11));
    if (Math.abs(player.speed) > 26 && nearest < 70) heat = Math.min(100, heat + dt * 0.4);
  }

  if (heat > 0 && escapeTimer <= 0) {
    if (copsActive === 0 || nearest > 95) {
      evadeTimer += dt;
      if (evadeTimer > 3.2) {
        heat = Math.max(0, heat - dt * 10);
        if (!evadeToast) {
          evadeToast = true;
          hud.toast('LOSING THEM', '');
        }
      }
    } else {
      evadeTimer = 0;
      evadeToast = false;
    }
  }

  const newWanted = heat <= 0 ? 0 : clamp(Math.ceil(heat / 20), 1, 5);
  if (newWanted !== wanted) {
    if (newWanted > wanted) {
      hud.toast(`WANTED LEVEL ${newWanted}`, 'bad');
      audio.click();
      if (newWanted >= 3) hud.toast('AIR UNIT DEPLOYED', 'bad');
    }
    wanted = newWanted;
  }

  if (heat <= 0 && escapeTimer <= 0) {
    heat = 0;
    escapeTimer = 6.5;
    evadeTimer = 0;
    evadeToast = false;
    score += 1200;
    hud.toast('CLEAN GETAWAY +1200', 'gold');
  }

  // busted check
  if (wanted > 0 && copsActive > 0 && nearest < 7 && Math.abs(player.speed) < 1.6) {
    bustProgress += dt / 3.4;
    if (bustProgress > 0.15 && Math.random() < dt * 2) hud.toast('KEEP MOVING', 'bad');
  } else {
    bustProgress = Math.max(0, bustProgress - dt * 1.1);
  }
  if (bustProgress >= 1) {
    endRun(true);
    return;
  }

  // score
  score += dt * (8 + wanted * 5 + Math.abs(player.speed) * 0.15);
  topSpeed = Math.max(topSpeed, Math.abs(player.speed) * 3.6);

  if (health <= 0) {
    endRun(false);
    return;
  }

  fx.update(dt, player, raw);
  world.animate(dt);
  peds.update(dt, player.pos, Math.abs(player.speed));

  hud.update(dt, {
    player,
    wanted,
    heat,
    health,
    nitro,
    score,
    time: gameTime,
    cops: copsActive,
    copBlips: police.blips,
    pickups: world.pickups,
    helicopter: police.heli ? police.heli.pos : null,
    bustProgress,
    boosting: boostActive,
    maxSpeed: player.maxSpeed,
  });

  audio.update(dt, {
    speed: player.speed,
    throttle: raw.throttle,
    drifting: raw.handbrake || player.slip > 4,
    siren: nearest === Infinity ? 0 : clamp(1 - nearest / 120, 0, 1),
    active: true,
  });
}

/* ------------------------------------------------------------------ */
/*  Shadow pass                                                       */
/* ------------------------------------------------------------------ */
function updateShadows() {
  let i = 0;
  const place = (pos, heading, scale = 1) => {
    if (i >= 80) return;
    shadowDummy.position.set(pos.x, 0.055, pos.z);
    shadowDummy.rotation.set(0, heading, 0);
    shadowDummy.scale.set(scale, 1, scale);
    shadowDummy.updateMatrix();
    shadows.setMatrixAt(i++, shadowDummy.matrix);
  };
  place(player.pos, player.heading, 1);
  for (const cop of police.cops) place(cop.body.pos, cop.body.heading, 1.05);
  for (const car of traffic.cars) place(car.body.pos, car.body.heading, 1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (; i < 80; i++) shadows.setMatrixAt(i, zero);
  shadows.instanceMatrix.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/*  Menu / idle update                                                */
/* ------------------------------------------------------------------ */
function updateMenu(dt) {
  world.animate(dt);
  traffic.update(dt, player.pos);
  peds.update(dt, player.pos, 0);
  playerMesh.group.position.set(CITY.start.x, 0, CITY.start.z);
  playerMesh.group.rotation.y = 0;
  playerMesh.bodyMesh.rotation.z = Math.sin(menuTime * 1.4) * 0.004;
  underglow.material.opacity = 0.12 + Math.sin(menuTime * 2) * 0.03;
  updateCamera(dt);
}

/* ------------------------------------------------------------------ */
/*  Main loop                                                         */
/* ------------------------------------------------------------------ */
let last = performance.now();
let firstFrame = true;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;

  if (state === 'menu') {
    updateMenu(dt);
  } else if (state === 'playing') {
    updatePlaying(dt);
    updateCamera(dt);
    updateShadows();
  } else if (state === 'paused') {
    updateCamera(dt);
    updateShadows();
  } else if (state === 'over') {
    fx.update(dt, null, null);
    world.animate(dt);
    updateCamera(dt);
    updateShadows();
  }

  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ */
/*  UI wiring                                                         */
/* ------------------------------------------------------------------ */
document.getElementById('start-btn').addEventListener('click', () => startGame());
document.getElementById('resume-btn').addEventListener('click', () => togglePause());
document.getElementById('restart-btn').addEventListener('click', () => startGame());
document.getElementById('quit-btn').addEventListener('click', () => {
  hud.showPause(false);
  state = 'playing';
  endRun(false);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && state === 'menu') startGame();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});

// Debug / automation hook
window.__neon = {
  get state() { return state; },
  start: startGame,
  player,
  police,
  traffic,
  world,
  scene,
  camera,
  renderer,
  hud,
  get stats() { return { state, score, heat, wanted, health, time: gameTime, takedowns, topSpeed }; },
  setHeat(v) { heat = clamp(v, 0, 100); },
  setHealth(v) { health = clamp(v, 0, 100); },
  setNitro(v) { nitro = clamp(v, 0, 100); },
};

resetPlayer();
hud.hideLoading();
requestAnimationFrame(frame);
