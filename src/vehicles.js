import * as THREE from '../vendor/three.module.js';
import { clamp, damp, glowTexture, Rand } from './util.js';

/* Shared materials */
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x182836, roughness: 0.1, metalness: 0.55, transparent: true, opacity: 0.94,
});
const darkMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.75, metalness: 0.2 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c9, roughness: 0.22, metalness: 0.95 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3d0, toneMapped: false });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff1408, toneMapped: false });
const redGlowMat = new THREE.MeshBasicMaterial({ color: 0xff2038, toneMapped: false });
const blueGlowMat = new THREE.MeshBasicMaterial({ color: 0x2f7bff, toneMapped: false });
const flameMat = new THREE.MeshBasicMaterial({
  color: 0x5ee6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});
const underglowTex = glowTexture('rgba(255,140,40,0.85)', 'rgba(255,60,0,0)');

const paintCache = new Map();
function paintMat(color) {
  if (!paintCache.has(color)) {
    paintCache.set(color, new THREE.MeshStandardMaterial({
      color, roughness: 0.32, metalness: 0.62,
    }));
  }
  return paintCache.get(color);
}

const CAR_COLORS = [
  0xd93025, 0xf2c14e, 0x2f7de1, 0x2fbf71, 0xe8e6df, 0x1b1d22,
  0x8b5cf6, 0xff7a1a, 0x24b3c7, 0xb02a3a, 0x9aa3ad, 0x5c7a3a,
];

