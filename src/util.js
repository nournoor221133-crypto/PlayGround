import * as THREE from '../vendor/three.module.js';

/* ------------------------------------------------------------------ */
/* Small math helpers                                                  */
/* ------------------------------------------------------------------ */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;

export function shortestAngle(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function dampAngle(a, b, lambda, dt) {
  return a + shortestAngle(a, b) * (1 - Math.exp(-lambda * dt));
}
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rand {
  constructor(seed = 1337) { this.r = mulberry32(seed); }
  next() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length) % arr.length]; }
  chance(p) { return this.r() < p; }
  sign() { return this.r() < 0.5 ? -1 : 1; }
}

export const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

/* ------------------------------------------------------------------ */
/* Texture helpers                                                     */
/* ------------------------------------------------------------------ */
export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.wrap !== false) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.anisotropy = 4;
  return t;
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.32, inner.replace(/[\d.]+\)$/, '0.55)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { wrap: false });
}

export function softCircleTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { wrap: false });
}

/* Neon / billboard text texture */
export function textTexture(text, {
  color = '#ff7a1a', bg = 'rgba(8,6,14,0.92)', width = 512, height = 192,
  font = 'italic 900 92px Impact, Arial Black, sans-serif', sub = '',
  border = true, glow = 22,
} = {}) {
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (border) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.strokeRect(8, 8, w - 16, h - 16);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.fillText(text, w / 2, sub ? h * 0.44 : h * 0.52);
    if (sub) {
      ctx.shadowBlur = 8;
      ctx.font = '700 30px Inter, Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.fillText(sub, w / 2, h * 0.78);
    }
  }, { wrap: false });
}

/* ------------------------------------------------------------------ */
/* Geometry merging (keeps draw calls low on mobile)                   */
/* ------------------------------------------------------------------ */
export function mergeGeometries(entries) {
  let total = 0;
  const prepared = [];
  for (const entry of entries) {
    let g = entry.geo.index ? entry.geo.toNonIndexed() : entry.geo.clone();
    if (entry.matrix) g.applyMatrix4(entry.matrix);
    if (!g.attributes.uv) {
      const count = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    total += g.attributes.position.count;
    prepared.push(g);
  }
  const pos = new Float32Array(total * 3);
  const norm = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of prepared) {
    pos.set(g.attributes.position.array, o * 3);
    norm.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.computeBoundingSphere();
  return merged;
}

export function addMerged(parent, material, entries, { shadow = true, receive = true, renderOrder = 0 } = {}) {
  if (!entries.length) return null;
  const mesh = new THREE.Mesh(mergeGeometries(entries), material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = receive;
  mesh.renderOrder = renderOrder;
  mesh.matrixAutoUpdate = false;
  parent.add(mesh);
  return mesh;
}

export function scaleBoxUV(geo, w, h, d, tileU = 4.2, tileV = 3.6) {
  const uv = geo.attributes.uv;
  const uScale = [d, d, w, w, w, w];
  const vScale = [h, h, d, d, h, h];
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, uv.getX(idx) * (uScale[face] / tileU), uv.getY(idx) * (vScale[face] / tileV));
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/* A flat plane on the ground, with optional rotation around Y */
export function groundPlane(w, d, x, z, y = 0, rotY = 0) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

export function boxAt(w, h, d, x, y, z, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

export function cylAt(rTop, rBot, h, seg, x, y, z, rot = null) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  if (rot) {
    g.rotateX(rot.x || 0);
    g.rotateY(rot.y || 0);
    g.rotateZ(rot.z || 0);
  }
  g.translate(x, y, z);
  return g;
}

/* dispose helper */
export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map && !m.map.userData.shared) m.map.dispose();
        m.dispose();
      }
    }
  });
}
