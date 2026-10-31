import * as THREE from '../vendor/three.module.js';
import { Rand, clamp, damp, dampAngle, dist2, mergeGeometries } from './util.js';
import { buildCarMesh, CAR_COLORS, paintMat } from './vehicles.js';
import { ROAD_COORDS } from './world.js';

const PED_COLORS = [0xff6b5e, 0x4dd0e1, 0xffd166, 0x8bd17c, 0xc792ea, 0xf5f5f5, 0x5c8dff];

/* ------------------------------------------------------------------ */
/* Traffic                                                            */
/* ------------------------------------------------------------------ */
export class TrafficSystem {
  constructor(scene, world, count = 24, seed = 9182) {
    this.scene = scene;
    this.world = world;
    this.rand = new Rand(seed);
    this.cars = [];
    const kinds = ['sedan', 'sedan', 'sedan', 'suv', 'van', 'sport'];

    for (let i = 0; i < count; i++) {
      const axis = this.rand.chance(0.5) ? 'x' : 'z';
      const road = this.rand.pick(ROAD_COORDS);
      const dir = this.rand.sign();
      const kind = this.rand.pick(kinds);
      const color = this.rand.pick(CAR_COLORS);
      const mesh = buildCarMesh({ kind, color, detailed: false });
      mesh.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(mesh.group);
      const car = {
        mesh, kind, color, axis, road, dir,
        t: this.rand.range(-190, 190),
        offset: this.rand.range(3.2, 5),
        speed: this.rand.range(7, 14),
        cruise: this.rand.range(7, 14),
        stun: 0,
        knock: new THREE.Vector3(),
        pos: new THREE.Vector3(),
        heading: 0,
        radius: 1.8,
      };
      this.cars.push(car);
      this._place(car);
    }

    // seed a few cars in view of the spawn so the streets feel alive immediately
    const seeds = [
      { t: 38, dir: 1 }, { t: 58, dir: -1 }, { t: 92, dir: 1 },
      { t: -42, dir: 1 }, { t: -72, dir: -1 }, { t: 118, dir: -1 },
    ];
    for (let i = 0; i < Math.min(seeds.length, this.cars.length); i++) {
      const car = this.cars[i];
      car.axis = 'z';
      car.road = 0;
      car.dir = seeds[i].dir;
      car.t = seeds[i].t;
      car.speed = car.cruise;
      this._place(car);
    }
  }

  _place(car) {
    const lane = car.dir * car.offset;
    if (car.axis === 'x') {
      car.pos.set(car.t, 0, car.road + lane);
      car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.pos.set(car.road - lane, 0, car.t);
      car.heading = car.dir > 0 ? 0 : Math.PI;
    }
    car.mesh.group.position.copy(car.pos);
    car.mesh.group.rotation.y = car.heading;
  }

  update(dt, player, time) {
    for (const car of this.cars) {
      car.stun = Math.max(0, car.stun - dt);
      const lane = car.dir * car.offset;

      // simple "don't run into the player" braking
      const fwdX = Math.sin(car.heading);
      const fwdZ = Math.cos(car.heading);
      const toPlayerX = player.pos.x - car.pos.x;
      const toPlayerZ = player.pos.z - car.pos.z;
      const ahead = toPlayerX * fwdX + toPlayerZ * fwdZ;
      const side = Math.abs(toPlayerX * fwdZ - toPlayerZ * fwdX);
      const blocked = ahead > 0 && ahead < 12 && side < 3.2;
      const targetSpeed = blocked ? Math.max(0, (ahead - 5) * 1.2) : car.cruise;

      if (car.stun <= 0) {
        car.speed = damp(car.speed, targetSpeed, 2.4, dt);
        car.t += car.dir * car.speed * dt;
        if (car.t > 202) car.t = -202;
        if (car.t < -202) car.t = 202;
        if (car.axis === 'x') {
          car.pos.set(car.t, 0, car.road + lane);
        } else {
          car.pos.set(car.road - lane, 0, car.t);
        }
      } else {
        // knocked around after a collision
        car.pos.addScaledVector(car.knock, dt);
        car.knock.multiplyScalar(Math.exp(-2.5 * dt));
        car.pos.x += Math.sin(time * 9 + car.t) * 0.02;
        car.pos.z += Math.cos(time * 11 + car.t) * 0.02;
        this.world.resolveCircle(car.pos, 1.6);
      }

      car.mesh.group.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.group.rotation.y = car.heading;
      car.mesh.group.rotation.z = car.stun > 0 ? Math.sin(time * 20) * 0.05 : 0;
    }
  }