/* ------------------------------------------------------------------ */
/* Car mesh factory                                                   */
/* ------------------------------------------------------------------ */
export function buildCarMesh(opts = {}) {
  const kind = opts.kind || 'sedan';
  const color = opts.color ?? 0xd93025;
  const group = new THREE.Group();
  const wheels = [];
  const paint = paintMat(color);

  const dims = {
    sedan: { L: 4.55, W: 1.88, bodyH: 0.52, cabinH: 0.5, cabinBottom: 2.5, cabinTop: 1.62, cabinZ: -0.3, wheelR: 0.37 },
    sport: { L: 4.35, W: 1.98, bodyH: 0.46, cabinH: 0.46, cabinBottom: 2.2, cabinTop: 1.24, cabinZ: -0.3, wheelR: 0.4 },
    suv: { L: 4.95, W: 2.0, bodyH: 0.68, cabinH: 0.58, cabinBottom: 2.9, cabinTop: 2.15, cabinZ: -0.15, wheelR: 0.46 },
    van: { L: 5.3, W: 2.05, bodyH: 0.75, cabinH: 0.8, cabinBottom: 4.0, cabinTop: 3.6, cabinZ: -0.35, wheelR: 0.43 },
    police: { L: 4.75, W: 1.95, bodyH: 0.52, cabinH: 0.5, cabinBottom: 2.6, cabinTop: 1.65, cabinZ: -0.25, wheelR: 0.4 },
  }[kind];
  const { L, W, bodyH, cabinH, cabinBottom, cabinTop, cabinZ, wheelR } = dims;

  // layered body: low chassis, wider mid section, hood and trunk plates
  const baseY = wheelR * 0.9;
  const lowerH = 0.34;
  const lowerY = baseY + lowerH / 2;
  const upperH = bodyH * 0.55;
  const upperY = baseY + lowerH + upperH / 2 - 0.02;
  const bodyTop = upperY + upperH / 2;
  const cabinBaseY = bodyTop - 0.015;

  const paintEntries = [];
  paintEntries.push({ geo: new THREE.BoxGeometry(W, lowerH, L * 0.99).translate(0, lowerY, 0) });
  paintEntries.push({ geo: new THREE.BoxGeometry(W * 0.97, upperH, L * 0.95).translate(0, upperY, 0) });
  // hood + trunk plates
  paintEntries.push({ geo: new THREE.BoxGeometry(W * 0.9, 0.07, L * 0.26).translate(0, bodyTop + 0.02, L * 0.34) });
  paintEntries.push({ geo: new THREE.BoxGeometry(W * 0.9, 0.07, L * 0.22).translate(0, bodyTop + 0.02, -L * 0.38) });
  // side skirts
  paintEntries.push({ geo: new THREE.BoxGeometry(W + 0.02, 0.1, L * 0.64).translate(0, baseY + 0.06, 0) });
  // bumpers
  paintEntries.push({ geo: new THREE.BoxGeometry(W * 0.98, 0.24, 0.2).translate(0, lowerY + 0.06, L / 2 - 0.04) });
  paintEntries.push({ geo: new THREE.BoxGeometry(W * 0.98, 0.24, 0.2).translate(0, lowerY + 0.06, -L / 2 + 0.04) });
  // mirrors
  paintEntries.push({ geo: new THREE.BoxGeometry(0.2, 0.09, 0.26).translate(W / 2 + 0.06, cabinBaseY + 0.13, cabinZ + cabinBottom * 0.3) });
  paintEntries.push({ geo: new THREE.BoxGeometry(0.2, 0.09, 0.26).translate(-W / 2 - 0.06, cabinBaseY + 0.13, cabinZ + cabinBottom * 0.3) });
  // roof plate
  paintEntries.push({ geo: new THREE.BoxGeometry(W * 0.63, 0.06, cabinTop * 0.92).translate(0, cabinBaseY + cabinH + 0.03, cabinZ) });

  if (kind === 'sport') {
    // low rear wing
    paintEntries.push({ geo: new THREE.BoxGeometry(W * 0.82, 0.055, 0.34).translate(0, bodyTop + 0.2, -L / 2 + 0.3) });
    paintEntries.push({ geo: new THREE.BoxGeometry(0.07, 0.18, 0.12).translate(W * 0.32, bodyTop + 0.1, -L / 2 + 0.3) });
    paintEntries.push({ geo: new THREE.BoxGeometry(0.07, 0.18, 0.12).translate(-W * 0.32, bodyTop + 0.1, -L / 2 + 0.3) });
  }
  if (kind === 'van') {
    // tall cargo box silhouette
    paintEntries.push({ geo: new THREE.BoxGeometry(W * 0.96, cabinH * 0.9, cabinBottom * 0.92).translate(0, cabinBaseY + cabinH * 0.45, cabinZ - 0.25) });
  }

  const paintMesh = new THREE.Mesh(mergeLocal(paintEntries), paint);
  paintMesh.castShadow = true;
  paintMesh.receiveShadow = true;
  group.add(paintMesh);

  // tapered glass greenhouse (sloped windscreen + rear window)
  const cabin = new THREE.Mesh(
    taperedCabinGeometry(W * 0.84, W * 0.62, cabinBottom, cabinTop, cabinH)
      .translate(0, cabinBaseY, cabinZ),
    glassMat,
  );
  cabin.castShadow = true;
  group.add(cabin);

  // dark trim: grille, splitter, diffuser
  const darkEntries = [];
  darkEntries.push({ geo: new THREE.BoxGeometry(W * 0.48, 0.14, 0.08).translate(0, upperY + 0.03, L / 2 + 0.01) });
  darkEntries.push({ geo: new THREE.BoxGeometry(W * 0.92, 0.09, 0.3).translate(0, baseY + 0.04, L / 2 - 0.08) });
  darkEntries.push({ geo: new THREE.BoxGeometry(W * 0.88, 0.13, 0.22).translate(0, baseY + 0.08, -L / 2 + 0.04) });
  if (kind === 'sport') {
    darkEntries.push({ geo: new THREE.BoxGeometry(W * 0.26, 0.05, 0.42).translate(0, bodyTop + 0.055, L * 0.28) });
  }
  if (kind === 'police') {
    darkEntries.push({ geo: new THREE.BoxGeometry(W * 0.5, 0.28, L * 0.3).translate(0, upperY, -L * 0.1) });
  }

  if (opts.detailed) {
    // detailed wheels (can spin)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.3, 14), darkMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheel.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.58, wheelR * 0.58, 0.32, 10), chromeMat);
      rim.rotation.z = Math.PI / 2;
      wheel.add(rim);
      wheel.position.set(sx * (W / 2 + 0.01), wheelR, sz * (L * 0.31));
      group.add(wheel);
      wheels.push(wheel);
    }
  } else {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      darkEntries.push({
        geo: new THREE.CylinderGeometry(wheelR, wheelR, 0.3, 12)
          .rotateZ(Math.PI / 2)
          .translate(sx * (W / 2 + 0.01), wheelR, sz * (L * 0.31)),
      });
    }
  }
  group.add(new THREE.Mesh(mergeLocal(darkEntries), darkMat));

  // chrome exhaust tips
  const chromeEntries = [];
  for (const sx of [-1, 1]) {
    chromeEntries.push({
      geo: new THREE.CylinderGeometry(0.085, 0.085, 0.3, 8)
        .rotateX(Math.PI / 2)
        .translate(sx * W * 0.27, baseY + 0.1, -L / 2 - 0.06),
    });
  }
  group.add(new THREE.Mesh(mergeLocal(chromeEntries), chromeMat));

  // lights
  const lightEntries = [];
  const tailEntries = [];
  const zf = L / 2 + 0.03;
  const zb = -L / 2 - 0.03;
  for (const sx of [-1, 1]) {
    lightEntries.push({ geo: new THREE.BoxGeometry(0.46, 0.11, 0.07).translate(sx * W * 0.29, upperY + 0.03, zf) });
  }
  tailEntries.push({ geo: new THREE.BoxGeometry(W * 0.78, 0.1, 0.07).translate(0, upperY + 0.02, zb) });
  tailEntries.push({ geo: new THREE.BoxGeometry(W * 0.2, 0.07, 0.06).translate(0, upperY - 0.1, zb) });
  const headMesh = new THREE.Mesh(mergeLocal(lightEntries), headMat);
  group.add(headMesh);
  const tailMesh = new THREE.Mesh(mergeLocal(tailEntries), tailMat);
  group.add(tailMesh);

  // police light bar
  let lightbar = null;
  if (kind === 'police') {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(W * 0.55, 0.1, 0.28), darkMat);
    barBase.position.set(0, cabinBaseY + cabinH + 0.08, cabinZ);
    group.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(W * 0.24, 0.14, 0.24), redGlowMat.clone());
    red.position.set(-W * 0.14, cabinBaseY + cabinH + 0.16, cabinZ);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(W * 0.24, 0.14, 0.24), blueGlowMat.clone());
    blue.position.set(W * 0.14, cabinBaseY + cabinH + 0.16, cabinZ);
    group.add(red, blue);
    lightbar = { red, blue };
  }

  // nitro flames (player only)
  let flames = null;
  if (opts.detailed) {
    flames = new THREE.Group();
    for (const sx of [-1, 1]) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.1, 7), flameMat);
      flame.geometry.rotateX(-Math.PI / 2);
      flame.position.set(sx * W * 0.26, baseY + 0.1, -L / 2 - 0.5);
      flame.visible = false;
      flames.add(flame);
    }
    group.add(flames);
  }

  // underglow
  let underglow = null;
  if (opts.detailed) {
    const g = new THREE.PlaneGeometry(W * 1.7, L * 1.25);
    g.rotateX(-Math.PI / 2);
    underglow = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      map: underglowTex, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    underglow.position.y = 0.07;
    group.add(underglow);
  }

  // headlight beam
  let beam = null;
  if (opts.detailed) {
    beam = new THREE.SpotLight(0xffe6b0, 22, 55, 0.52, 0.45, 1.4);
    beam.position.set(0, upperY + 0.05, L / 2);
    beam.target.position.set(0, 0.2, L / 2 + 30);
    group.add(beam, beam.target);
  }

  return { group, wheels, lightbar, flames, underglow, beam, tailMesh, headMesh, dims, kind };
}

