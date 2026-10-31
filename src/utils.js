import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Math                                                              */
/* ------------------------------------------------------------------ */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                  */
/* ------------------------------------------------------------------ */
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export function paint(geo, color) {
  const c = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function transform(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, _s);
  geo.applyMatrix4(_m4);
  return geo;
}

export function boxPart(list, w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  paint(g, color);
  transform(g, x, y, z, rx, ry, rz);
  list.push(g);
  return g;
}

export function cylPart(list, rTop, rBot, h, seg, x, y, z, color, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  paint(g, color);
  transform(g, x, y, z, rx, ry, rz);
  list.push(g);
  return g;
}

/**
 * Merge a list of BufferGeometries that all carry position/normal/uv/color.
 * Returns a single non-indexed BufferGeometry.
 */
export function mergeGeoms(list) {
  const geoms = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = ['position', 'normal', 'uv', 'color'];
  const totals = {};
  for (const n of names) totals[n] = 0;
  for (const g of geoms) {
    for (const n of names) {
      if (!g.attributes[n]) throw new Error(`mergeGeoms: missing ${n}`);
      totals[n] += g.attributes[n].count * g.attributes[n].itemSize;
    }
  }
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const itemSize = geoms[0].attributes[n].itemSize;
    const arr = new Float32Array(totals[n]);
    let offset = 0;
    for (const g of geoms) {
      arr.set(g.attributes[n].array, offset);
      offset += g.attributes[n].array.length;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, itemSize));
  }
  out.computeBoundingSphere();
  return out;
}

/* ------------------------------------------------------------------ */
/*  Canvas textures                                                   */
/* ------------------------------------------------------------------ */
function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finishTexture(canvas, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Building facade: diffuse wall + emissive window lights. */
export function makeFacadeTextures(seed = 7) {
  const rng = mulberry32(seed);
  const S = 256;
  const [cMap, m] = canvas2d(S, S);
  const [cEmi, e] = canvas2d(S, S);

  m.fillStyle = '#20202b';
  m.fillRect(0, 0, S, S);
  // subtle vertical panel seams
  m.fillStyle = 'rgba(255,255,255,0.025)';
  for (let x = 0; x < S; x += 64) m.fillRect(x, 0, 2, S);
  m.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < S; y += 32) m.fillRect(0, y, S, 2);

  e.fillStyle = '#000000';
  e.fillRect(0, 0, S, S);

  const cols = 8;
  const rows = 8;
  const cw = S / cols;
  const ch = S / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cw + 6;
      const py = y * ch + 7;
      const w = cw - 12;
      const h = ch - 13;

      const grd = m.createLinearGradient(px, py, px, py + h);
      grd.addColorStop(0, '#2a3040');
      grd.addColorStop(1, '#161a25');
      m.fillStyle = grd;
      m.fillRect(px, py, w, h);
      m.strokeStyle = 'rgba(0,0,0,0.55)';
      m.lineWidth = 2;
      m.strokeRect(px, py, w, h);

      // Some windows have blinds
      if (rng() < 0.28) {
        m.fillStyle = 'rgba(120, 140, 180, 0.08)';
        for (let b = 0; b < 4; b++) m.fillRect(px + 2, py + 3 + b * 5, w - 4, 2);
      }

      if (rng() < 0.52) {
        const warm = rng() < 0.66;
        const bright = 0.45 + rng() * 0.55;
        const col = warm
          ? `rgba(255, ${Math.round(196 + rng() * 40)}, ${Math.round(120 + rng() * 60)}, ${bright})`
          : `rgba(${Math.round(120 + rng() * 60)}, ${Math.round(190 + rng() * 50)}, 255, ${bright})`;
        e.fillStyle = col;
        e.fillRect(px + 1, py + 1, w - 2, h - 2);
        // interior silhouette
        if (rng() < 0.3) {
          e.fillStyle = 'rgba(0,0,0,0.5)';
          e.fillRect(px + 2, py + h * 0.45, w - 4, h * 0.55);
        }
        // window glow bleed
        m.fillStyle = warm ? 'rgba(255,200,130,0.16)' : 'rgba(150,210,255,0.14)';
        m.fillRect(px - 2, py - 2, w + 4, h + 4);
      }
    }
  }

  return {
    map: finishTexture(cMap, { repeat: true }),
    emissiveMap: finishTexture(cEmi, { repeat: true }),
  };
}

