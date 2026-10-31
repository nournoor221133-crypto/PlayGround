import * as THREE from '../vendor/three.module.js';
import { softCircleTexture, glowTexture } from './util.js';

const PARTICLE_VERT = `
  attribute float size;
  attribute float alpha;
  attribute vec3 pcolor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = pcolor;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (420.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;
const PARTICLE_FRAG = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.06, d);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

class ParticlePool {
  constructor(scene, max, blending = THREE.NormalBlending, gravity = 4) {
    this.max = max;
    this.gravity = gravity;
    this.i = 0;
    this.alive = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.particles = Array.from({ length: max }, () => ({
      life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, drag: 0.96, grow: 0, size0: 1, alpha0: 1,
    }));
    this._c = new THREE.Color();
  }

  spawn(x, y, z, opts = {}) {
    const idx = this.i;
    this.i = (this.i + 1) % this.max;
    const p = this.particles[idx];
    p.life = p.maxLife = opts.life ?? 0.8;
    p.vx = opts.vx ?? 0; p.vy = opts.vy ?? 0; p.vz = opts.vz ?? 0;
    p.drag = opts.drag ?? 0.96;
    p.grow = opts.grow ?? 0;
    p.size0 = opts.size ?? 1;
    p.alpha0 = opts.alpha ?? 1;
    this.pos[idx * 3] = x; this.pos[idx * 3 + 1] = y; this.pos[idx * 3 + 2] = z;
    const c = this._c.set(opts.color ?? 0xffffff);
    this.col[idx * 3] = c.r; this.col[idx * 3 + 1] = c.g; this.col[idx * 3 + 2] = c.b;
    this.size[idx] = p.size0;
    this.alpha[idx] = p.alpha0;
  }

  update(dt) {
    let any = false;
    for (let k = 0; k < this.max; k++) {
      const p = this.particles[k];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) { this.alpha[k] = 0; this.size[k] = 0; continue; }
      const t = p.life / p.maxLife;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.vz *= Math.pow(p.drag, dt * 60);
      p.vy -= this.gravity * dt;
      this.pos[k * 3] += p.vx * dt;
      this.pos[k * 3 + 1] += p.vy * dt;
      this.pos[k * 3 + 2] += p.vz * dt;
      this.size[k] = p.size0 * (1 + p.grow * (1 - t));
      this.alpha[k] = p.alpha0 * Math.min(1, t * 2.4);
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.size.needsUpdate = true;
      this.geo.attributes.alpha.needsUpdate = true;
      this.geo.attributes.pcolor.needsUpdate = true;
    }
  }
}

/* ------------------------------------------------------------------ */
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.smoke = new ParticlePool(scene, 320, THREE.NormalBlending, -0.6);
    this.spark = new ParticlePool(scene, 380, THREE.AdditiveBlending, 9);
    this.glow = new ParticlePool(scene, 160, THREE.AdditiveBlending, 0);
    this.buildSkids();
    this.buildFlashes();
    this.flashes = [];
  }

  buildSkids() {
    this.skidMax = 520;
    this.skidIndex = 0;
    const geo = new THREE.PlaneGeometry(0.46, 1.9);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x090909, transparent: true, opacity: 0.55, depthWrite: false,
    });
    this.skids = new THREE.InstancedMesh(geo, mat, this.skidMax);
    this.skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.skids.frustumCulled = false;
    this.skids.renderOrder = 1;
    const m = new THREE.Matrix4();
    m.makeScale(0, 0, 0);
    for (let i = 0; i < this.skidMax; i++) this.skids.setMatrixAt(i, m);
    this.skids.count = this.skidMax;
    this.scene.add(this.skids);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  buildFlashes() {
    this.flashTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  }

  skid(x, z, heading, strength = 1) {
    const i = this.skidIndex;
    this.skidIndex = (this.skidIndex + 1) % this.skidMax;
    this._q.setFromAxisAngle(this._up, heading);
    this._v.set(x, 0.05, z);
    this._s.set(1, 1, 0.8 + strength * 0.4);
    this._m.compose(this._v, this._q, this._s);
    this.skids.setMatrixAt(i, this._m);
    this.skids.instanceMatrix.needsUpdate = true;
  }

  tireSmoke(x, z, strength = 1, side = 0) {
    const n = Math.ceil(strength * 2);
    for (let i = 0; i < n; i++) {
      this.smoke.spawn(
        x + (Math.random() - 0.5) * 0.6,
        0.35,
        z + (Math.random() - 0.5) * 0.6,
        {
          vx: (Math.random() - 0.5) * 1.6 + side * 0.4,
          vy: 0.5 + Math.random() * 1.1,
          vz: (Math.random() - 0.5) * 1.6,
          size: 0.55 + Math.random() * 0.5,
          grow: 3.4,
          life: 0.6 + Math.random() * 0.7,
          alpha: 0.22 + Math.random() * 0.16,
          color: 0xdad6d0,
          drag: 0.9,
        },
      );
    }
  }

  dust(x, z, strength = 1) {
    for (let i = 0; i < Math.ceil(strength * 2); i++) {
      this.smoke.spawn(x + (Math.random() - 0.5) * 2, 0.2, z + (Math.random() - 0.5) * 2, {
        vx: (Math.random() - 0.5) * 3, vy: 0.7 + Math.random(), vz: (Math.random() - 0.5) * 3,
        size: 0.7, grow: 2.5, life: 0.9, alpha: 0.16, color: 0xc9ae85, drag: 0.92,
      });
    }
  }

  impact(x, y, z, nx = 0, nz = 0, strength = 1) {
    const n = Math.min(30, 8 + Math.floor(strength * 2));
    for (let i = 0; i < n; i++) {
      this.spark.spawn(x, y, z, {
        vx: (Math.random() - 0.5) * 7 + nx * strength * 0.6,
        vy: Math.random() * 5,
        vz: (Math.random() - 0.5) * 7 + nz * strength * 0.6,
        size: 0.16 + Math.random() * 0.22,
        life: 0.3 + Math.random() * 0.45,
        alpha: 1,
        color: Math.random() > 0.35 ? 0xffc36b : 0xfff3c4,
        drag: 0.9,
      });
    }
    this.flash(x, y, z, 0xffb15c, 2.2, 0.16);
  }

  explosion(x, y, z) {
    for (let i = 0; i < 26; i++) {
      this.smoke.spawn(x + (Math.random() - 0.5) * 2, y + Math.random() * 1.4, z + (Math.random() - 0.5) * 2, {
        vx: (Math.random() - 0.5) * 8, vy: 2 + Math.random() * 5, vz: (Math.random() - 0.5) * 8,
        size: 1.2 + Math.random() * 1.4, grow: 3, life: 1.1 + Math.random() * 1.2,
        alpha: 0.5, color: 0x2a2723, drag: 0.9,
      });
    }
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 13;
      this.spark.spawn(x, y + 0.5, z, {
        vx: Math.cos(a) * s, vy: Math.random() * 12, vz: Math.sin(a) * s,
        size: 0.2 + Math.random() * 0.45, life: 0.4 + Math.random() * 0.8, alpha: 1,
        color: Math.random() > 0.4 ? 0xff9a2a : 0xffe9a8, drag: 0.94,
      });
    }
    this.flash(x, y + 1, z, 0xffa040, 12, 0.45);
  }

  pickup(x, y, z, color = 0x7dff6e) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glow.spawn(x, y + 0.4, z, {
        vx: Math.cos(a) * 2.2, vy: 2 + Math.random() * 2.5, vz: Math.sin(a) * 2.2,
        size: 0.28 + Math.random() * 0.25, life: 0.5 + Math.random() * 0.4, alpha: 1,
        color, drag: 0.92,
      });
    }
    this.flash(x, y + 0.5, z, color, 3.2, 0.28);
  }

  nitro(x, y, z, heading) {
    const back = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    for (let i = 0; i < 2; i++) {
      this.glow.spawn(x + back.x * 1.5 + (Math.random() - 0.5), y + 0.4, z + back.z * 1.5 + (Math.random() - 0.5), {
        vx: back.x * 6 + (Math.random() - 0.5) * 2,
        vy: 0.4,
        vz: back.z * 6 + (Math.random() - 0.5) * 2,
        size: 0.5 + Math.random() * 0.5, life: 0.22, alpha: 0.9,
        color: Math.random() > 0.4 ? 0x5ee6ff : 0x2f7bff, drag: 0.86,
      });
    }
  }

  gunshot(x, y, z, tx, ty, tz) {
    const dx = tx - x, dy = ty - y, dz = tz - z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      this.glow.spawn(x + dx * t, y + dy * t, z + dz * t, {
        vx: (Math.random() - 0.5) * 0.8, vy: 0.3, vz: (Math.random() - 0.5) * 0.8,
        size: 0.22 + (1 - t) * 0.2, life: 0.16 + Math.random() * 0.1, alpha: 0.9,
        color: 0xffe2a0, drag: 0.8,
      });
    }
    this.flash(x, y, z, 0xffd28a, 1.8, 0.08);
  }

  flash(x, y, z, color, size, duration = 0.3) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.flashTex, color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    sprite.position.set(x, y, z);
    sprite.scale.set(size, size, 1);
    this.scene.add(sprite);
    this.flashes.push({ sprite, life: duration, maxLife: duration, size });
  }

  update(dt, player, time) {
    this.smoke.update(dt);
    this.spark.update(dt);
    this.glow.update(dt);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        f.sprite.material.dispose();
        this.flashes.splice(i, 1);
        continue;
      }
      const t = f.life / f.maxLife;
      f.sprite.material.opacity = t * 0.9;
      const s = f.size * (1 + (1 - t) * 1.6);
      f.sprite.scale.set(s, s, 1);
    }
  }
}