function taperedCabinGeometry(bw, tw, bl, tl, h) {
  const b = [
    [-bw / 2, 0, -bl / 2], [bw / 2, 0, -bl / 2],
    [bw / 2, 0, bl / 2], [-bw / 2, 0, bl / 2],
  ];
  const t = [
    [-tw / 2, h, -tl / 2], [tw / 2, h, -tl / 2],
    [tw / 2, h, tl / 2], [-tw / 2, h, tl / 2],
  ];
  const pos = [];
  const uv = [];
  const tri = (a, bb, c) => {
    for (const p of [a, bb, c]) {
      pos.push(p[0], p[1], p[2]);
      uv.push(p[0] * 0.3 + 0.5, p[1] * 0.5);
    }
  };
  // front (+z), rear (-z), right (+x), left (-x), top (+y)
  tri(b[3], b[2], t[2]); tri(b[3], t[2], t[3]);
  tri(b[1], b[0], t[0]); tri(b[1], t[0], t[1]);
  tri(b[2], b[1], t[1]); tri(b[2], t[1], t[2]);
  tri(b[0], b[3], t[3]); tri(b[0], t[3], t[0]);
  tri(t[0], t[2], t[1]); tri(t[0], t[3], t[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function mergeLocal(entries) {
  // tiny local merge (same implementation as util, avoids circular import concerns)
  const prepared = entries.map((e) => {
    const g = e.geo.index ? e.geo.toNonIndexed() : e.geo;
    return g;
  });
  let total = 0;
  for (const g of prepared) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), norm = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of prepared) {
    pos.set(g.attributes.position.array, o * 3);
    norm.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

/* ------------------------------------------------------------------ */
/* Player vehicle physics                                             */
/* ------------------------------------------------------------------ */
export class Vehicle {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.kind = opts.kind || 'sport';
    this.color = opts.color ?? 0xff5a1f;
    this.maxSpeed = opts.maxSpeed || (this.kind === 'sport' ? 54 : 46);
    this.accel = opts.accel || (this.kind === 'sport' ? 17 : 13);
    this.radius = 1.55;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.lateral = 0;
    this.nitro = 100;
    this.boosting = false;
    this.lastImpact = 0;
    this.collision = null;
    this.wheelSpin = 0;
    this.surface = 'road';
    this.mesh = null;
    this._build();
  }

  _build() {
    if (this.mesh) {
      this.scene.remove(this.mesh.group);
    }
    const built = buildCarMesh({
      kind: this.kind, color: this.color, detailed: true,
    });
    this.mesh = built;
    this.scene.add(built.group);
    this.mesh.group.position.copy(this.pos);
    this.mesh.group.rotation.y = this.heading;
  }

  setLook(kind, color) {
    this.kind = kind;
    this.color = color;
    const keepPos = this.pos.clone();
    const keepHeading = this.heading;
    const keepVel = this.vel.clone();
    this._build();
    this.pos.copy(keepPos);
    this.heading = keepHeading;
    this.vel.copy(keepVel);
    this.maxSpeed = kind === 'sport' ? 54 : kind === 'van' ? 42 : kind === 'suv' ? 45 : 48;
    this.accel = kind === 'sport' ? 17 : kind === 'van' ? 11 : 14;
  }

  reset(x, z, heading = 0) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.speed = 0;
    this.lateral = 0;
    this.nitro = 100;
    this.collision = null;
    this.lastImpact = 0;
    this._syncMesh(0);
  }

  update(dt, input, world, time) {
    const throttle = input.throttle || 0;
    const steer = input.steer || 0;
    const handbrake = !!input.handbrake;
    this.surface = world.surfaceAt(this.pos.x, this.pos.z);
    const offRoad = this.surface !== 'road';
    const sand = this.surface === 'sand';

    let fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    let right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    let vF = this.vel.dot(fwd);
    let vR = this.vel.dot(right);

    const maxSpeed = (this.maxSpeed + (this.boosting ? 17 : 0)) * (sand ? 0.5 : offRoad ? 0.82 : 1);
    const accel = this.accel * (sand ? 0.55 : offRoad ? 0.8 : 1);

    // nitro
    const wantBoost = !!input.nitro && throttle > 0.2;
    if (wantBoost && this.nitro > 0.5) {
      this.boosting = true;
      this.nitro = Math.max(0, this.nitro - 30 * dt);
    } else {
      this.boosting = false;
      this.nitro = Math.min(100, this.nitro + (throttle > 0 ? 5.5 : 9) * dt);
    }

    // engine / brakes
    if (throttle > 0.01) {
      if (vF < -0.5) {
        vF = Math.min(0, vF + 30 * dt * throttle);
      } else {
        const headroom = clamp(1 - vF / maxSpeed, 0, 1);
        vF += accel * (0.35 + headroom * 0.9) * throttle * dt * (this.boosting ? 1.7 : 1);
      }
    } else if (throttle < -0.01) {
      if (vF > 0.5) {
        vF = Math.max(0, vF - 32 * dt * -throttle);
      } else {
        vF = Math.max(-13, vF - 8 * dt * -throttle);
      }
    } else {
      vF -= Math.sign(vF) * Math.min(Math.abs(vF), 2.6 * dt);
    }

    // drag
    vF *= Math.exp(-(offRoad ? 0.22 : 0.08) * dt);
    vF = clamp(vF, -14, maxSpeed);

    // handbrake
    if (handbrake) vF *= Math.exp(-0.9 * dt);

    // steering
    const speedRatio = clamp(Math.abs(vF) / 5, 0, 1);
    const highSpeedDamp = 1 - clamp(Math.abs(vF) / this.maxSpeed, 0, 1) * 0.4;
    const dir = vF >= 0 ? 1 : -1;
    const steerRate = (this.kind === 'van' ? 1.5 : 2.05) * highSpeedDamp;
    this.heading += steer * steerRate * speedRatio * dir * dt;

    // lateral grip (low grip while drifting / on sand)
    let grip = handbrake ? 1.5 : this.surface === 'sand' ? 3.5 : offRoad ? 6 : 9.2;
    if (this.boosting) grip *= 0.85;
    vR *= Math.exp(-grip * dt);

    // recompute basis after heading change
    fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    this.vel.copy(fwd).multiplyScalar(vF).addScaledVector(right, vR);

    this.pos.addScaledVector(this.vel, dt);

    // world collision
    this.collision = null;
    const hit = world.resolveCircle(this.pos, this.radius);
    if (hit) {
      const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
      const impact = Math.max(0, -vn);
      if (vn < 0) {
        this.vel.x -= (1 + 0.25) * vn * hit.nx;
        this.vel.z -= (1 + 0.25) * vn * hit.nz;
      }
      if (impact > 1.2) {
        this.collision = { impact, nx: hit.nx, nz: hit.nz };
        this.lastImpact = impact;
      }
      vF = this.vel.dot(fwd);
      vR = this.vel.dot(right);
    }

    this.speed = vF;
    this.lateral = vR;
    this._syncMesh(dt, steer, throttle, time);
  }

  _syncMesh(dt, steer = 0, throttle = 0, time = 0) {
    const g = this.mesh.group;
    const targetY = this.surface === 'sand' ? -0.28 : this.surface === 'road' ? 0 : 0.14;
    g.position.x = this.pos.x;
    g.position.z = this.pos.z;
    g.position.y = damp(g.position.y, targetY, 14, Math.max(dt, 0.016));
    g.rotation.y = this.heading;
    const speedRatio = clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1);
    const drift = clamp(Math.abs(this.lateral) / 10, 0, 1);
    g.rotation.z = damp(g.rotation.z, -steer * speedRatio * 0.055 - this.lateral * 0.004, 8, dt || 0.016);
    g.rotation.x = damp(g.rotation.x, (throttle > 0 ? -0.008 : throttle < 0 ? 0.012 : 0) * speedRatio, 6, dt || 0.016);

    if (this.mesh.wheels.length) {
      this.wheelSpin += this.speed * (dt || 0) / 0.38;
      for (const w of this.mesh.wheels) w.rotation.x = this.wheelSpin;
    }
    if (this.mesh.flames) {
      const on = this.boosting && Math.abs(this.speed) > 4;
      for (const f of this.mesh.flames.children) {
        f.visible = on;
        if (on) {
          f.scale.z = 0.8 + Math.random() * 0.9;
          f.scale.x = f.scale.y = 0.8 + Math.random() * 0.4;
        }
      }
      if (this.mesh.underglow) this.mesh.underglow.material.opacity = on ? 0.8 : 0.4;
    }
    if (this.mesh.beam) this.mesh.beam.intensity = 12 + Math.sin(time * 40) * 0.4;
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  get kmh() { return Math.abs(this.speed) * 3.6; }
  get driftFactor() { return clamp((Math.abs(this.lateral) - 1.4) / 8, 0, 1); }
}

/* ------------------------------------------------------------------ */
/* On-foot character                                                  */
/* ------------------------------------------------------------------ */
export function buildCharacter() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 0.8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0xff6a2a, roughness: 0.65 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x222833, roughness: 0.9 });
  const shoes = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.8 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x151a24, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.68, 0.32), jacket);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.3), pants);
  hips.position.y = 0.76;
  group.add(hips);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 10), skin);
  head.position.y = 1.64;
  head.castShadow = true;
  group.add(head);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), capMat);
  cap.position.y = 1.67;
  group.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22), capMat);
  brim.position.set(0, 1.68, 0.17);
  group.add(brim);

  const limb = (w, h, d, mat, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };
  const armL = limb(0.15, 0.62, 0.17, jacket, -0.35, 1.42);
  const armR = limb(0.15, 0.62, 0.17, jacket, 0.35, 1.42);
  const legL = limb(0.18, 0.68, 0.2, pants, -0.14, 0.74);
  const legR = limb(0.18, 0.68, 0.2, pants, 0.14, 0.74);
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.1, 0.3), shoes);
  shoeL.position.set(0, -0.72, 0.05);
  legL.add(shoeL);
  const shoeR = shoeL.clone();
  legR.add(shoeR);

  return { group, armL, armR, legL, legR };
}

