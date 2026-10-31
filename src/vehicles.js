import * as THREE from 'three';
import {
  clamp, damp, boxPart, cylPart, mergeGeoms, makeGlowTexture,
} from './utils.js';

const glowTex = makeGlowTexture();

/* ------------------------------------------------------------------ */
/*  Car meshes                                                        */
/* ------------------------------------------------------------------ */
function makePoliceDecal() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = '#e9edf4';
  g.fillRect(0, 12, 512, 104);
  g.fillStyle = '#11131a';
  g.font = 'bold 66px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('POLICE', 256, 66);
  g.fillStyle = '#2b6cff';
  g.fillRect(0, 12, 512, 12);
  g.fillStyle = '#ff2d4a';
  g.fillRect(0, 104, 512, 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
let policeDecalTex = null;

export function createCarMesh({ color = 0x22d6c2, kind = 'traffic', accent = 0xffffff } = {}) {
  const parts = [];
  const lightParts = [];
  const group = new THREE.Group();
  const bodyColor = new THREE.Color(color);
  const dark = new THREE.Color(0x0d0e14);
  const glass = new THREE.Color(0x101a26);

  // main shell
  boxPart(parts, 1.92, 0.5, 4.35, 0, 0.66, 0, bodyColor);
  boxPart(parts, 1.84, 0.26, 3.95, 0, 0.43, 0, bodyColor.clone().multiplyScalar(0.62));
  boxPart(parts, 1.8, 0.18, 1.32, 0, 0.92, -1.48, bodyColor.clone().multiplyScalar(0.9));
  boxPart(parts, 1.8, 0.2, 0.95, 0, 0.92, 1.62, bodyColor.clone().multiplyScalar(0.9));
  boxPart(parts, 1.56, 0.56, 1.86, 0, 1.2, 0.2, glass);
  boxPart(parts, 1.46, 0.1, 1.66, 0, 1.5, 0.22, kind === 'police' ? 0xdde3ee : bodyColor.clone().multiplyScalar(0.82));

  // pillars
  boxPart(parts, 0.09, 0.5, 0.1, -0.74, 1.2, -0.65, bodyColor.clone().multiplyScalar(0.7));
  boxPart(parts, 0.09, 0.5, 0.1, 0.74, 1.2, -0.65, bodyColor.clone().multiplyScalar(0.7));
  boxPart(parts, 0.09, 0.5, 0.1, -0.74, 1.2, 1.05, bodyColor.clone().multiplyScalar(0.7));
  boxPart(parts, 0.09, 0.5, 0.1, 0.74, 1.2, 1.05, bodyColor.clone().multiplyScalar(0.7));

  // bumpers & skirts
  boxPart(parts, 1.94, 0.24, 0.22, 0, 0.55, -2.22, dark);
  boxPart(parts, 1.94, 0.24, 0.22, 0, 0.55, 2.22, dark);
  boxPart(parts, 0.1, 0.16, 2.8, -0.97, 0.4, 0, dark);
  boxPart(parts, 0.1, 0.16, 2.8, 0.97, 0.4, 0, dark);

  // mirrors
  boxPart(parts, 0.2, 0.13, 0.3, -1.02, 1.22, -0.6, bodyColor.clone().multiplyScalar(0.85));
  boxPart(parts, 0.2, 0.13, 0.3, 1.02, 1.22, -0.6, bodyColor.clone().multiplyScalar(0.85));

  // wheels
  for (const [x, z] of [[-0.94, -1.38], [0.94, -1.38], [-0.94, 1.38], [0.94, 1.38]]) {
    cylPart(parts, 0.38, 0.38, 0.3, 12, x, 0.4, z, 0x0a0b10, 0, 0, Math.PI / 2);
    cylPart(parts, 0.2, 0.2, 0.33, 8, x, 0.4, z, 0x8b93a6, 0, 0, Math.PI / 2);
  }

  // spoiler
  if (kind === 'player' || kind === 'police') {
    boxPart(parts, 1.72, 0.07, 0.36, 0, 1.2, 2.16, dark);
    boxPart(parts, 0.08, 0.24, 0.22, -0.62, 1.06, 2.12, dark);
    boxPart(parts, 0.08, 0.24, 0.22, 0.62, 1.06, 2.12, dark);
  }

  // racing stripe
  if (kind === 'player') {
    boxPart(parts, 0.28, 0.02, 1.3, 0, 1.03, -1.48, accent);
    boxPart(parts, 0.28, 0.02, 0.92, 0, 1.03, 1.62, accent);
  }

  // police light bar base
  if (kind === 'police') {
    boxPart(parts, 1.24, 0.12, 0.34, 0, 1.6, 0.2, 0x14151d);
    // white door panel under the decal is drawn on the decal plane
  }

  // headlights
  for (const x of [-0.62, 0.62]) {
    const g = new THREE.BoxGeometry(0.46, 0.16, 0.1);
    g.translate(x, 0.82, -2.2);
    setColor(g, 0xfff2c8);
    lightParts.push(g);
  }
  // taillights
  for (const x of [-0.66, 0.66]) {
    const g = new THREE.BoxGeometry(0.42, 0.14, 0.09);
    g.translate(x, 0.84, 2.22);
    setColor(g, 0xff2438);
    lightParts.push(g);
  }
  // side markers
  for (const x of [-1.01, 1.01]) {
    const g = new THREE.BoxGeometry(0.05, 0.1, 0.22);
    g.translate(x, 0.78, -1.9);
    setColor(g, 0xffc06a);
    lightParts.push(g);
  }

  const bodyMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.34, metalness: 0.42,
    emissive: bodyColor.clone().multiplyScalar(kind === 'player' ? 0.11 : 0.035),
    emissiveIntensity: kind === 'player' ? 0.85 : 0.75,
  });
  const bodyMesh = new THREE.Mesh(mergeGeoms(parts), bodyMat);
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const lightMesh = new THREE.Mesh(mergeGeoms(lightParts), lightMat);

  group.add(bodyMesh, lightMesh);

  // headlight bloom sprites
  const headGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffe9b8, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (const x of [-0.62, 0.62]) {
    const s = new THREE.Sprite(headGlowMat);
    s.position.set(x, 0.82, -2.28);
    s.scale.set(2.4, 2.4, 1);
    group.add(s);
  }
  const tailGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff2438, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  tailGlow.position.set(0, 0.84, 2.34);
  tailGlow.scale.set(2.6, 1.4, 1);
  group.add(tailGlow);

  let sirenRed = null;
  let sirenBlue = null;
  let sirenGlow = null;
  let doorDecals = [];
  if (kind === 'police') {
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2038, toneMapped: false });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2b6cff, toneMapped: false });
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.26), redMat);
    r.position.set(-0.32, 1.72, 0.2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.26), blueMat);
    b.position.set(0.32, 1.72, 0.2);
    sirenRed = r;
    sirenBlue = b;
    sirenGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xff2038, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sirenGlow.position.set(0, 1.85, 0.2);
    sirenGlow.scale.set(5.5, 4.5, 1);
    group.add(r, b, sirenGlow);

    if (!policeDecalTex) policeDecalTex = makePoliceDecal();
    const decalMat = new THREE.MeshBasicMaterial({ map: policeDecalTex, transparent: true, toneMapped: false });
    for (const side of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 0.59), decalMat);
      d.position.set(side * 0.972, 0.83, 0.02);
      d.rotation.y = side * Math.PI / 2;
      group.add(d);
      doorDecals.push(d);
    }
  }

  group.traverse((o) => {
    if (o.isMesh) o.frustumCulled = true;
  });

  return { group, bodyMesh, lightMesh, sirenRed, sirenBlue, sirenGlow, tailGlow, doorDecals };
}

