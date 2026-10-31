import * as THREE from 'three';
import { createCarMesh, CarBody, collideWithWorld } from './vehicles.js';
import { clamp, rand, choose, TAU } from './utils.js';
import { ROAD_LINES, CITY, BLOCK_CENTERS } from './world.js';

const TRAFFIC_COLORS = [0xb8bcc8, 0x7a2b3a, 0x2b4a6a, 0x2c5c4a, 0x8c7a4a, 0x3a3a4a, 0x6a3a6a, 0x9a4a2a, 0x4a6a8a];

/* ------------------------------------------------------------------ */
/*  Civilian traffic                                                  */
/* ------------------------------------------------------------------ */
export class Traffic {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    this.count = 14;
    for (let i = 0; i < this.count; i++) this.spawn(i);
  }

  spawn(i) {
    const axis = Math.random() < 0.5 ? 'z' : 'x';
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = Math.random() < 0.5 ? -4 : 4;
    const road = choose(ROAD_LINES);
    let x, z;
    if (axis === 'z') {
      x = road + lane;
      z = rand(-215, 215);
    } else {
      x = rand(-215, 215);
      z = road + lane;
    }
    // don't spawn on top of the player start
    if (Math.hypot(x, z) < 26) {
      if (axis === 'z') z += 60 * dir;
      else x += 60 * dir;
    }
    const heading = axis === 'z'
      ? (dir > 0 ? Math.PI : 0)
      : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    const color = choose(TRAFFIC_COLORS);
    const mesh = createCarMesh({ color, kind: 'traffic' });
    const body = new CarBody({ x, z, heading, maxSpeed: 14, radius: 1.42 });
    const speed = rand(7, 13);
    body.speed = speed;
    body.vel.set(-Math.sin(heading) * speed, 0, -Math.cos(heading) * speed);
    const car = { mesh, body, axis, dir, lane, speed, hitTimer: 0, spin: 0, baseSpeed: speed };
    this.scene.add(mesh.group);
    this.cars.push(car);
    return car;
  }

  reset() {
    for (const c of this.cars) this.scene.remove(c.mesh.group);
    this.cars = [];
    for (let i = 0; i < this.count; i++) this.spawn(i);
  }

  hit(car, impact, fromX, fromZ) {
    if (car.hitTimer > 0) return;
    car.hitTimer = 1.8;
    car.spin = (Math.random() - 0.5) * 3;
    const dx = car.body.pos.x - fromX;
    const dz = car.body.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const force = clamp(impact * 0.55, 2, 16);
    car.body.vel.x += (dx / d) * force;
    car.body.vel.z += (dz / d) * force;
  }

  update(dt, playerPos) {
    for (const car of this.cars) {
      const b = car.body;
      if (car.hitTimer > 0) {
        car.hitTimer -= dt;
        b.vel.multiplyScalar(Math.exp(-1.6 * dt));
        b.pos.addScaledVector(b.vel, dt);
        b.heading += car.spin * dt;
        car.spin *= Math.exp(-1.4 * dt);
        collideWithWorld(b, this.world.colliders, CITY.bounds);
        b.applyVisual(car.mesh.group, car.mesh.bodyMesh);
        if (car.hitTimer <= 0) {
          // recover onto the nearest road
          const rx = ROAD_LINES.reduce((a, v) => (Math.abs(v - b.pos.x) < Math.abs(a - b.pos.x) ? v : a), ROAD_LINES[0]);
          const rz = ROAD_LINES.reduce((a, v) => (Math.abs(v - b.pos.z) < Math.abs(a - b.pos.z) ? v : a), ROAD_LINES[0]);
          if (Math.abs(b.pos.x - rx) < Math.abs(b.pos.z - rz)) {
            b.pos.x = rx + car.lane;
            car.axis = 'z';
            b.heading = car.dir > 0 ? Math.PI : 0;
          } else {
            b.pos.z = rz + car.lane;
            car.axis = 'x';
            b.heading = car.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          }
          car.speed = car.baseSpeed;
        }
        continue;
      }

      b.heading = car.axis === 'z'
        ? (car.dir > 0 ? Math.PI : 0)
        : (car.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      b.speed = car.speed;
      b.vel.set(-Math.sin(b.heading) * car.speed, 0, -Math.cos(b.heading) * car.speed);
      b.pos.addScaledVector(b.vel, dt);

      // wrap around the city
      const lim = CITY.bounds + 14;
      if (car.axis === 'z') {
        if (b.pos.z > lim) b.pos.z = -lim;
        if (b.pos.z < -lim) b.pos.z = lim;
      } else {
        if (b.pos.x > lim) b.pos.x = -lim;
        if (b.pos.x < -lim) b.pos.x = lim;
      }
      b.applyVisual(car.mesh.group, car.mesh.bodyMesh);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Pedestrians                                                       */
/* ------------------------------------------------------------------ */
export class Pedestrians {
  constructor(scene) {
    this.scene = scene;
    this.count = 54;
    this.peds = [];
    const geo = new THREE.CapsuleGeometry(0.21, 0.85, 3, 6);
    geo.translate(0, 0.64, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    const dummy = new THREE.Object3D();
    const colors = [0x6a3a3a, 0x3a4a6a, 0x4a4a4a, 0x7a6a4a, 0x2c5c4a, 0x5a3a6a, 0x8a8a9a];
    for (let i = 0; i < this.count; i++) {
      const block = Math.floor(Math.random() * BLOCK_CENTERS.length);
      const block2 = Math.floor(Math.random() * BLOCK_CENTERS.length);
      const cx = BLOCK_CENTERS[block];
      const cz = BLOCK_CENTERS[block2];
      const t = Math.random();
      const speed = rand(0.7, 1.5);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const off = 26.3 + rand(-1.6, 1.6);
      const ped = { cx, cz, t, speed, dir, off, phase: Math.random() * TAU, flee: 0 };
      this.peds.push(ped);
      this.mesh.setColorAt(i, new THREE.Color(choose(colors)));
      dummy.position.set(cx + off, 0.55, cz + off);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, player, playerSpeed) {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      const perim = p.off * 8;
      p.t += (p.dir * p.speed * dt) / perim;
      if (p.t > 1) p.t -= 1;
      if (p.t < 0) p.t += 1;
      // rectangle perimeter walk
      const s = p.t * 4;
      let x, z;
      if (s < 1) { x = p.cx - p.off + s * perim * 0.25; z = p.cz - p.off; }
      else if (s < 2) { x = p.cx + p.off; z = p.cz - p.off + (s - 1) * perim * 0.25; }
      else if (s < 3) { x = p.cx + p.off - (s - 2) * perim * 0.25; z = p.cz + p.off; }
      else { x = p.cx - p.off; z = p.cz + p.off - (s - 3) * perim * 0.25; }

      // flee the player's car
      let speed = p.speed;
      if (player) {
        const dx = x - player.x;
        const dz = z - player.z;
        const d = Math.hypot(dx, dz);
        if (d < 13 && playerSpeed > 4) {
          p.flee = 1;
          x += (dx / (d || 1)) * Math.min(3, (13 - d) * 0.35);
          z += (dz / (d || 1)) * Math.min(3, (13 - d) * 0.35);
          speed = p.speed * 2.4;
        } else {
          p.flee = Math.max(0, p.flee - dt);
        }
      }

      p.phase += dt * (6 + speed * 2);
      const bob = Math.abs(Math.sin(p.phase)) * 0.07;
      dummy.position.set(x, 0.55 + bob, z);
      dummy.rotation.set(0, Math.atan2(-(p.cx - x), -(p.cz - z)) + (p.dir > 0 ? 0 : Math.PI), 0);
      dummy.scale.set(1, 1 + Math.sin(p.phase) * 0.03, 1);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
