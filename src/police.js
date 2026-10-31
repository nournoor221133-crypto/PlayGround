import * as THREE from 'three';
import { CarBody, createCarMesh, collideWithWorld, collideCars, steeringTo } from './vehicles.js';
import { clamp, damp, rand, choose, makeGlowTexture } from './utils.js';
import { ROAD_LINES, CITY } from './world.js';

const glowTex = makeGlowTexture();
const nearestRoad = (v) => ROAD_LINES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), ROAD_LINES[0]);

/* ------------------------------------------------------------------ */
/*  Police manager                                                    */
/* ------------------------------------------------------------------ */
export class PoliceManager {
  constructor(scene, world, player, audio, fx) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.audio = audio;
    this.fx = fx;
    this.cops = [];
    this.heli = null;
    this.heliGroup = null;
    this.maxCops = 2;
    this.spawnTimer = 0;
    this.time = 0;
    this.onTakedown = null;
    this.onHitPlayer = null;
    this.blips = [];
    this.pointLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xff2244, 0, 26, 2);
      scene.add(l);
      this.pointLights.push(l);
    }
  }

  reset() {
    for (const cop of this.cops) this.removeCop(cop);
    this.cops = [];
    this.removeHeli();
    this.spawnTimer = 0;
    this.maxCops = 2;
  }

  removeCop(cop) {
    this.scene.remove(cop.mesh.group);
    this.scene.remove(cop.light);
    cop.mesh.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
      }
    });
    cop.light.intensity = 0;
  }

  makeCop(x, z, heading) {
    const mesh = createCarMesh({ color: 0x14161f, kind: 'police' });
    const body = new CarBody({
      x, z, heading,
      maxSpeed: 36 + Math.random() * 3,
      accel: 28,
      turnRate: 2.25,
      grip: 8.5,
      radius: 1.45,
    });
    const light = new THREE.PointLight(0xff2244, 0, 24, 2);
    this.scene.add(light);
    const cop = {
      body,
      mesh,
      light,
      health: 100,
      disabled: false,
      disableTimer: 0,
      phase: Math.random() * 10,
      spawnTime: this.time,
      stuck: 0,
      reverse: 0,
      offTime: 0,
      hitCooldown: 0,
      smokeTimer: 0,
    };
    this.scene.add(mesh.group);
    this.cops.push(cop);
    return cop;
  }

  spawnNearPlayer() {
    const p = this.player.pos;
    for (let attempt = 0; attempt < 24; attempt++) {
      const behind = Math.random() < 0.55;
      const sign = behind ? 1 : -1;
      const angle = Math.atan2(-Math.sin(this.player.heading), -Math.cos(this.player.heading));
      const dist = 55 + Math.random() * 55;
      let x, z;
      if (Math.random() < 0.6) {
        // same vertical road, ahead/behind
        x = nearestRoad(p.x);
        z = p.z + (behind ? dist : -dist) * (Math.random() < 0.5 ? 1 : -1);
      } else {
        z = nearestRoad(p.z);
        x = p.x + (Math.random() < 0.5 ? dist : -dist);
      }
      x = clamp(x, -CITY.bounds + 6, CITY.bounds - 6);
      z = clamp(z, -CITY.bounds + 6, CITY.bounds - 6);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 38 || d > 130) continue;
      if (this.isBlocked(x, z, 4)) continue;
      let heading = Math.atan2(-(p.x - x), -(p.z - z));
      if (Math.random() < 0.5) heading += Math.PI;
      return this.makeCop(x, z, heading);
    }
    // fallback: directly behind player on the road
    const x = nearestRoad(p.x);
    const z = clamp(p.z + 70, -CITY.bounds + 8, CITY.bounds - 8);
    return this.makeCop(x, z, Math.atan2(-(p.x - x), -(p.z - z)));
  }

  spawnAhead(dist = 38) {
    const fwd = this.player.forward;
    let x = this.player.pos.x + fwd.x * dist;
    let z = this.player.pos.z + fwd.z * dist;
    // stay in a lane when we're already on a road
    const rx = nearestRoad(x);
    const rz = nearestRoad(z);
    if (Math.abs(x - rx) < 10) x = rx + 3.4;
    else if (Math.abs(z - rz) < 10) z = rz + 3.4;
    x = clamp(x, -CITY.bounds + 8, CITY.bounds - 8);
    z = clamp(z, -CITY.bounds + 8, CITY.bounds - 8);
    if (this.isBlocked(x, z, 3)) {
      x = nearestRoad(x);
      z = nearestRoad(z);
    }
    const heading = Math.atan2(-(this.player.pos.x - x), -(this.player.pos.z - z));
    return this.makeCop(x, z, heading);
  }

  isBlocked(x, z, pad = 0) {
    for (const c of this.world.colliders) {
      if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
    }
    return false;
  }

  update(dt, wanted) {
    this.time += dt;
    this.maxCops = wanted === 0 ? 0 : clamp(wanted + 1, 0, 6);

    // spawn / retire
    if (wanted > 0) {
      this.spawnTimer -= dt;
      if (this.cops.length < this.maxCops && this.spawnTimer <= 0) {
        this.spawnNearPlayer();
        this.spawnTimer = Math.max(1.6, 4.2 - wanted * 0.4);
      }
    }
    while (this.cops.length > this.maxCops) {
      const far = this.cops.reduce((a, b) => (a.body.pos.distanceTo(this.player.pos) > b.body.pos.distanceTo(this.player.pos) ? a : b));
      this.removeCop(far);
      this.cops.splice(this.cops.indexOf(far), 1);
    }

    const p = this.player.pos;
    const nearest = [];
    for (const cop of this.cops) {
      const b = cop.body;
      cop.hitCooldown = Math.max(0, cop.hitCooldown - dt);

      if (cop.disabled) {
        cop.disableTimer -= dt;
        b.vel.multiplyScalar(Math.exp(-2.4 * dt));
        b.update(dt, { throttle: 0, steer: 0 });
        collideWithWorld(b, this.world.colliders, CITY.bounds);
        b.applyVisual(cop.mesh.group, cop.mesh.bodyMesh);
        cop.light.intensity = 0;
        cop.smokeTimer -= dt;
        if (cop.smokeTimer <= 0) {
          cop.smokeTimer = 0.18;
          this.fx.smoke(b.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 1);
        }
        if (cop.disableTimer <= 0) {
          const d = b.pos.distanceTo(p);
          if (d > 160) {
            this.removeCop(cop);
            this.cops.splice(this.cops.indexOf(cop), 1);
            continue;
          }
        }
        nearest.push({ cop, d: b.pos.distanceTo(p) });
        continue;
      }

      const dist = b.pos.distanceTo(p);

      // despawn if hopelessly far behind
      if (dist > 190) {
        cop.offTime += dt;
        if (cop.offTime > 3.5) {
          this.removeCop(cop);
          this.cops.splice(this.cops.indexOf(cop), 1);
          continue;
        }
      } else cop.offTime = 0;

      const target = this.navTarget(b, p, dist);
      let steer = steeringTo(b, target, dt, 1);
      steer = this.avoid(b, steer);

      // if we're right on the player, aim at them directly
      if (dist < 26) {
        steer = steeringTo(b, p.clone().addScaledVector(this.player.vel, 0.18), dt, 1.2);
        steer = this.avoid(b, steer);
      }

      // stuck recovery
      if (Math.abs(b.speed) < 1.6 && dist > 12) cop.stuck += dt; else cop.stuck = Math.max(0, cop.stuck - dt * 2);
      if (cop.stuck > 2.2 && cop.reverse <= 0) {
        cop.reverse = 1.1;
        cop.stuck = 0;
      }
      let throttle = 1;
      if (cop.reverse > 0) {
        cop.reverse -= dt;
        throttle = -1;
        steer = -steer * 0.6;
      }
      if (dist < 9 && b.speed > 12) throttle = 0.15;

      b.update(dt, { throttle, steer, handbrake: false, boost: wanted >= 4 && dist > 20 });
      collideWithWorld(b, this.world.colliders, CITY.bounds);
      if (b.impact > 13) {
        cop.health -= (b.impact - 12) * 1.6;
        if (b.impact > 20) this.fx.sparks(b.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 8);
      }
      b.applyVisual(cop.mesh.group, cop.mesh.bodyMesh);
      nearest.push({ cop, d: dist });
    }

    // player <-> cop collisions
    for (const cop of this.cops) {
      if (cop.disabled) continue;
      const impact = collideCars(this.player, cop.body);
      if (impact > 3) {
        const rel = impact;
        const px = (this.player.pos.x + cop.body.pos.x) / 2;
        const pz = (this.player.pos.z + cop.body.pos.z) / 2;
        this.fx.sparks(new THREE.Vector3(px, 0.8, pz), Math.min(22, 5 + rel));
        this.audio.crash(clamp(rel / 22, 0.2, 1.2));
        if (cop.hitCooldown <= 0) {
          this.onHitPlayer?.(rel, cop);
          cop.hitCooldown = 0.3;
        }
        if (rel > 11) {
          cop.health -= (rel - 8) * 3.2;
          if (cop.health <= 0 && !cop.disabled) {
            this.disableCop(cop);
          }
        }
      }
    }

    // siren lights
    const t = this.time;
    nearest.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.cops.length; i++) {
      const cop = this.cops[i];
      if (cop.disabled) continue;
      const ph = (t * 3.1 + cop.phase) % 1;
      const redOn = ph < 0.5;
      cop.mesh.sirenRed.material.color.setHex(redOn ? 0xff2038 : 0x2a0710);
      cop.mesh.sirenBlue.material.color.setHex(redOn ? 0x0a1a3a : 0x2b6cff);
      if (cop.mesh.sirenGlow) {
        cop.mesh.sirenGlow.material.color.setHex(redOn ? 0xff2038 : 0x2b6cff);
        cop.mesh.sirenGlow.material.opacity = 0.45 + Math.sin(t * 20 + cop.phase) * 0.15;
      }
    }
    for (let i = 0; i < this.pointLights.length; i++) {
      const light = this.pointLights[i];
      const entry = nearest[i];
      if (!entry || entry.d > 90 || wanted === 0) {
        light.intensity = 0;
        continue;
      }
      const cop = entry.cop;
      if (cop.disabled) { light.intensity = 0; continue; }
      const ph = (t * 3.1 + cop.phase) % 1;
      const redOn = ph < 0.5;
      light.color.setHex(redOn ? 0xff2038 : 0x2b6cff);
      light.intensity = 9 + Math.sin(t * 16) * 2;
      light.position.set(cop.body.pos.x, 2.4, cop.body.pos.z);
    }

    // helicopter
    if (wanted >= 3) {
      if (!this.heliGroup) this.createHeli();
      this.updateHeli(dt, wanted);
    } else if (this.heliGroup) {
      this.removeHeli();
    }

    this.blips = this.cops.map((c) => ({
      x: c.body.pos.x,
      z: c.body.pos.z,
      heading: c.body.heading,
      disabled: c.disabled,
    }));
  }

  navTarget(car, p, dist) {
    if (dist < 30) return p;
    const rx = nearestRoad(car.pos.x);
    const rz = nearestRoad(car.pos.z);
    const onV = Math.abs(car.pos.x - rx) < 9;
    const onH = Math.abs(car.pos.z - rz) < 9;
    if (onV && onH) return p;
    if (onV && !onH) {
      const pxr = nearestRoad(p.x);
      if (Math.abs(pxr - rx) > 26) return new THREE.Vector3(rx, 0, nearestRoad(p.z));
      return new THREE.Vector3(rx, 0, p.z);
    }
    if (onH && !onV) {
      const pzr = nearestRoad(p.z);
      if (Math.abs(pzr - rz) > 26) return new THREE.Vector3(nearestRoad(p.x), 0, rz);
      return new THREE.Vector3(p.x, 0, rz);
    }
    return new THREE.Vector3(rx, 0, rz);
  }

  avoid(car, steer) {
    const ahead = car.pos.clone().addScaledVector(car.forward, 10);
    if (!this.isBlocked(ahead.x, ahead.z, 2.2)) return steer;
    const left = car.pos.clone().addScaledVector(car.forward, 9).addScaledVector(car.right, -7);
    const rightP = car.pos.clone().addScaledVector(car.forward, 9).addScaledVector(car.right, 7);
    const leftFree = !this.isBlocked(left.x, left.z, 2.2);
    const rightFree = !this.isBlocked(rightP.x, rightP.z, 2.2);
    if (leftFree && !rightFree) return 0.9;
    if (rightFree && !leftFree) return -0.9;
    return steer + 0.55;
  }

  disableCop(cop) {
    cop.disabled = true;
    cop.disableTimer = 14;
    cop.health = 0;
    cop.mesh.sirenRed.material.color.setHex(0x1a060a);
    cop.mesh.sirenBlue.material.color.setHex(0x060a1a);
    if (cop.mesh.sirenGlow) cop.mesh.sirenGlow.material.opacity = 0;
    this.fx.explosion(cop.body.pos.clone().add(new THREE.Vector3(0, 1, 0)));
    this.audio.explosion();
    this.onTakedown?.(cop);
  }

  /* ---------------- helicopter ---------------- */
  createHeli() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x15161e, roughness: 0.5, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 5.6), dark);
    body.position.y = 0;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.4), new THREE.MeshStandardMaterial({ color: 0x2a2d3a, roughness: 0.4, metalness: 0.5 }));
    nose.position.set(0, -0.1, -3.3);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 1.2), new THREE.MeshBasicMaterial({ color: 0x6fd8ff }));
    glass.position.set(0, 0.1, -3.5);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.4), dark);
    tail.position.set(0, 0.3, 4.4);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.8), dark);
    fin.position.set(0, 0.9, 6.4);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x23242c, roughness: 0.6 }));
    rotor.position.y = 1.15;
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.28), dark);
    tailRotor.position.set(0.35, 0.9, 6.4);
    const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.4), dark);
    skidL.position.set(-1.2, -1.1, 0);
    const skidR = skidL.clone();
    skidR.position.x = 1.2;
    g.add(body, nose, glass, tail, fin, rotor, tailRotor, skidL, skidR);

    const beaconR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2038, toneMapped: false }));
    beaconR.position.set(-1.0, 0.9, 0);
    const beaconB = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshBasicMaterial({ color: 0x2b6cff, toneMapped: false }));
    beaconB.position.set(1.0, 0.9, 0);
    g.add(beaconR, beaconB);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xdff4ff, transparent: true, opacity: 0.055, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 8.5, 1, 14, 1, true), beamMat);
    beam.geometry.translate(0, -0.5, 0);
    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(8.5, 24),
      new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    spot.rotation.x = -Math.PI / 2;

    g.position.set(this.player.pos.x + 30, 44, this.player.pos.z + 30);
    this.scene.add(g, beam, spot);
    this.heliGroup = g;
    this.heli = {
      group: g, rotor, tailRotor, beam, spot, beaconR, beaconB,
      pos: g.position, orbit: Math.random() * Math.PI * 2,
      rotorSpin: 0,
    };
  }

  updateHeli(dt, wanted) {
    const h = this.heli;
    if (!h) return;
    h.orbit += dt * 0.35;
    const p = this.player.pos;
    const tx = p.x + Math.cos(h.orbit) * 26;
    const tz = p.z + Math.sin(h.orbit) * 26;
    h.pos.x = damp(h.pos.x, tx, 0.55, dt);
    h.pos.z = damp(h.pos.z, tz, 0.55, dt);
    h.pos.y = damp(h.pos.y, 42 + Math.sin(this.time * 0.8) * 2, 1.2, dt);
    h.group.rotation.y = Math.atan2(p.x - h.pos.x, p.z - h.pos.z);
    h.group.rotation.z = Math.sin(this.time * 0.9) * 0.05;
    h.rotorSpin += dt * 26;
    h.rotor.rotation.y = h.rotorSpin;
    h.tailRotor.rotation.x = h.rotorSpin * 1.4;

    const dir = new THREE.Vector3(p.x - h.pos.x, 0.2 - h.pos.y, p.z - h.pos.z);
    const len = dir.length();
    h.beam.position.copy(h.pos);
    h.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    h.beam.scale.set(1, len, 1);
    h.spot.position.set(p.x, 0.08, p.z);
    h.spot.rotation.z = this.time * 0.2;
    const blink = Math.sin(this.time * 9) > 0;
    h.beaconR.material.color.setHex(blink ? 0xff2038 : 0x220508);
    h.beaconB.material.color.setHex(blink ? 0x0a1830 : 0x2b6cff);
  }

  removeHeli() {
    if (!this.heliGroup) return;
    this.scene.remove(this.heliGroup, this.heli.beam, this.heli.spot);
    this.heliGroup = null;
    this.heli = null;
  }

  nearestDistance() {
    let d = Infinity;
    for (const c of this.cops) {
      if (c.disabled) continue;
      d = Math.min(d, c.body.pos.distanceTo(this.player.pos));
    }
    if (this.heli) d = Math.min(d, 40);
    return d;
  }

  get activeCount() {
    return this.cops.filter((c) => !c.disabled).length;
  }
}