/** Soft round glow used for sprites / points. */
export function makeGlowTexture() {
  const [c, g] = canvas2d(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.32)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.06)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return finishTexture(c, { srgb: false });
}

/** Dark soft blob for contact shadows. */
export function makeShadowTexture() {
  const [c, g] = canvas2d(128, 128);
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(0,0,0,0.82)');
  grd.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return finishTexture(c, { srgb: false });
}

/** Warm pool of light cast by a street lamp. */
export function makeLightPoolTexture() {
  const [c, g] = canvas2d(256, 256);
  const grd = g.createRadialGradient(128, 128, 2, 128, 128, 126);
  grd.addColorStop(0, 'rgba(255, 214, 150, 0.78)');
  grd.addColorStop(0.35, 'rgba(255, 180, 110, 0.32)');
  grd.addColorStop(1, 'rgba(255, 160, 90, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return finishTexture(c, { srgb: false });
}

export function makeAsphaltTexture() {
  const [c, g] = canvas2d(256, 256);
  g.fillStyle = '#14141c';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const v = 16 + Math.random() * 26;
    g.fillStyle = `rgba(${v},${v},${v + 6},${Math.random() * 0.5})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // faint tire wear
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(64, 0, 30, 256);
  g.fillRect(162, 0, 30, 256);
  return finishTexture(c, { repeat: true });
}

export function makeSidewalkTexture() {
  const [c, g] = canvas2d(256, 256);
  g.fillStyle = '#2a2b36';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(8,8,14,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  for (let i = 0; i < 900; i++) {
    const v = 34 + Math.random() * 24;
    g.fillStyle = `rgba(${v},${v},${v + 8},0.35)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  return finishTexture(c, { repeat: true });
}

/** Neon sign texture. */
export function makeSignTexture(text, color = '#ff2d78', vertical = false) {
  const W = vertical ? 128 : 512;
  const H = vertical ? 512 : 128;
  const [c, g] = canvas2d(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(5,5,12,0.88)';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.strokeRect(8, 8, W - 16, H - 16);

  g.fillStyle = '#ffffff';
  g.shadowColor = color;
  g.shadowBlur = 28;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (vertical) {
    g.font = 'bold 74px "Arial Black", Impact, sans-serif';
    const chars = text.split('');
    const step = (H - 60) / chars.length;
    chars.forEach((ch, i) => g.fillText(ch, W / 2, 30 + step * (i + 0.5)));
  } else {
    g.font = 'bold 74px "Arial Black", Impact, sans-serif';
    g.fillText(text, W / 2, H / 2 + 4);
  }
  return finishTexture(c);
}

/** Floating cash pickup icon. */
export function makeCashTexture() {
  const [c, g] = canvas2d(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.shadowColor = '#ffc857';
  g.shadowBlur = 20;
  g.fillStyle = '#1c1606';
  g.beginPath(); g.arc(64, 64, 52, 0, TAU); g.fill();
  g.strokeStyle = '#ffc857';
  g.lineWidth = 5;
  g.beginPath(); g.arc(64, 64, 52, 0, TAU); g.stroke();
  g.fillStyle = '#ffe9a8';
  g.font = 'bold 76px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('$', 64, 68);
  return finishTexture(c);
}

/** Headlight cone for the ground (soft, blurred edges). */
export function makeHeadlightTexture() {
  const [c, g] = canvas2d(256, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255, 246, 218, 0.7)');
  grd.addColorStop(0.35, 'rgba(255, 236, 190, 0.32)');
  grd.addColorStop(0.75, 'rgba(255, 226, 172, 0.1)');
  grd.addColorStop(1, 'rgba(255, 220, 160, 0)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(106, 0);
  g.lineTo(150, 0);
  g.lineTo(252, 256);
  g.lineTo(4, 256);
  g.closePath();
  g.fill();
  const [c2, g2] = canvas2d(256, 256);
  g2.filter = 'blur(10px)';
  g2.drawImage(c, 0, 0);
  g2.filter = 'none';
  return finishTexture(c2, { srgb: false });
}
