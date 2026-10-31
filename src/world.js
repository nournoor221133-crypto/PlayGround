import * as THREE from 'three';
import {
  mulberry32, rand, choose, paint, transform, boxPart, cylPart, mergeGeoms,
  makeFacadeTextures, makeGlowTexture, makeLightPoolTexture, makeAsphaltTexture,
  makeSidewalkTexture, makeSignTexture, makeCashTexture, clamp, TAU,
} from './utils.js';

/* ------------------------------------------------------------------ */
/*  City constants                                                    */
/* ------------------------------------------------------------------ */
export const CITY = {
  road: 16,
  block: 56,
  pitch: 72,
  grid: 6,
  roads: 7,
  min: -216,
  max: 216,
  bounds: 224,
  start: new THREE.Vector3(0, 0, -16),
};

export const ROAD_LINES = Array.from({ length: CITY.roads }, (_, i) => -216 + i * CITY.pitch);
export const BLOCK_CENTERS = Array.from({ length: CITY.grid }, (_, i) => -180 + i * CITY.pitch);

const wallPalette = [0xa9a7b8, 0x8e93a8, 0xb4a9a0, 0x8f9cae, 0xa59db7, 0x9aa6a0, 0xb8b2c4];
const neonPalette = ['#4ef0e0', '#ff2d78', '#ffc857', '#7aa8ff', '#ff7a3d', '#b06bff'];