function setColor(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/* ------------------------------------------------------------------ */
/*  Arcade car physics                                                */
/* ------------------------------------------------------------------ */
export class CarBody {
  constructor(opts = {}) {
    this.pos = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
    this.vel = new THREE.Vector3();
    this.heading = opts.heading || 0;
    this.steer = 0;
    this.maxSpeed = opts.maxSpeed || 40;
    this.reverseMax = opts.reverseMax || 11;
    this.accel = opts.accel || 24;
    this.brakePower = opts.brakePower || 44;
    this.turnRate = opts.turnRate || 2.15;
    this.grip = opts.grip || 7.2;
    this.radius = opts.radius || 1.42;
    this.mass = opts.mass || 1;
    this.speed = 0;
    this.roll = 0;
    this.pitch = 0;
    this.slip = 0;
    this.wheelAngle = 0;
    this.impact = 0;
    this.stuckTime = 0;
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  get right() {
    return new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6;
  }

  update(dt, input, opts = {}) {
    const throttle = clamp(input.throttle || 0, -1, 1);
    const steerIn = clamp(input.steer || 0, -1, 1);
    const handbrake = Boolean(input.handbrake);
    const boost = Boolean(input.boost);
    const maxSpeed = boost ? this.maxSpeed * 1.32 : this.maxSpeed;
    const accel = this.accel * (boost ? 1.45 : 1);

    this.steer = damp(this.steer, steerIn, handbrake ? 12 : 9, dt);

    // engine / brakes act on forward component
    let fwd = this.forward;
    let right = this.right;
    let vf = this.vel.dot(fwd);
    let vl = this.vel.dot(right);

    if (throttle > 0) {
      const falloff = 1 - clamp(vf / maxSpeed, 0, 1) * 0.72;
      vf += accel * throttle * falloff * dt;
    } else if (throttle < 0) {
      if (vf > 0.6) {
        vf -= this.brakePower * -throttle * dt;
      } else {
        const falloff = 1 - clamp(-vf / this.reverseMax, 0, 1) * 0.7;
        vf -= this.accel * 0.55 * -throttle * falloff * dt;
      }
    }

    // rolling resistance + aero drag
    vf *= Math.exp(-(handbrake ? 1.6 : 0.32) * dt);
    if (Math.abs(vf) < 0.18 && throttle === 0) vf = 0;

    // steering
    const speedFactor = clamp(Math.abs(vf) / 9, 0, 1);
    const turnScale = 1 - clamp(Math.abs(vf) / 70, 0, 0.55);
    const dir = vf < -0.2 ? -1 : 1;
    this.heading += this.steer * this.turnRate * speedFactor * turnScale * dir * dt;

    // lateral grip (handbrake lets the rear slide)
    const grip = handbrake ? 1.15 : this.grip;
    vl *= Math.exp(-grip * dt);
    this.slip = Math.abs(vl);

    // clamp speed
    const maxF = maxSpeed;
    if (vf > maxF) vf = maxF;
    if (vf < -this.reverseMax) vf = -this.reverseMax;

    fwd = this.forward;
    right = this.right;
    this.vel.copy(fwd).multiplyScalar(vf).addScaledVector(right, vl);
    this.pos.addScaledVector(this.vel, dt);
    this.speed = vf;

    // body attitude
    const lateral = vl;
    this.roll = damp(this.roll, clamp(-this.steer * speedFactor * 0.11 + lateral * 0.008, -0.14, 0.14), 7, dt);
    this.pitch = damp(this.pitch, clamp((throttle < 0 ? 0.05 : -throttle * 0.025) + (boost ? -0.02 : 0), -0.08, 0.08), 5, dt);
    this.wheelAngle += this.speed * dt * 2.2;
  }

  applyVisual(group, bodyMesh) {
    group.position.set(this.pos.x, 0, this.pos.z);
    group.rotation.y = this.heading;
    bodyMesh.rotation.z = this.roll;
    bodyMesh.rotation.x = this.pitch;
  }
}

/* ------------------------------------------------------------------ */
/*  Collision with the city                                           */
/* ------------------------------------------------------------------ */
export function collideWithWorld(car, colliders, bounds = 224) {
  let impact = 0;
  const p = car.pos;
  const r = car.radius;

  for (let iter = 0; iter < 2; iter++) {
    for (const c of colliders) {
      if (p.x + r < c.minX || p.x - r > c.maxX || p.z + r < c.minZ || p.z - r > c.maxZ) continue;
      const cx = clamp(p.x, c.minX, c.maxX);
      const cz = clamp(p.z, c.minZ, c.maxZ);
      let dx = p.x - cx;
      let dz = p.z - cz;
      let d2 = dx * dx + dz * dz;
      let nx, nz, push;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        if (d >= r) continue;
        nx = dx / d; nz = dz / d;
        push = r - d;
      } else {
        // centre inside the box: push out along the shortest axis
        const left = p.x - c.minX;
        const rightD = c.maxX - p.x;
        const back = p.z - c.minZ;
        const front = c.maxZ - p.z;
        const m = Math.min(left, rightD, back, front);
        nx = 0; nz = 0;
        if (m === left) { nx = -1; push = left + r; }
        else if (m === rightD) { nx = 1; push = rightD + r; }
        else if (m === back) { nz = -1; push = back + r; }
        else { nz = 1; push = front + r; }
      }
      p.x += nx * push;
      p.z += nz * push;
      const into = -(car.vel.x * nx + car.vel.z * nz);
      if (into > 0) {
        impact = Math.max(impact, into);
        car.vel.x += nx * into * 1.35;
        car.vel.z += nz * into * 1.35;
        car.vel.multiplyScalar(0.72);
      }
    }
  }

  // city limits
  if (p.x < -bounds) { p.x = -bounds; if (car.vel.x < 0) { impact = Math.max(impact, -car.vel.x); car.vel.x *= -0.4; } }
  if (p.x > bounds) { p.x = bounds; if (car.vel.x > 0) { impact = Math.max(impact, car.vel.x); car.vel.x *= -0.4; } }
  if (p.z < -bounds) { p.z = -bounds; if (car.vel.z < 0) { impact = Math.max(impact, -car.vel.z); car.vel.z *= -0.4; } }
  if (p.z > bounds) { p.z = bounds; if (car.vel.z > 0) { impact = Math.max(impact, car.vel.z); car.vel.z *= -0.4; } }

  car.impact = impact;
  return impact;
}

/* ------------------------------------------------------------------ */
/*  Simple collision between two cars                                 */
/* ------------------------------------------------------------------ */
export function collideCars(a, b) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  const min = a.radius + b.radius;
  if (dist > min || dist < 1e-5) return 0;
  const nx = dx / dist;
  const nz = dz / dist;
  const overlap = min - dist;
  a.pos.x -= nx * overlap * 0.5;
  a.pos.z -= nz * overlap * 0.5;
  b.pos.x += nx * overlap * 0.5;
  b.pos.z += nz * overlap * 0.5;

  const rvx = a.vel.x - b.vel.x;
  const rvz = a.vel.z - b.vel.z;
  const sep = rvx * nx + rvz * nz;
  if (sep > 0) {
    const j = sep * 0.85;
    a.vel.x -= nx * j * 0.6;
    a.vel.z -= nz * j * 0.6;
    b.vel.x += nx * j * 0.9;
    b.vel.z += nz * j * 0.9;
  }
  return Math.max(0, -sep);
}

/* ------------------------------------------------------------------ */
/*  Vehicle factory                                                   */
/* ------------------------------------------------------------------ */
export function spawnCarMesh(scene, opts) {
  const mesh = createCarMesh(opts);
  scene.add(mesh.group);
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Cop / traffic AI steering helpers                                 */
/* ------------------------------------------------------------------ */
export function steeringTo(car, target, dt, aggressiveness = 1) {
  const dx = target.x - car.pos.x;
  const dz = target.z - car.pos.z;
  const desired = Math.atan2(-dx, -dz);
  let diff = ((desired - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return clamp(diff * 2.2, -1, 1) * aggressiveness;
}

export function predictPosition(car, seconds) {
  return car.pos.clone().addScaledVector(car.vel, seconds);
}

export { glowTex };
