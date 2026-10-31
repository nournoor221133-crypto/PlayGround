import * as THREE from 'three';
import { makeGlowTexture, rand } from './utils.js';

/* ------------------------------------------------------------------ */
/*  GPU point particles                                               */
/* ------------------------------------------------------------------ */
class ParticleSystem {
  constructor(scene, { max = 420, blending = THREE.AdditiveBlending, gravity = 9, drag = 1.6 } = {}) {
    this.max = max;
    this.gravity = gravity;
    this.drag = drag;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending,
      uniforms: { map: { value: makeGlowTexture() } },
      vertexShader: /* glsl */`
        attribute float size;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (340.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D map;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          if (t.a * vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }
      `,
      vertexColors: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.geo = geo;
    scene.add(this.points);
  }

  spawn(x, y, z, count, opts = {}) {
    const color = new THREE.Color(opts.color ?? 0xffc060);
    const speed = opts.speed ?? 6;
    const spread = opts.spread ?? 1;
    const size = opts.size ?? 1.6;
    const life = opts.life ?? 0.6;
    const up = opts.up ?? 2;
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const i3 = idx * 3;
      this.pos[i3] = x + rand(-spread, spread) * 0.35;
      this.pos[i3 + 1] = y + rand(-0.2, 0.2);
      this.pos[i3 + 2] = z + rand(-spread, spread) * 0.35;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      this.vel[i3] = Math.cos(a) * r;
      this.vel[i3 + 1] = rand(0, up) + (opts.vy ?? 0);
      this.vel[i3 + 2] = Math.sin(a) * r;
      this.col[i3] = color.r;
      this.col[i3 + 1] = color.g;
      this.col[i3 + 2] = color.b;
      this.baseSize[idx] = size * rand(0.6, 1.4);
      this.size[idx] = this.baseSize[idx];
      this.alpha[idx] = opts.alpha ?? 1;
      this.life[idx] = life * rand(0.7, 1.25);
      this.maxLife[idx] = this.life[idx];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  update(dt) {
    let dirty = false;
    for (let idx = 0; idx < this.max; idx++) {
      if (this.life[idx] <= 0) {
        if (this.alpha[idx] !== 0) { this.alpha[idx] = 0; dirty = true; }
        continue;
      }
      dirty = true;
      const i3 = idx * 3;
      this.life[idx] -= dt;
      const k = Math.exp(-this.drag * dt);
      this.vel[i3] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.gravity * dt;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.05) {
        this.pos[i3 + 1] = 0.05;
        this.vel[i3 + 1] *= -0.25;
      }
      const f = Math.max(0, this.life[idx] / this.maxLife[idx]);
      this.alpha[idx] = f * f;
      this.size[idx] = this.baseSize[idx] * (0.5 + (1 - f) * 0.9);
    }
    if (dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.alpha.needsUpdate = true;
      this.geo.attributes.size.needsUpdate = true;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  FX                                                                */
/* ------------------------------------------------------------------ */
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.sparkSys = new ParticleSystem(scene, { max: 500, blending: THREE.AdditiveBlending, gravity: 11, drag: 1.1 });
    this.smokeSys = new ParticleSystem(scene, { max: 360, blending: THREE.NormalBlending, gravity: -0.8, drag: 0.9 });
    this.flashes = [];
    this.shake = 0;

    // skid marks
    const geo = new THREE.PlaneGeometry(0.34, 2.6);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x050508, transparent: true, opacity: 0.5, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.skids = new THREE.InstancedMesh(geo, mat, 320);
    this.skids.frustumCulled = false;
    this.skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 320; i++) this.skids.setMatrixAt(i, zero);
    this.skids.instanceMatrix.needsUpdate = true;
    scene.add(this.skids);
    this.skidCursor = 0;
    this.skidTimer = 0;

    this.glowTex = makeGlowTexture();
  }

  sparkBurst(pos, n = 12, color = 0xffc060, speed = 9) {
    this.sparkSys.spawn(pos.x, pos.y, pos.z, n, { color, speed, up: 3.5, size: 1.5, life: 0.55, spread: 0.8 });
  }

  sparks(pos, n = 12, color = 0xffc060, speed = 9) {
    this.sparkBurst(pos, n, color, speed);
  }

  smoke(pos, n = 2) {
    this.smokeSys.spawn(pos.x, pos.y, pos.z, n, {
      color: 0x2c2c36, speed: 1.2, up: 1.8, size: 5.5, life: 1.6, alpha: 0.5, spread: 0.7,
    });
  }

  tireSmoke(pos, n = 2) {
    this.smokeSys.spawn(pos.x, 0.4, pos.z, n, {
      color: 0x8c8c9a, speed: 1.6, up: 1.1, size: 3.2, life: 1.1, alpha: 0.35, spread: 0.5,
    });
  }

  explosion(pos) {
    this.sparkBurst(pos, 60, 0xff9a3d, 18);
    this.sparkBurst(pos, 30, 0xfff0b0, 10);
    for (let i = 0; i < 16; i++) this.smoke(pos, 2);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xffb060, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.position.copy(pos);
    s.scale.setScalar(4);
    this.scene.add(s);
    this.flashes.push({ sprite: s, life: 0.55, max: 0.55, maxScale: 26 });
    this.shake = Math.max(this.shake, 1.4);
  }

  addShake(v) {
    this.shake = Math.min(1.8, this.shake + v);
  }

  leaveSkid(pos, heading, strength = 1) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0));
    const s = new THREE.Vector3(1, 1, 1);
    for (const side of [-0.82, 0.82]) {
      const off = new THREE.Vector3(Math.cos(heading) * side, 0, -Math.sin(heading) * side);
      m.compose(new THREE.Vector3(pos.x + off.x, 0.045, pos.z + off.z), q, s);
      this.skids.setMatrixAt(this.skidCursor, m);
      this.skidCursor = (this.skidCursor + 1) % 320;
    }
    this.skids.instanceMatrix.needsUpdate = true;
  }

  update(dt, player, input) {
    this.sparkSys.update(dt);
    this.smokeSys.update(dt);
    this.shake = Math.max(0, this.shake - dt * 2.2);

    // skid marks + tyre smoke
    const drifting = player && (input?.handbrake || player.slip > 4) && Math.abs(player.speed) > 5;
    if (drifting) {
      this.skidTimer -= dt;
      if (this.skidTimer <= 0) {
        this.skidTimer = 0.035;
        this.leaveSkid(player.pos, player.heading);
      }
      if (Math.random() < 0.5) {
        this.tireSmoke(player.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 1);
      }
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const t = 1 - f.life / f.max;
      f.sprite.material.opacity = Math.max(0, 1 - t) * 0.95;
      f.sprite.scale.setScalar(4 + f.maxScale * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5));
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        f.sprite.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
  }
}