/* ------------------------------------------------------------------ */
/*  World                                                             */
/* ------------------------------------------------------------------ */
export function createWorld(scene, renderer) {
  const rng = mulberry32(20260214);
  const colliders = [];
  const parks = new Set();
  const pickups = [];
  const lampBulbs = [];
  const signMats = [];
  const animated = [];

  /* -------------------- sky -------------------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(760, 32, 18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x05050e) },
        mid: { value: new THREE.Color(0x17102b) },
        horizon: { value: new THREE.Color(0x341a3d) },
        glow: { value: new THREE.Color(0xff3d6e) },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 top;
        uniform vec3 mid;
        uniform vec3 horizon;
        uniform vec3 glow;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(horizon, mid, smoothstep(0.48, 0.68, h));
          col = mix(col, top, smoothstep(0.62, 0.98, h));
          // warm city bloom on the horizon, stronger to the west
          float band = pow(1.0 - abs(vDir.y), 7.0);
          float dir = smoothstep(-0.9, 0.5, vDir.x);
          col += glow * band * (0.16 + dir * 0.34);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 420; i++) {
    const theta = rng() * TAU;
    const phi = Math.acos(rng() * 0.55 + 0.12);
    const r = 700;
    starPos.push(Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r * 0.9, Math.sin(phi) * Math.sin(theta) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xbcd6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false })
  );
  scene.add(stars);

  const glowTex = makeGlowTexture();
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xbcd8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  moon.position.set(-330, 230, -520);
  moon.scale.setScalar(150);
  scene.add(moon);
  const moonCore = new THREE.Mesh(
    new THREE.SphereGeometry(22, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xe8f2ff })
  );
  moonCore.position.copy(moon.position);
  scene.add(moonCore);

  /* -------------------- lighting -------------------- */
  scene.fog = new THREE.Fog(0x0c0a18, 90, 520);
  const hemi = new THREE.HemisphereLight(0x8ea4ff, 0x241a2e, 0.9);
  scene.add(hemi);
  const moonLight = new THREE.DirectionalLight(0x9db4ff, 0.8);
  moonLight.position.set(-120, 180, -160);
  scene.add(moonLight);
  const cityFill = new THREE.DirectionalLight(0xff7fae, 0.32);
  cityFill.position.set(120, 60, 140);
  scene.add(cityFill);

  /* -------------------- ground & roads -------------------- */
  const asphaltTex = makeAsphaltTexture();
  asphaltTex.repeat.set(46, 46);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ map: asphaltTex, color: 0x6b6b7d, roughness: 0.96, metalness: 0.06 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  // Outer dark plain beyond the detailed ground
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshBasicMaterial({ color: 0x07070d })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.08;
  scene.add(outer);

  // Lane markings -------------------------------------------------
  const markGeoms = [];
  const dashColor = 0xd8d8c8;
  const yellow = 0xffcf5a;
  for (const r of ROAD_LINES) {
    // vertical roads (along z)
    for (const side of [-4, 4]) {
      for (let z = -210; z < 210; z += 7) {
        if (Math.abs(((z + 3) % 72 + 72) % 72 - 36) > 28) continue;
        const b = new THREE.BoxGeometry(0.16, 0.03, 3.2);
        paint(b, dashColor);
        transform(b, r + side, 0.035, z + 1.6);
        markGeoms.push(b);
      }
    }
    // center double yellow
    for (const side of [-0.26, 0.26]) {
      const b = new THREE.BoxGeometry(0.13, 0.03, 428);
      paint(b, yellow);
      transform(b, r + side, 0.034, 0);
      markGeoms.push(b);
    }
    // horizontal roads (along x)
    for (const side of [-4, 4]) {
      for (let x = -210; x < 210; x += 7) {
        if (Math.abs(((x + 3) % 72 + 72) % 72 - 36) > 28) continue;
        const b = new THREE.BoxGeometry(3.2, 0.03, 0.16);
        paint(b, dashColor);
        transform(b, x + 1.6, 0.035, r + side);
        markGeoms.push(b);
      }
    }
    for (const side of [-0.26, 0.26]) {
      const b = new THREE.BoxGeometry(428, 0.03, 0.13);
      paint(b, yellow);
      transform(b, 0, 0.034, r + side);
      markGeoms.push(b);
    }
  }

  // Crosswalks at intersections
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      for (const [ox, oz, horiz] of [[0, -9.4, true], [0, 9.4, true], [-9.4, 0, false], [9.4, 0, false]]) {
        for (let i = -6; i <= 6; i++) {
          const b = horiz
            ? new THREE.BoxGeometry(0.9, 0.03, 3.4)
            : new THREE.BoxGeometry(3.4, 0.03, 0.9);
          paint(b, 0xcfd2cc);
          transform(b, x + (horiz ? i * 1.18 : ox), 0.036, z + (horiz ? oz : i * 1.18));
          markGeoms.push(b);
        }
      }
    }
  }
  const marks = new THREE.Mesh(mergeGeoms(markGeoms), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.8, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  scene.add(marks);

  /* -------------------- sidewalks -------------------- */
  const sidewalkTex = makeSidewalkTexture();
  sidewalkTex.repeat.set(2.4, 2.4);
  const walkGeoms = [];
  const blockInfo = [];
  for (let i = 0; i < CITY.grid; i++) {
    for (let j = 0; j < CITY.grid; j++) {
      const cx = BLOCK_CENTERS[i];
      const cz = BLOCK_CENTERS[j];
      blockInfo.push({ cx, cz, i, j });
      const b = new THREE.BoxGeometry(CITY.block, 0.5, CITY.block);
      paint(b, 0xffffff);
      transform(b, cx, 0.25, cz);
      walkGeoms.push(b);
    }
  }
  const walks = new THREE.Mesh(mergeGeoms(walkGeoms), new THREE.MeshStandardMaterial({
    map: sidewalkTex, color: 0xbfc2cc, roughness: 0.92, metalness: 0.03,
  }));
  scene.add(walks);

  /* -------------------- buildings -------------------- */
  const facade = makeFacadeTextures(91);
  const wallGeoms = [];
  const propGeoms = [];
  const glowGeoms = [];
  const signMeshes = [];
  const buildingTops = [];

  const signTextures = [
    makeSignTexture('HOTEL', '#ff2d78'),
    makeSignTexture('RAMEN', '#4ef0e0'),
    makeSignTexture('CLUB 88', '#ff2d78'),
    makeSignTexture('MOTEL', '#ffc857'),
    makeSignTexture('24H', '#7aa8ff'),
    makeSignTexture('PAWN', '#ff7a3d'),
    makeSignTexture('LIQUOR', '#4ef0e0'),
    makeSignTexture('NOIR', '#b06bff'),
    makeSignTexture('ARCADE', '#ffc857'),
  ];
  const bladeTextures = [
    makeSignTexture('BAR', '#ff2d78', true),
    makeSignTexture('HOTEL', '#4ef0e0', true),
    makeSignTexture('SUSHI', '#ffc857', true),
    makeSignTexture('LIVE', '#b06bff', true),
  ];

  const parkPlateGeoms = [];
  const parkPathGeoms = [];
  const parkPropGeoms = [];
  const parkGlowGeoms = [];
  const lotPlateGeoms = [];
  const lotLineGeoms = [];
  const staticCarGeoms = [];

  function addPark(cx, cz) {
    const plate = new THREE.BoxGeometry(49, 0.2, 49);
    paint(plate, 0x1b3326);
    transform(plate, cx, 0.58, cz);
    parkPlateGeoms.push(plate);

    // crossing paths
    for (const [w, d] of [[7, 48], [48, 7]]) {
      const p = new THREE.BoxGeometry(w, 0.14, d);
      paint(p, 0x6d6a68);
      transform(p, cx, 0.66, cz);
      parkPathGeoms.push(p);
    }

    // fountain
    cylPart(parkPropGeoms, 5.2, 5.6, 0.9, 16, cx, 0.95, cz, 0x555566);
    cylPart(parkPropGeoms, 4.6, 4.6, 0.3, 16, cx, 1.42, cz, 0x2b3a44);
    const water = new THREE.CylinderGeometry(4.3, 4.3, 0.12, 18);
    paint(water, 0x2ad8e8);
    transform(water, cx, 1.56, cz);
    parkGlowGeoms.push(water);
    cylPart(parkPropGeoms, 0.7, 1.0, 2.2, 8, cx, 2.4, cz, 0x5b5c6e);
    const jet = new THREE.CylinderGeometry(0.1, 0.22, 3.4, 6);
    paint(jet, 0x8ffcff);
    transform(jet, cx, 3.6, cz);
    parkGlowGeoms.push(jet);

    // benches around fountain
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4;
      const bx = cx + Math.cos(a) * 8.5;
      const bz = cz + Math.sin(a) * 8.5;
      boxPart(parkPropGeoms, 2.4, 0.18, 0.7, bx, 1.05, bz, 0x4a3a2c, 0, -a, 0);
      boxPart(parkPropGeoms, 2.4, 0.5, 0.14, bx, 1.28, bz, 0x4a3a2c, 0, -a, 0);
    }

    // planters / hedges
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const hx = cx + Math.cos(a) * 21;
      const hz = cz + Math.sin(a) * 21;
      boxPart(parkPropGeoms, 4.5, 0.9, 1.4, hx, 1.05, hz, 0x1f3b2a, 0, -a, 0);
    }
  }

  function addParkingLot(cx, cz) {
    const plate = new THREE.BoxGeometry(49, 0.16, 49);
    paint(plate, 0x111119);
    transform(plate, cx, 0.58, cz);
    lotPlateGeoms.push(plate);

    for (let row = 0; row < 2; row++) {
      const z = cz - 12 + row * 24;
      for (let k = -3; k <= 3; k++) {
        const line = new THREE.BoxGeometry(0.14, 0.03, 7.5);
        paint(line, 0xb9b9a8);
        transform(line, cx + k * 6, 0.68, z);
        lotLineGeoms.push(line);
      }
      const bar = new THREE.BoxGeometry(42, 0.03, 0.14);
      paint(bar, 0xb9b9a8);
      transform(bar, cx, 0.68, z - 3.75);
      lotLineGeoms.push(bar);
    }

    // a couple of parked cars
    for (let k = 0; k < 3; k++) {
      const px = cx - 12 + k * 12;
      const pz = cz - 12 + (k % 2) * 24;
      const col = choose([0x6a6f82, 0x8a3346, 0x2f6a6a, 0x3a3a4a, 0x9a8b5a]);
      boxPart(staticCarGeoms, 1.9, 0.6, 4.2, px, 0.95, pz, col);
      boxPart(staticCarGeoms, 1.55, 0.55, 2.0, px, 1.5, pz + 0.1, 0x141822);
      for (const [wx, wz] of [[-0.95, -1.3], [0.95, -1.3], [-0.95, 1.3], [0.95, 1.3]]) {
        cylPart(staticCarGeoms, 0.36, 0.36, 0.26, 8, px + wx, 0.72, pz + wz, 0x0d0e14, 0, 0, Math.PI / 2);
      }
    }
  }

  function addBuilding(cx, cz, w, d, h) {
    const tint = choose(wallPalette);
    const wallColor = new THREE.Color(tint).multiplyScalar(0.9 + rng() * 0.28);
    const roofColor = new THREE.Color(0x14141d);
    const geo = new THREE.BoxGeometry(w, h, d);
    paint(geo, 0xffffff);

    // vertex colours: walls tinted, roof dark
    const cattr = geo.attributes.color;
    for (let f = 0; f < 6; f++) {
      const c = f === 2 ? roofColor : wallColor;
      for (let v = 0; v < 4; v++) cattr.setXYZ(f * 4 + v, c.r, c.g, c.b);
    }

    // per-face UV scaling so windows are a consistent physical size
    const uv = geo.attributes.uv;
    const uOff = Math.floor(rng() * 8) / 8;
    const vOff = Math.floor(rng() * 8) / 8;
    for (let f = 0; f < 6; f++) {
      let su, sv;
      if (f === 0 || f === 1) { su = d / 24; sv = h / 28; }
      else if (f === 2 || f === 3) { su = w / 24; sv = d / 24; }
      else { su = w / 24; sv = h / 28; }
      for (let v = 0; v < 4; v++) {
        const idx = f * 4 + v;
        uv.setXY(idx, uv.getX(idx) * su + uOff, uv.getY(idx) * sv + vOff);
      }
    }
    uv.needsUpdate = true;

    const baseY = 0.5;
    transform(geo, cx, baseY + h / 2, cz);
    wallGeoms.push(geo);
    buildingTops.push({ x: cx, z: cz, w, d, h: h + baseY });

    // rooftop clutter
    if (h > 14 && rng() < 0.7) {
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const bw = 2 + rng() * 4;
        const bd = 2 + rng() * 4;
        const bh = 1 + rng() * 2.4;
        boxPart(propGeoms, bw, bh, bd,
          cx + (rng() - 0.5) * (w - bw - 2),
          baseY + h + bh / 2,
          cz + (rng() - 0.5) * (d - bd - 2),
          0x2a2b36);
      }
    }
    if (h > 30 && rng() < 0.45) {
      cylPart(propGeoms, 1.3, 1.5, 2.4, 8,
        cx + (rng() - 0.5) * (w - 6), baseY + h + 2.4,
        cz + (rng() - 0.5) * (d - 6), 0x353644);
      // antenna
      cylPart(propGeoms, 0.07, 0.07, 8 + rng() * 8, 5,
        cx + (rng() - 0.5) * (w - 4), baseY + h + 6,
        cz + (rng() - 0.5) * (d - 4), 0x5a5c6e);
    }

    // storefront neon strips along both street-facing sides
    const faces = [cx >= 0 ? 'px' : 'nx', cz >= 0 ? 'pz' : 'nz'];
    for (const face of faces) {
      const stripCount = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < stripCount; k++) {
        const c = new THREE.Color(choose(neonPalette));
        const len = 2.5 + rng() * 3.5;
        const t = (k / Math.max(1, stripCount - 1) - 0.5) * 0.72;
        if (face === 'px' || face === 'nx') {
          const sx = cx + (face === 'px' ? 1 : -1) * (w / 2 + 0.16);
          const sz = cz + t * d;
          const b = new THREE.BoxGeometry(0.16, 2.6 + rng() * 1.6, len);
          paint(b, c);
          transform(b, sx, baseY + 1.9, sz);
          glowGeoms.push(b);
        } else {
          const sz = cz + (face === 'pz' ? 1 : -1) * (d / 2 + 0.16);
          const sx = cx + t * w;
          const b = new THREE.BoxGeometry(len, 2.6 + rng() * 1.6, 0.16);
          paint(b, c);
          transform(b, sx, baseY + 1.9, sz);
          glowGeoms.push(b);
        }
      }
      // warm awning / lobby glow at ground level
      if (rng() < 0.6) {
        const len = Math.min(10, (face === 'px' || face === 'nx' ? d : w) * 0.55);
        const c = new THREE.Color(rng() < 0.5 ? 0xffd08a : 0x7fd8ff);
        if (face === 'px' || face === 'nx') {
          const b = new THREE.BoxGeometry(0.14, 0.7, len);
          paint(b, c);
          transform(b, cx + (face === 'px' ? 1 : -1) * (w / 2 + 0.15), baseY + 0.9, cz);
          glowGeoms.push(b);
        } else {
          const b = new THREE.BoxGeometry(len, 0.7, 0.14);
          paint(b, c);
          transform(b, cx, baseY + 0.9, cz + (face === 'pz' ? 1 : -1) * (d / 2 + 0.15));
          glowGeoms.push(b);
        }
      }
    }

    // neon sign on a facade
    if (h > 18 && rng() < 0.5 && signMeshes.length < 26) {
      const tex = choose(signTextures);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
      mat.userData.flicker = 0.82 + rng() * 0.18;
      mat.userData.phase = rng() * 10;
      signMats.push(mat);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), mat);
      const face2 = rng() < 0.5 ? 'px' : 'nx';
      const sy = baseY + 6 + rng() * Math.min(18, h - 10);
      if (face2 === 'px') {
        plane.position.set(cx + w / 2 + 0.2, sy, cz + (rng() - 0.5) * d * 0.4);
        plane.rotation.y = Math.PI / 2;
      } else {
        plane.position.set(cx - w / 2 - 0.2, sy, cz + (rng() - 0.5) * d * 0.4);
        plane.rotation.y = -Math.PI / 2;
      }
      signMeshes.push(plane);
      scene.add(plane);

      // glow halo behind the sign
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: new THREE.Color(neonPalette[Math.floor(rng() * neonPalette.length)]),
        transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.position.copy(plane.position);
      halo.scale.set(13, 5, 1);
      scene.add(halo);
    }

    // vertical blade sign
    if (h > 24 && rng() < 0.32 && signMeshes.length < 32) {
      const tex = choose(bladeTextures);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide });
      mat.userData.flicker = 0.9;
      mat.userData.phase = rng() * 10;
      signMats.push(mat);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 9.6), mat);
      const sy = baseY + 8 + rng() * Math.min(20, h - 12);
      plane.position.set(cx + w / 2 + 1.3, sy, cz + (rng() - 0.5) * d * 0.5);
      plane.rotation.y = Math.PI / 2;
      scene.add(plane);
      signMeshes.push(plane);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0x33343f }));
      arm.position.set(cx + w / 2 + 0.6, sy + 4.6, plane.position.z);
      scene.add(arm);
    }
  }

  // Blocks ---------------------------------------------------------
  for (const blk of blockInfo) {
    const { cx, cz, i, j } = blk;
    const distCenter = Math.hypot(cx, cz);
    const nearStart = Math.abs(cx) < 50 && Math.abs(cz) < 50;

    // park blocks near spawn + a few random
    if ((i === 3 && j === 2) || (!nearStart && rng() < 0.07)) {
      parks.add(`${i},${j}`);
      addPark(cx, cz);
      continue;
    }

    // parking lot
    if (rng() < 0.08) {
      addParkingLot(cx, cz);
      continue;
    }

    const roll = rng();
    const maxH = 22 + (1 - clamp(distCenter / 300, 0, 1)) * 52;
    if (roll < 0.3) {
      // single tower
      const w = 24 + rng() * 18;
      const d = 24 + rng() * 18;
      const h = 16 + rng() * maxH;
      addBuilding(cx + (rng() - 0.5) * 4, cz + (rng() - 0.5) * 4, w, d, h);
    } else if (roll < 0.62) {
      // two buildings, split along a random axis
      const alongX = rng() < 0.5;
      for (const s of [-1, 1]) {
        const w = alongX ? 17 + rng() * 7 : 26 + rng() * 12;
        const d = alongX ? 26 + rng() * 12 : 17 + rng() * 7;
        const off = 13;
        const h = 12 + rng() * maxH;
        addBuilding(
          cx + (alongX ? s * off : (rng() - 0.5) * 4),
          cz + (alongX ? (rng() - 0.5) * 4 : s * off),
          w, d, h
        );
      }
    } else {
      // four smaller buildings
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const w = 15 + rng() * 7;
          const d = 15 + rng() * 7;
          const h = 10 + rng() * maxH * 0.85;
          addBuilding(cx + sx * 12.5, cz + sz * 12.5, w, d, h);
        }
      }
    }
  }

  // Landmark tower -------------------------------------------------
  addBuilding(-108, -108, 38, 38, 118);
  addBuilding(108, -108, 34, 34, 96);
  addBuilding(-108, 108, 30, 30, 74);

  // Park & parking-lot surfaces ------------------------------------
  if (parkPlateGeoms.length) {
    scene.add(new THREE.Mesh(mergeGeoms(parkPlateGeoms), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
  }
  if (parkPathGeoms.length) {
    scene.add(new THREE.Mesh(mergeGeoms(parkPathGeoms), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
  }
  if (parkPropGeoms.length) {
    scene.add(new THREE.Mesh(mergeGeoms(parkPropGeoms), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.25 })));
  }
  if (parkGlowGeoms.length) {
    scene.add(new THREE.Mesh(mergeGeoms(parkGlowGeoms), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  }
  if (lotPlateGeoms.length) {
    scene.add(new THREE.Mesh(mergeGeoms(lotPlateGeoms), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98 })));
  }
  if (lotLineGeoms.length) {
    scene.add(new THREE.Mesh(mergeGeoms(lotLineGeoms), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
  }
  if (staticCarGeoms.length) {
    scene.add(new THREE.Mesh(mergeGeoms(staticCarGeoms), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 })));
  }

  // Distant skyline ring ------------------------------------------
  const skylineGeoms = [];
  for (let k = 0; k < 46; k++) {
    const a = (k / 46) * TAU + rng() * 0.06;
    const r = 300 + rng() * 190;
    const w = 18 + rng() * 34;
    const d = 18 + rng() * 34;
    const h = 30 + rng() * 120;
    const g = new THREE.BoxGeometry(w, h, d);
    paint(g, choose(wallPalette));
    transform(g, Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r, 0, rng() * TAU, 0);
    skylineGeoms.push(g);
  }
  const skyline = new THREE.Mesh(mergeGeoms(skylineGeoms), new THREE.MeshBasicMaterial({
    color: 0x161422, fog: true,
  }));
  scene.add(skyline);

  // Building walls mesh
  const wallMat = new THREE.MeshStandardMaterial({
    map: facade.map,
    emissiveMap: facade.emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 1.45,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.12,
  });
  const walls = new THREE.Mesh(mergeGeoms(wallGeoms), wallMat);
  scene.add(walls);

  const props = new THREE.Mesh(mergeGeoms(propGeoms), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.8, metalness: 0.35,
  }));
  scene.add(props);

  const glowMesh = new THREE.Mesh(mergeGeoms(glowGeoms), new THREE.MeshBasicMaterial({
    vertexColors: true, toneMapped: false,
  }));
  scene.add(glowMesh);

  // colliders from building footprints
  // (rebuilt from buildingTops so rooftop clutter is ignored)
  for (const b of buildingTops) {
    colliders.push({
      minX: b.x - b.w / 2,
      maxX: b.x + b.w / 2,
      minZ: b.z - b.d / 2,
      maxZ: b.z + b.d / 2,
      height: b.h,
    });
  }

  /* -------------------- trees / parks -------------------- */
  const treeSpots = [];
  for (const key of parks) {
    const [i, j] = key.split(',').map(Number);
    const cx = BLOCK_CENTERS[i];
    const cz = BLOCK_CENTERS[j];
    for (let k = 0; k < 13; k++) {
      treeSpots.push({
        x: cx + (rng() - 0.5) * 40,
        z: cz + (rng() - 0.5) * 40,
        s: 0.8 + rng() * 0.8,
      });
    }
  }
  // street trees
  for (const r of ROAD_LINES) {
    for (let t = -200; t <= 200; t += 36) {
      if (rng() < 0.35) {
        treeSpots.push({ x: r + (rng() < 0.5 ? -9.4 : 9.4), z: t + rng() * 8, s: 0.55 + rng() * 0.4 });
      }
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 3, 6);
  const leafGeo = new THREE.IcosahedronGeometry(1.9, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x3a2b22, roughness: 0.95 }), treeSpots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x214a35, roughness: 0.9, flatShading: true }), treeSpots.length);
  const dummy = new THREE.Object3D();
  treeSpots.forEach((t, idx) => {
    dummy.position.set(t.x, 1.6 * t.s + 0.5, t.z);
    dummy.scale.set(t.s, t.s, t.s);
    dummy.rotation.y = rng() * TAU;
    dummy.updateMatrix();
    trunks.setMatrixAt(idx, dummy.matrix);
    dummy.position.set(t.x, 4.1 * t.s + 0.5, t.z);
    dummy.scale.set(t.s * (0.85 + rng() * 0.3), t.s * (0.9 + rng() * 0.4), t.s * (0.85 + rng() * 0.3));
    dummy.updateMatrix();
    leaves.setMatrixAt(idx, dummy.matrix);
    leaves.setColorAt(idx, new THREE.Color().setHSL(0.34 + rng() * 0.05, 0.35, 0.16 + rng() * 0.08));
  });
  scene.add(trunks, leaves);

  /* -------------------- street lights -------------------- */
  const lampSpots = [];
  for (const r of ROAD_LINES) {
    let flip = false;
    for (let t = -198; t <= 198; t += 36) {
      flip = !flip;
      const side = flip ? 1 : -1;
      lampSpots.push({ x: r + side * 8.7, z: t, rot: side > 0 ? Math.PI : 0 });
    }
  }
  const visibleLamps = lampSpots;

  const poleParts = [];
  cylPart(poleParts, 0.1, 0.16, 7, 6, 0, 3.5, 0, 0x3a3c4c);
  boxPart(poleParts, 2.5, 0.12, 0.12, 1.15, 6.95, 0, 0x3a3c4c);
  boxPart(poleParts, 0.6, 0.16, 0.32, 2.3, 6.9, 0, 0x35364a);
  const poleGeo = mergeGeoms(poleParts);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.5 }), visibleLamps.length);
  const bulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.22, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffe0a8, toneMapped: false }),
    visibleLamps.length
  );
  const poolGeo = new THREE.PlaneGeometry(16, 16);
  const pools = new THREE.InstancedMesh(
    poolGeo,
    new THREE.MeshBasicMaterial({ map: makeLightPoolTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95, toneMapped: false }),
    visibleLamps.length
  );
  visibleLamps.forEach((l, idx) => {
    dummy.position.set(l.x, 0.5, l.z);
    dummy.rotation.set(0, l.rot, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(idx, dummy.matrix);

    const bx = l.x + Math.cos(l.rot) * 2.3;
    const bz = l.z - Math.sin(l.rot) * 2.3;
    dummy.position.set(bx, 7.0, bz);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bulbs.setMatrixAt(idx, dummy.matrix);
    lampBulbs.push(new THREE.Vector3(bx, 6.9, bz));

    dummy.position.set(bx, 0.06, bz);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.updateMatrix();
    pools.setMatrixAt(idx, dummy.matrix);
  });
  pools.instanceMatrix.needsUpdate = true;
  poles.instanceMatrix.needsUpdate = true;
  bulbs.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  scene.add(poles, bulbs, pools);

  const bulbGeo = new THREE.BufferGeometry().setFromPoints(lampBulbs);
  const bulbGlow = new THREE.Points(bulbGeo, new THREE.PointsMaterial({
    map: glowTex, color: 0xffd9a0, size: 3.4, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(bulbGlow);

  /* -------------------- traffic lights -------------------- */
  const signalGeoms = [];
  const signalLens = [];
  const sigRed = new THREE.Color(0xff2b45);
  const sigGreen = new THREE.Color(0x3dffa8);
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      for (const [dx, dz] of [[-8.9, -8.9], [8.9, 8.9]]) {
        cylPart(signalGeoms, 0.09, 0.11, 4.6, 5, x + dx, 2.8, z + dz, 0x2c2d38);
        boxPart(signalGeoms, 0.5, 1.35, 0.42, x + dx, 5.2, z + dz, 0x1c1d26);
        const green = (Math.round(x / 72) + Math.round(z / 72)) % 2 === 0;
        const g1 = new THREE.BoxGeometry(0.32, 0.32, 0.08);
        paint(g1, green ? sigGreen : sigRed);
        transform(g1, x + dx, 5.62, z + dz + (dz > 0 ? -0.24 : 0.24));
        signalLens.push(g1);
        const g2 = new THREE.BoxGeometry(0.32, 0.32, 0.08);
        paint(g2, green ? sigRed : sigGreen);
        transform(g2, x + dx, 4.86, z + dz + (dz > 0 ? -0.24 : 0.24));
        signalLens.push(g2);
      }
    }
  }
  const signals = new THREE.Mesh(mergeGeoms(signalGeoms), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.4 }));
  const lenses = new THREE.Mesh(mergeGeoms(signalLens), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  scene.add(signals, lenses);

  // glow points at signal lenses
  const lensPos = [];
  const lensCol = [];
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      const green = (Math.round(x / 72) + Math.round(z / 72)) % 2 === 0;
      for (const [dx, dz] of [[-8.9, -8.9], [8.9, 8.9]]) {
        lensPos.push(x + dx, 5.6, z + dz + (dz > 0 ? -0.24 : 0.24));
        const c = green ? sigGreen : sigRed;
        lensCol.push(c.r, c.g, c.b);
        lensPos.push(x + dx, 4.86, z + dz + (dz > 0 ? -0.24 : 0.24));
        const c2 = green ? sigRed : sigGreen;
        lensCol.push(c2.r, c2.g, c2.b);
      }
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lensPos, 3));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(lensCol, 3));
  const lensGlow = new THREE.Points(lg, new THREE.PointsMaterial({
    map: glowTex, size: 1.7, vertexColors: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(lensGlow);

  /* -------------------- billboard -------------------- */
  {
    const [bc, bg] = (() => {
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 512;
      return [c, c.getContext('2d')];
    })();
    bg.fillStyle = '#08060f';
    bg.fillRect(0, 0, 1024, 512);
    bg.strokeStyle = '#ff2d78';
    bg.lineWidth = 14;
    bg.shadowColor = '#ff2d78';
    bg.shadowBlur = 40;
    bg.strokeRect(24, 24, 976, 464);
    bg.fillStyle = '#4ef0e0';
    bg.font = 'italic bold 150px "Arial Black", Impact, sans-serif';
    bg.textAlign = 'center';
    bg.shadowColor = '#4ef0e0';
    bg.shadowBlur = 40;
    bg.fillText('NIGHT', 512, 205);
    bg.fillStyle = '#ff2d78';
    bg.shadowColor = '#ff2d78';
    bg.fillText('CITY', 512, 360);
    bg.fillStyle = '#ffffff';
    bg.font = 'bold 34px monospace';
    bg.shadowBlur = 18;
    bg.fillText('LIVE  ·  LOUD  ·  FOREVER', 512, 448);
    const tex = new THREE.CanvasTexture(bc);
    tex.colorSpace = THREE.SRGBColorSpace;
    const bb = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 21),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
    );
    bb.position.set(-128, 62, -84);
    bb.rotation.y = 0.42;
    scene.add(bb);
    const bbGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xff2d78, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    bbGlow.position.copy(bb.position);
    bbGlow.scale.set(70, 40, 1);
    scene.add(bbGlow);
  }

  /* -------------------- pickups -------------------- */
  const cashTex = makeCashTexture();
  const pickupSpots = [];
  for (let k = 0; k < 26; k++) {
    const road = choose(ROAD_LINES);
    const t = -190 + rng() * 380;
    pickupSpots.push(new THREE.Vector3(road + (rng() < 0.5 ? -4 : 4), 1.2, t));
  }
  const pickupsGroup = new THREE.Group();
  scene.add(pickupsGroup);
  for (let k = 0; k < 8; k++) {
    const mat = new THREE.SpriteMaterial({ map: cashTex, color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false });
    const s = new THREE.Sprite(mat);
    const p = pickupSpots[k];
    s.position.copy(p);
    s.scale.setScalar(2.6);
    s.userData.baseY = 1.2;
    s.userData.phase = rng() * TAU;
    s.userData.active = true;
    pickupsGroup.add(s);
    pickups.push(s);
  }

  /* -------------------- animation -------------------- */
  const clock = { t: 0 };
  function animate(dt) {
    clock.t += dt;
    for (const m of signMats) {
      const f = m.userData.flicker;
      const ph = m.userData.phase;
      const flick = Math.sin(clock.t * 7 + ph) > 0.96 ? 0.35 : 1;
      m.opacity = f * flick;
    }
    for (const p of pickups) {
      p.position.y = p.userData.baseY + Math.sin(clock.t * 2.4 + p.userData.phase) * 0.22;
      p.material.rotation = clock.t * 0.8;
    }
    // gentle pulse of city fill
    cityFill.intensity = 0.3 + Math.sin(clock.t * 0.7) * 0.04;
  }

  return {
    colliders,
    pickups,
    pickupSpots,
    parks,
    animate,
    cityFill,
    lampBulbs,
    roadLines: ROAD_LINES,
    blockCenters: BLOCK_CENTERS,
    facade,
  };
}