  knock(car, nx, nz, force) {
    car.stun = 1.3;
    car.knock.set(nx * force, 0, nz * force);
    car.speed = 0;
  }

  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.mesh.group);
  }

  respawnFarFrom(player) {
    for (const car of this.cars) {
      if (dist2(car.pos.x, car.pos.z, player.pos.x, player.pos.z) < 55) {
        car.t = this.rand.range(-190, 190);
        if (car.axis === 'x') car.road = this.rand.pick(ROAD_COORDS);
        else car.road = this.rand.pick(ROAD_COORDS);
        this._place(car);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Pedestrians (instanced)                                            */
/* ------------------------------------------------------------------ */
function pedestrianGeometry() {
  const entries = [];
  const box = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    entries.push({ geo: g });
  };
  box(0.42, 0.62, 0.26, 0, 1.06, 0);
  box(0.22, 0.24, 0.24, 0, 1.55, 0);
  box(0.15, 0.62, 0.18, -0.11, 0.34, 0);
  box(0.15, 0.62, 0.18, 0.11, 0.34, 0);
  box(0.12, 0.52, 0.14, -0.28, 1.06, 0);
  box(0.12, 0.52, 0.14, 0.28, 1.06, 0);
  return mergeGeometries(entries);
}

export class PedestrianSystem {
  constructor(scene, world, count = 26, seed = 4451) {
    this.world = world;
    this.rand = new Rand(seed);
    this.peds = [];
    const geo = pedestrianGeometry();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const p = {
        pos: new THREE.Vector3(),
        target: new THREE.Vector3(),
        heading: 0,
        speed: 0,
        phase: this.rand.range(0, 10),
        scared: 0,
        down: 0,
      };
      this._newTarget(p);
      p.pos.set(p.target.x, 0, p.target.z);
      this._newTarget(p);
      color.setHex(this.rand.pick(PED_COLORS));
      this.mesh.setColorAt(i, color);
      this.peds.push(p);
    }
    this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  _newTarget(p) {
    const pt = this.world.randomSidewalkPoint(this.rand);
    p.target.set(pt.x, 0, pt.z);
  }

  update(dt, player, time) {
    const m = this._m, q = this._q, s = this._s;
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      const d = dist2(p.pos.x, p.pos.z, player.pos.x, player.pos.z);
      p.scared = Math.max(0, p.scared - dt);
      if (d < 11 && Math.abs(player.speed || 0) > 3) p.scared = 2.2;
      if (p.down > 0) {
        p.down -= dt;
        m.makeTranslation(p.pos.x, 0.2, p.pos.z);
        m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
        this.mesh.setMatrixAt(i, m);
        continue;
      }
      if (p.scared > 0) {
        const away = new THREE.Vector3(p.pos.x - player.pos.x, 0, p.pos.z - player.pos.z).normalize();
        p.target.set(
          clamp(p.pos.x + away.x * 26, -220, 220), 0,
          clamp(p.pos.z + away.z * 26, -220, 220),
        );
      }
      const dx = p.target.x - p.pos.x;
      const dz = p.target.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2) this._newTarget(p);
      const desired = Math.atan2(dx, dz);
      p.heading = dampAngle(p.heading, desired, 6, dt);
      const targetSpeed = p.scared > 0 ? 5.2 : 1.35;
      p.speed = damp(p.speed, targetSpeed, 5, dt);
      p.pos.x += Math.sin(p.heading) * p.speed * dt;
      p.pos.z += Math.cos(p.heading) * p.speed * dt;
      if (p.scared <= 0) this.world.resolveCircle(p.pos, 0.4);
      p.phase += dt * (2 + p.speed * 2.2);
      const bob = Math.abs(Math.sin(p.phase * 3)) * 0.05 * clamp(p.speed, 0, 1.5);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading);
      m.compose(new THREE.Vector3(p.pos.x, 0.14 + bob, p.pos.z), q, s);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  hit(ped) {
    ped.down = 3.5;
    ped.scared = 0;
  }
}

/* ------------------------------------------------------------------ */
/* Police                                                             */
/* ------------------------------------------------------------------ */
export class PoliceSystem {
  constructor(scene, world, seed = 777) {
    this.scene = scene;
    this.world = world;
    this.rand = new Rand(seed);
    this.cars = [];
    this.spawnTimer = 0;
    this.flash = 0;
  }

  _spawn(player, wanted) {
    const angle = this.rand.range(0, Math.PI * 2);
    const dist = this.rand.range(70, 105);
    let x = player.pos.x + Math.cos(angle) * dist;
    let z = player.pos.z + Math.sin(angle) * dist;
    x = clamp(x, -200, 200);
    z = clamp(z, -200, 200);
    // snap to nearest road for a clean approach
    const rx = ROAD_COORDS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    const rz = ROAD_COORDS.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
    if (Math.abs(rx - x) < Math.abs(rz - z)) x = rx + this.rand.sign() * 4;
    else z = rz + this.rand.sign() * 4;

    const mesh = buildCarMesh({ kind: 'police', color: 0xf2f0e8, detailed: false });
    mesh.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(mesh.group);
    const cop = {
      mesh,
      pos: new THREE.Vector3(x, 0, z),
      heading: Math.atan2(player.pos.x - x, player.pos.z - z),
      speed: 0,
      hp: 120,
      shootTimer: this.rand.range(1.5, 3),
      stuck: 0,
      radius: 1.9,
      active: true,
      spawnAnim: 0.6,
    };
    this.cars.push(cop);
    mesh.group.position.copy(cop.pos);
    return cop;
  }

  update(dt, player, wanted, time, callbacks) {
    this.flash += dt;
    const maxCops = Math.min(7, Math.floor(wanted * 1.6));
    const alive = this.cars.filter((c) => c.active);
    this.spawnTimer -= dt;
    if (alive.length < maxCops && this.spawnTimer <= 0) {
      this._spawn(player, wanted);
      this.spawnTimer = 1.4;
    }

    for (const cop of this.cars) {
      if (!cop.active) continue;
      cop.spawnAnim = Math.max(0, cop.spawnAnim - dt);
      const dx = player.pos.x - cop.pos.x;
      const dz = player.pos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);

      // flashing lights
      const phase = Math.sin(time * 12 + cop.pos.x) > 0;
      if (cop.mesh.lightbar) {
        cop.mesh.lightbar.red.material.color.setHex(phase ? 0xff2038 : 0x3a0008);
        cop.mesh.lightbar.blue.material.color.setHex(phase ? 0x0a1a4a : 0x2f7bff);
      }

      if (dist > 3) {
        const desired = Math.atan2(dx, dz);
        const turn = dampAngle(cop.heading, desired, 2.6, dt);
        cop.heading = turn;
      }
      const targetSpeed = dist > 18 ? 34 : dist > 8 ? 20 : 8;
      cop.speed = damp(cop.speed, targetSpeed, 1.9, dt);
      cop.pos.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.pos.z += Math.cos(cop.heading) * cop.speed * dt;
      const hit = this.world.resolveCircle(cop.pos, cop.radius);
      if (hit) {
        cop.speed *= 0.55;
        cop.stuck = 0.8;
        // slide around corners
        cop.heading += Math.sign(Math.sin(cop.heading) * hit.nx + Math.cos(cop.heading) * hit.nz) * 0.9 * dt;
      }
      cop.pos.x = clamp(cop.pos.x, -228, 228);
      cop.pos.z = clamp(cop.pos.z, -228, 228);

      cop.mesh.group.position.set(cop.pos.x, 0, cop.pos.z);
      cop.mesh.group.rotation.y = cop.heading;
      cop.mesh.group.rotation.z = Math.sin(time * 8 + cop.pos.x) * 0.02;

      // shooting
      if (dist < 26 && wanted >= 2) {
        cop.shootTimer -= dt;
        if (cop.shootTimer <= 0) {
          cop.shootTimer = this.rand.range(1.6, 3.2);
          callbacks.onShoot?.(cop, dist);
        }
      }

      // busted check
      if (dist < 6.2 && Math.abs(player.speed) < 4.5) {
        cop.bustTimer = (cop.bustTimer || 0) + dt;
        if (cop.bustTimer > 1.1) callbacks.onBusted?.();
      } else {
        cop.bustTimer = 0;
      }
    }

    // remove inactive after a moment
    this.cars = this.cars.filter((c) => c.active || (c.removeTimer = (c.removeTimer || 0) + dt) < 1.2);
    for (const c of this.cars) {
      if (!c.active) c.mesh.group.visible = false;
    }
  }

  damage(cop, amount, callbacks) {
    if (!cop.active) return;
    cop.hp -= amount;
    if (cop.hp <= 0) {
      cop.active = false;
      cop.mesh.group.visible = false;
      callbacks.onCopWrecked?.(cop);
    }
  }

  clear() {
    for (const c of this.cars) {
      this.scene.remove(c.mesh.group);
      c.mesh.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    this.cars = [];
  }

  dispose() { this.clear(); }
}