export class Character {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.walkPhase = 0;
    this.radius = 0.5;
    this.mesh = buildCharacter();
    scene.add(this.mesh.group);
    this.mesh.group.visible = false;
  }

  reset(x, z, heading = 0) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.mesh.group.visible = true;
    this.sync(0);
  }

  hide() { this.mesh.group.visible = false; }

  update(dt, input, world) {
    const throttle = input.throttle || 0;
    const steer = input.steer || 0;
    const run = !!input.nitro;
    const target = throttle > 0.05 ? (run ? 7.6 : 4.6) * throttle : throttle < -0.05 ? 2.2 * throttle : 0;
    this.speed = damp(this.speed, target, 9, dt);
    if (Math.abs(this.speed) > 0.05) {
      this.heading += steer * 2.9 * dt * Math.sign(this.speed) * clamp(Math.abs(this.speed) / 2, 0.35, 1);
    }
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.pos.addScaledVector(fwd, this.speed * dt);
    world.resolveCircle(this.pos, this.radius);
    this.sync(dt);
  }

  sync(dt) {
    const g = this.mesh.group;
    g.position.set(this.pos.x, 0.14, this.pos.z);
    g.rotation.y = this.heading;
    const moving = Math.abs(this.speed);
    this.walkPhase += dt * (2.5 + moving * 1.6);
    const swing = Math.sin(this.walkPhase * 3.4) * clamp(moving / 4, 0, 1) * 0.7;
    this.mesh.legL.rotation.x = swing;
    this.mesh.legR.rotation.x = -swing;
    this.mesh.armL.rotation.x = -swing * 0.8;
    this.mesh.armR.rotation.x = swing * 0.8;
    g.position.y = 0.14 + Math.abs(Math.sin(this.walkPhase * 3.4)) * 0.03 * clamp(moving / 4, 0, 1);
  }
}

export { CAR_COLORS, paintMat, glassMat, darkMat };
