import * as THREE from '../vendor/three.module.js';
import {
  Rand, canvasTexture, glowTexture, textTexture, addMerged, scaleBoxUV,
  groundPlane, boxAt, cylAt, clamp, TAU,
} from './util.js';

export const ROAD_COORDS = [-192, -128, -64, 0, 64, 128, 192];
export const ROAD_W = 16;
export const BLOCK = 64;
export const CITY_HALF = 192;
export const BLOCK_CENTERS = [-160, -96, -32, 32, 96, 160];
export const BOUNDARY = 233;

const GROUND_Y = 0.16;
const NEON_WORDS = [
  ['MADOUT', 'MOTORS'], ['HOTEL', 'NO VACANCY'], ['CLUB 64', 'OPEN ALL NITE'],
  ['TURBO', 'PARTS & FUEL'], ['24/7', 'LIQUOR'], ['NOODLES', 'HOT & FAST'],
  ['PAWN', 'CASH FOR CARS'], ['VICE', 'NEON LOUNGE'], ['DINER', 'BURGERS'],
  ['GARAGE', 'REPAIR'], ['CASINO', 'JACKPOT'], ['MOTEL', 'ROOMS BY HOUR'],
  ['SUSHI', 'FRESH DAILY'], ['TATTOO', 'NO REGRETS'], ['BEACH', 'THIS WAY'],
  ['ARCADE', '1 CREDIT'],
];

/* ------------------------------------------------------------------ */
/* Facade texture factory                                             */
/* ------------------------------------------------------------------ */
function facadeMaterial(style, seed) {
  const rand = new Rand(seed);
  const W = 256, H = 256;
  const rows = 2, cols = 2;
  const lit = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) lit.push(rand.chance(style.litChance));

  const drawWindows = (ctx, emissive) => {
    if (!emissive) {
      ctx.fillStyle = style.base;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = `rgba(0,0,0,${rand.range(0.015, 0.09)})`;
        ctx.fillRect(rand.range(0, W), rand.range(0, H), rand.range(1, 5), rand.range(1, 5));
      }
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = `rgba(255,255,255,${rand.range(0.01, 0.05)})`;
        ctx.fillRect(rand.range(0, W), rand.range(0, H), rand.range(1, 4), 1);
      }
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    }

    for (let r = 0; r < rows; r++) {
      const y0 = r * (H / rows);
      if (!emissive) {
        ctx.fillStyle = style.trim;
        ctx.fillRect(0, y0, W, 7);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, y0 + 7, W, 3);
      }
      for (let c = 0; c < cols; c++) {
        const x = 22 + c * (W / cols);
        const y = y0 + 26;
        const ww = 86, hh = 76;
        const isLit = lit[r * cols + c];
        if (emissive) {
          if (!isLit) continue;
          const g = ctx.createLinearGradient(x, y, x + ww, y + hh);
          g.addColorStop(0, style.lit);
          g.addColorStop(0.55, style.lit2 || style.lit);
          g.addColorStop(1, style.lit);
          ctx.fillStyle = g;
          ctx.fillRect(x, y, ww, hh);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          if (rand.chance(0.5)) ctx.fillRect(x + ww * 0.48, y, 4, hh);
          ctx.fillRect(x, y + hh * 0.55, ww, 3);
          continue;
        }
        // frame + glass
        ctx.fillStyle = style.frame;
        ctx.fillRect(x - 5, y - 5, ww + 10, hh + 10);
        const g = ctx.createLinearGradient(x, y, x + ww, y + hh);
        g.addColorStop(0, style.glass0);
        g.addColorStop(0.5, style.glass1);
        g.addColorStop(1, style.glass0);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, ww, hh);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath();
        ctx.moveTo(x, y + hh * 0.72);
        ctx.lineTo(x + ww, y + hh * 0.18);
        ctx.lineTo(x + ww, y + hh * 0.38);
        ctx.lineTo(x, y + hh * 0.92);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = style.frame;
        ctx.fillRect(x + ww * 0.49, y, 3, hh);
        ctx.fillRect(x, y + hh * 0.56, ww, 3);
        if (isLit) {
          ctx.fillStyle = 'rgba(255,196,120,0.32)';
          ctx.fillRect(x, y, ww, hh);
        }
      }
    }
  };

  const map = canvasTexture(W, H, (ctx) => drawWindows(ctx, false));
  const emissiveMap = canvasTexture(W, H, (ctx) => drawWindows(ctx, true));
  const mat = new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.62,
    roughness: style.roughness ?? 0.82,
    metalness: style.metalness ?? 0.08,
  });
  return mat;
}

const FACADE_STYLES = [
  { // warm concrete
    base: '#c9b596', trim: '#a99474', frame: '#4b4a4a', glass0: '#26323d', glass1: '#516a79',
    lit: '#ffbf72', lit2: '#ffe2ae', litChance: 0.34,
  },
  { // teal glass tower
    base: '#3f6570', trim: '#2d4b54', frame: '#22333a', glass0: '#173542', glass1: '#5fa6b4',
    lit: '#9fe8ff', lit2: '#e8fbff', litChance: 0.24, roughness: 0.45, metalness: 0.3,
  },
  { // brick
    base: '#9d5b49', trim: '#7c4436', frame: '#3a2b26', glass0: '#2b2622', glass1: '#6d5a45',
    lit: '#ffb066', lit2: '#ffd9a0', litChance: 0.42,
  },
  { // modern dark
    base: '#353c47', trim: '#262c35', frame: '#151a21', glass0: '#1c2733', glass1: '#5b7486',
    lit: '#ffc078', lit2: '#d7ecff', litChance: 0.3, roughness: 0.6, metalness: 0.2,
  },
  { // sand
    base: '#d9c7a4', trim: '#b8a482', frame: '#5a5147', glass0: '#2a3a42', glass1: '#6e8b92',
    lit: '#ffcf8a', lit2: '#fff0d0', litChance: 0.36,
  },
  { // pale deco
    base: '#dfe2df', trim: '#b9bdb9', frame: '#4b5559', glass0: '#2e414b', glass1: '#88a9ad',
    lit: '#ffbe78', lit2: '#fff2d4', litChance: 0.3,
  },
];

/* ------------------------------------------------------------------ */
/* World                                                              */
/* ------------------------------------------------------------------ */
export class World {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this.rand = new Rand(20261031);
    this.group = new THREE.Group();
    this.group.name = 'city';
    scene.add(this.group);

    this.colliders = [];
    this.buildings = [];
    this.parks = [];
    this.roadCoords = ROAD_COORDS;
    this.signs = [];
    this.clouds = [];
    this.lampLights = [];
    this.time = 0;

    this._buildLights();
    this._buildSky();
    this._buildOcean();
    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildProps();
    this._buildBeach();
    this._buildSkyline();
    this._buildBoundary();
  }

  /* ---------------- lighting / sky ---------------- */
  _buildLights() {
    const scene = this.scene;
    this.sunDir = new THREE.Vector3(-0.62, 0.24, -0.75).normalize();

    const hemi = new THREE.HemisphereLight(0xffc9a0, 0x3a4058, 1.35);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffc38c, 3.1);
    sun.position.copy(this.sunDir).multiplyScalar(180);
    sun.castShadow = true;
    const size = this.quality === 'low' ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.camera.left = -85;
    sun.shadow.camera.right = 85;
    sun.shadow.camera.top = 85;
    sun.shadow.camera.bottom = -85;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    // soft fill from the opposite side so silhouettes stay readable
    const fill = new THREE.DirectionalLight(0x6f8ee0, 0.6);
    fill.position.set(120, 90, 140);
    scene.add(fill);

    const bounce = new THREE.DirectionalLight(0xff9a5c, 0.25);
    bounce.position.set(-40, 14, 120);
    scene.add(bounce);

    scene.fog = new THREE.Fog(0xd08a62, 230, 1450);
    scene.background = new THREE.Color(0x1a2038);
  }

  _buildSky() {
    const uniforms = {
      uSun: { value: this.sunDir.clone() },
      uTop: { value: new THREE.Color(0x111a3d) },
      uMid: { value: new THREE.Color(0x5b4a8a) },
      uHorizon: { value: new THREE.Color(0xff8a4a) },
      uSunColor: { value: new THREE.Color(0xffd9a0) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uSun, uTop, uMid, uHorizon, uSunColor;
        void main() {
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.30, h));
          col = mix(col, uTop, smoothstep(0.22, 0.85, h));
          float sun = max(dot(normalize(vDir), normalize(uSun)), 0.0);
          col += uSunColor * pow(sun, 900.0) * 3.2;
          col += uSunColor * pow(sun, 18.0) * 0.45;
          col += vec3(1.0, 0.55, 0.32) * pow(sun, 4.0) * 0.16;
          // thin warm cloud bands near the horizon
          float band = sin(vDir.y * 46.0 + vDir.x * 5.0) * 0.5 + 0.5;
          float mask = smoothstep(0.02, 0.09, vDir.y) * (1.0 - smoothstep(0.10, 0.26, vDir.y));
          col += vec3(1.0, 0.5, 0.36) * band * mask * 0.055;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 20), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.group.add(sky);

    // sun glow sprite
    const sunTex = glowTexture('rgba(255,220,170,0.95)', 'rgba(255,120,40,0)');
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex, color: 0xffd9a8, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sunSprite.position.copy(this.sunDir).multiplyScalar(1250);
    sunSprite.scale.set(420, 420, 1);
    sunSprite.renderOrder = -9;
    this.group.add(sunSprite);

    // clouds
    const cloudTex = canvasTexture(256, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const x = 20 + Math.random() * (w - 40);
        const y = 40 + Math.random() * (h - 70);
        const r = 18 + Math.random() * 34;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,205,190,0.30)');
        g.addColorStop(0.6, 'rgba(255,160,140,0.12)');
        g.addColorStop(1, 'rgba(255,150,130,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    }, { wrap: false });
    const cloudMat = new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, depthWrite: false, opacity: 0.85,
      color: 0xffc4ae, fog: false,
    });
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(cloudMat);
      const ang = (i / 12) * TAU + this.rand.range(-0.2, 0.2);
      const dist = this.rand.range(700, 1300);
      s.position.set(Math.cos(ang) * dist, this.rand.range(90, 260), Math.sin(ang) * dist);
      const sc = this.rand.range(220, 460);
      s.scale.set(sc, sc * 0.42, 1);
      s.renderOrder = -8;
      this.group.add(s);
      this.clouds.push({ sprite: s, speed: this.rand.range(0.4, 1.2) });
    }
  }

  _buildOcean() {
    const uniforms = {
      uTime: { value: 0 },
      uSun: { value: this.sunDir.clone() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform float uTime;
        uniform vec3 uSun;
        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.4);
          vec3 deep = vec3(0.008, 0.055, 0.09);
          vec3 shallow = vec3(0.035, 0.235, 0.30);
          vec3 col = mix(deep, shallow, fres);
          float w = sin(vWorld.x * 0.085 + uTime * 0.55) * sin(vWorld.z * 0.062 - uTime * 0.38);
          col += vec3(0.018, 0.045, 0.05) * w;
          vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
          float glint = pow(max(dot(R, normalize(uSun)), 0.0), 80.0);
          col += vec3(1.0, 0.62, 0.30) * glint * 1.4;
          float d = length(vWorld.xz);
          col = mix(col, vec3(0.78, 0.44, 0.30), smoothstep(700.0, 1700.0, d) * 0.9);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), mat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -1.1;
    ocean.receiveShadow = false;
    this.group.add(ocean);
    this.oceanUniforms = uniforms;
  }

  _buildGround() {
    // sand ring
    const sandTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#b99a72';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const c = Math.random() > 0.5 ? 'rgba(255,235,200,0.12)' : 'rgba(80,55,35,0.12)';
        ctx.fillStyle = c;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
    }, { repeat: [42, 42] });
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(780, 780), new THREE.MeshStandardMaterial({
      map: sandTex, roughness: 1, metalness: 0,
    }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = -0.3;
    sand.receiveShadow = true;
    this.group.add(sand);

    // city base
    const asphaltTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#22242a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2200; i++) {
        const c = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.10)';
        ctx.fillStyle = c;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    }, { repeat: [26, 26] });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(470, 470), new THREE.MeshStandardMaterial({
      map: asphaltTex, roughness: 0.96, metalness: 0.02, color: 0x9a9a9a,
    }));
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0;
    base.receiveShadow = true;
    this.group.add(base);
  }

  /* ---------------- roads ---------------- */
  _buildRoads() {
    const roadTex = canvasTexture(128, 512, (ctx, w, h) => {
      ctx.fillStyle = '#24262c';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      // tire polish
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fillRect(18, 0, 16, h);
      ctx.fillRect(94, 0, 16, h);
      // edge lines
      ctx.fillStyle = 'rgba(235,235,225,0.72)';
      ctx.fillRect(6, 0, 3, h);
      ctx.fillRect(w - 9, 0, 3, h);
      // center double yellow
      ctx.fillStyle = 'rgba(238,190,70,0.85)';
      ctx.fillRect(61, 0, 2.5, h);
      ctx.fillRect(66, 0, 2.5, h);
      // dashed lane lines
      ctx.fillStyle = 'rgba(235,235,225,0.55)';
      for (let y = 0; y < h; y += 96) {
        ctx.fillRect(33, y + 8, 3, 44);
        ctx.fillRect(w - 36, y + 8, 3, 44);
      }
    }, { repeat: [1, 27.5] });

    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, metalness: 0.03 });
    const entries = [];
    const len = CITY_HALF * 2 + ROAD_W;
    for (const r of ROAD_COORDS) {
      const g1 = new THREE.PlaneGeometry(ROAD_W, len);
      g1.rotateX(-Math.PI / 2);
      g1.translate(r, 0.015, 0);
      entries.push({ geo: g1 });
      const g2 = new THREE.PlaneGeometry(ROAD_W, len);
      g2.rotateX(-Math.PI / 2);
      g2.rotateY(Math.PI / 2);
      g2.translate(0, 0.015, r);
      entries.push({ geo: g2 });
    }
    addMerged(this.group, roadMat, entries, { shadow: false, receive: true });

    // plain asphalt intersections
    const plainTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#24262c';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    }, { repeat: [3, 3] });
    const plainMat = new THREE.MeshStandardMaterial({ map: plainTex, roughness: 0.93 });
    const patches = [];
    for (const x of ROAD_COORDS) for (const z of ROAD_COORDS) {
      patches.push({ geo: groundPlane(ROAD_W + 0.2, ROAD_W + 0.2, x, z, 0.025) });
    }
    addMerged(this.group, plainMat, patches, { shadow: false });

    // zebra crossings
    const stripes = [];
    const stripeGeo = new THREE.PlaneGeometry(1.15, 3.2);
    stripeGeo.rotateX(-Math.PI / 2);
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xe9e6d8, roughness: 0.8, transparent: true, opacity: 0.8,
    });
    const inst = new THREE.InstancedMesh(stripeGeo, stripeMat, ROAD_COORDS.length * ROAD_COORDS.length * 4 * 6);
    let i = 0;
    const m = new THREE.Matrix4();
    for (const x of ROAD_COORDS) for (const z of ROAD_COORDS) {
      for (const side of [-1, 1]) {
        for (let k = 0; k < 6; k++) {
          const off = -6.9 + k * 2.75;
          m.makeTranslation(x + off, 0.045, z + side * 10.7);
          inst.setMatrixAt(i++, m);
          m.makeTranslation(x + side * 10.7, 0.045, z + off);
          inst.setMatrixAt(i++, m);
        }
      }
    }
    inst.count = i;
    inst.instanceMatrix.needsUpdate = true;
    inst.receiveShadow = true;
    this.group.add(inst);
  }

  /* ---------------- blocks / buildings ---------------- */
  _buildBlocks() {
    this.facadeMats = FACADE_STYLES.map((s, idx) => facadeMaterial(s, 77 + idx * 131));

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b3d44, roughness: 0.92 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.9 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x777b82, roughness: 0.5, metalness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1d2128, roughness: 0.9 });
    this.roofMat = roofMat; this.baseMat = baseMat; this.metalMat = metalMat; this.darkMat = darkMat;

    const sidewalkTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#9a9791';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(50,48,45,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 32); ctx.lineTo(w, i * 32); ctx.stroke();
      }
      for (let i = 0; i < 500; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    }, { repeat: [10, 10] });
    const sidewalkMat = new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.95 });

    const grassTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#3f6b3a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1800; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(150,200,110,0.16)' : 'rgba(20,50,20,0.20)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 3);
      }
    }, { repeat: [8, 8] });
    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
    this.grassMat = grassMat;

    const sidewalkEntries = [];
    const styleEntries = this.facadeMats.map(() => []);
    const roofEntries = [], baseEntries = [], acEntries = [], antennaEntries = [];

    const parks = new Set(['96:-96', '-96:96', '-32:-32']);

    for (const bx of BLOCK_CENTERS) {
      for (const bz of BLOCK_CENTERS) {
        // sidewalk slab
        sidewalkEntries.push({ geo: boxAt(48, 0.16, 48, bx, 0.08, bz) });

        const key = `${bx}:${bz}`;
        if (parks.has(key) || this.rand.chance(0.055)) {
          this._buildPark(bx, bz, grassMat);
          continue;
        }

        const downtown = 1 - Math.min(1, Math.hypot(bx, bz) / 235);
        const lots = this._splitLots(bx, bz, downtown);
        for (const lot of lots) {
          if (this.rand.chance(0.11)) continue;
          const w = this.rand.range(lot.w * 0.66, lot.w * 0.94);
          const d = this.rand.range(lot.d * 0.66, lot.d * 0.94);
          let h = this.rand.range(9, 24) + downtown * downtown * this.rand.range(6, 54);
          if (downtown > 0.72 && this.rand.chance(0.18)) h = this.rand.range(58, 92);
          h = Math.round(h);
          const x = lot.x + this.rand.range(-(lot.w - w) * 0.35, (lot.w - w) * 0.35);
          const z = lot.z + this.rand.range(-(lot.d - d) * 0.35, (lot.d - d) * 0.35);
          const style = this.rand.int(0, FACADE_STYLES.length - 1);
          const g = new THREE.BoxGeometry(w, h, d);
          scaleBoxUV(g, w, h, d);
          g.translate(x, GROUND_Y + h / 2, z);
          styleEntries[style].push({ geo: g });

          // street-level stone band
          baseEntries.push({ geo: boxAt(w + 0.5, 3.8, d + 0.5, x, GROUND_Y + 1.9, z) });
          // roof slab
          roofEntries.push({ geo: boxAt(w + 0.7, 0.55, d + 0.7, x, GROUND_Y + h + 0.25, z) });
          // rooftop clutter
          const acCount = this.rand.int(0, 3);
          for (let a = 0; a < acCount; a++) {
            const aw = this.rand.range(1.4, 3.2), ah = this.rand.range(0.8, 2), ad = this.rand.range(1.4, 3.2);
            acEntries.push({
              geo: boxAt(aw, ah, ad,
                x + this.rand.range(-w * 0.3, w * 0.3),
                GROUND_Y + h + 0.55 + ah / 2,
                z + this.rand.range(-d * 0.3, d * 0.3)),
            });
          }
          if (h > 44 || this.rand.chance(0.3)) {
            const ah = this.rand.range(3, 9);
            antennaEntries.push({ geo: cylAt(0.09, 0.12, ah, 5, x, GROUND_Y + h + 0.5 + ah / 2, z) });
          }

          this.buildings.push({ x, z, w, d, h, style });
          this.colliders.push({ minX: x - w / 2 - 0.35, maxX: x + w / 2 + 0.35, minZ: z - d / 2 - 0.35, maxZ: z + d / 2 + 0.35 });

          // neon sign on the road-facing side
          if (h > 11 && this.rand.chance(0.52)) this._addSign(x, z, w, d, h);
        }
      }
    }

    addMerged(this.group, sidewalkMat, sidewalkEntries, { shadow: false });
    this.facadeMats.forEach((mat, idx) => addMerged(this.group, mat, styleEntries[idx]));
    addMerged(this.group, roofMat, roofEntries);
    addMerged(this.group, baseMat, baseEntries);
    addMerged(this.group, metalMat, acEntries);
    addMerged(this.group, metalMat, antennaEntries);

    // red aircraft warning lights
    const blinkMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const blinkGeo = new THREE.SphereGeometry(0.22, 6, 5);
    const blinkCount = antennaEntries.length;
    if (blinkCount) {
      const blink = new THREE.InstancedMesh(blinkGeo, blinkMat, blinkCount);
      let i = 0;
      const m = new THREE.Matrix4();
      for (const e of antennaEntries) {
        // antenna geometries are already translated; sample the top from bounding box
        e.geo.computeBoundingBox();
        const bb = e.geo.boundingBox;
        m.makeTranslation((bb.min.x + bb.max.x) / 2, bb.max.y - 0.1, (bb.min.z + bb.max.z) / 2);
        blink.setMatrixAt(i++, m);
      }
      blink.count = i;
      this.group.add(blink);
      this.warningLights = blink;
    }
  }

  _splitLots(bx, bz, downtown) {
    const r = this.rand;
    const style = r.int(0, 3);
    const lots = [];
    if (style === 0 || downtown > 0.8) {
      lots.push({ x: bx, z: bz, w: 42, d: 42 });
    } else if (style === 1) {
      const vertical = r.chance(0.5);
      for (const s of [-1, 1]) {
        lots.push(vertical
          ? { x: bx + s * 11, z: bz, w: 22, d: 42 }
          : { x: bx, z: bz + s * 11, w: 42, d: 22 });
      }
    } else {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        lots.push({ x: bx + sx * 11, z: bz + sz * 11, w: 22, d: 22 });
      }
    }
    return lots;
  }

  _buildPark(bx, bz, grassMat) {
    const y = 0.17;
    const g = groundPlane(47, 47, bx, bz, y);
    const mesh = new THREE.Mesh(g, grassMat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.parks.push({ x: bx, z: bz, w: 47, d: 47 });

    // paths
    const pathMat = new THREE.MeshStandardMaterial({ color: 0xb5a98e, roughness: 1 });
    const pathEntries = [
      { geo: groundPlane(6, 47, bx, bz, y + 0.012) },
      { geo: groundPlane(47, 6, bx, bz, y + 0.012) },
    ];
    addMerged(this.group, pathMat, pathEntries, { shadow: false });

    // trees
    const trunkEntries = [], leafEntries = [];
    for (let i = 0; i < 11; i++) {
      const x = bx + this.rand.range(-20, 20);
      const z = bz + this.rand.range(-20, 20);
      if (Math.abs(x - bx) < 5 || Math.abs(z - bz) < 5) continue;
      const h = this.rand.range(3.4, 6);
      trunkEntries.push({ geo: cylAt(0.22, 0.34, h, 5, x, y + h / 2, z) });
      const r = this.rand.range(1.6, 2.8);
      for (let k = 0; k < 3; k++) {
        leafEntries.push({
          geo: new THREE.IcosahedronGeometry(r * (1 - k * 0.18), 0)
            .translate(x + this.rand.range(-0.8, 0.8), y + h + k * 0.85 + 0.4, z + this.rand.range(-0.8, 0.8)),
        });
      }
      this.colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
    }
    addMerged(this.group, new THREE.MeshStandardMaterial({ color: 0x5a3d2b, roughness: 1 }), trunkEntries);
    addMerged(this.group, new THREE.MeshStandardMaterial({ color: 0x2f6b39, roughness: 0.95, flatShading: true }), leafEntries);

    // fountain
    const stone = new THREE.MeshStandardMaterial({ color: 0xb9b2a2, roughness: 0.85 });
    const water = new THREE.MeshStandardMaterial({ color: 0x2f8f9a, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.9, 20), stone);
    basin.position.set(bx, y + 0.45, bz);
    basin.castShadow = true; basin.receiveShadow = true;
    this.group.add(basin);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.12, 20), water);
    disc.position.set(bx, y + 0.86, bz);
    this.group.add(disc);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.4, 10), stone);
    pillar.position.set(bx, y + 1.9, bz);
    pillar.castShadow = true;
    this.group.add(pillar);
    this.colliders.push({ minX: bx - 4.6, maxX: bx + 4.6, minZ: bz - 4.6, maxZ: bz + 4.6 });

    // benches
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4e2f, roughness: 0.9 });
    const benchEntries = [];
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU + 0.3;
      const x = bx + Math.cos(ang) * 14, z = bz + Math.sin(ang) * 14;
      benchEntries.push({ geo: boxAt(2.4, 0.18, 0.8, x, y + 0.55, z, -ang) });
      benchEntries.push({ geo: boxAt(2.4, 0.7, 0.16, x - Math.sin(ang) * 0.38, y + 0.92, z - Math.cos(ang) * 0.38, -ang) });
      benchEntries.push({ geo: boxAt(0.16, 0.55, 0.7, x - Math.cos(ang) * 0.9, y + 0.28, z - Math.sin(ang) * 0.9, -ang) });
      benchEntries.push({ geo: boxAt(0.16, 0.55, 0.7, x + Math.cos(ang) * 0.9, y + 0.28, z + Math.sin(ang) * 0.9, -ang) });
    }
    addMerged(this.group, wood, benchEntries);
  }

  _addSign(x, z, w, d, h) {
    // pick the facade closest to a road
    const dx = Math.min(...ROAD_COORDS.map((r) => Math.abs(x - r)));
    const dz = Math.min(...ROAD_COORDS.map((r) => Math.abs(z - r)));
    let rotY, px, pz;
    if (dx < dz) {
      rotY = Math.PI / 2;
      px = x + w / 2 + 0.12;
      pz = z;
    } else {
      rotY = 0;
      px = x;
      pz = z + d / 2 + 0.12;
    }
    // face outward
    const roadX = ROAD_COORDS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    const roadZ = ROAD_COORDS.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
    if (dx < dz) {
      px = x + Math.sign(x - roadX) * (w / 2 + 0.12);
      rotY = Math.sign(x - roadX) > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      pz = z + Math.sign(z - roadZ) * (d / 2 + 0.12);
      rotY = Math.sign(z - roadZ) > 0 ? 0 : Math.PI;
    }

    const [word, sub] = NEON_WORDS[this.rand.int(0, NEON_WORDS.length - 1)];
    const colors = ['#ff7a1a', '#ff2d6f', '#37e6ff', '#ffd166', '#9dff6e', '#c46bff'];
    const color = colors[this.rand.int(0, colors.length - 1)];
    const tex = textTexture(word, { color, sub, bg: 'rgba(9,8,16,0.95)' });
    const sw = this.rand.range(7, 11);
    const sh = sw * 0.375;
    const geo = new THREE.PlaneGeometry(sw, sh);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: false, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(geo, mat);
    sign.position.set(px, Math.min(GROUND_Y + h * 0.55, this.rand.range(5.5, 13)), pz);
    sign.rotation.y = rotY;
    this.group.add(sign);
    this.signs.push({ mesh: sign, base: mat.color.clone(), phase: this.rand.range(0, TAU) });

    // glow behind sign
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)'),
      color: new THREE.Color(color), transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.position.copy(sign.position);
    glow.scale.set(sw * 1.5, sh * 2.2, 1);
    this.group.add(glow);
  }

  /* ---------------- props ---------------- */
  _buildProps() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d4148, roughness: 0.55, metalness: 0.65 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe0a8 });
    const poleEntries = [], armEntries = [], bulbEntries = [];
    const glowPositions = [];

    for (const r of ROAD_COORDS) {
      for (let t = -176; t <= 176; t += 64) {
        for (const side of [-1, 1]) {
          // lamps along north/south roads
          const x = r + side * 10.5;
          const z = t + 8;
          if (Math.abs(x) > 225 || Math.abs(z) > 225) continue;
          poleEntries.push({ geo: cylAt(0.11, 0.15, 7.2, 6, x, 3.6, z) });
          armEntries.push({ geo: boxAt(1.9, 0.13, 0.13, x - side * 0.85, 7.15, z) });
          bulbEntries.push({ geo: boxAt(0.55, 0.16, 0.32, x - side * 1.75, 7.05, z) });
          glowPositions.push(x - side * 1.75, 7.05, z);
          this.colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 });

          // lamps along east/west roads
          const x2 = t + 8;
          const z2 = r + side * 10.5;
          if (Math.abs(x2) > 225 || Math.abs(z2) > 225) continue;
          poleEntries.push({ geo: cylAt(0.11, 0.15, 7.2, 6, x2, 3.6, z2) });
          armEntries.push({ geo: boxAt(0.13, 0.13, 1.9, x2, 7.15, z2 - side * 0.85) });
          bulbEntries.push({ geo: boxAt(0.32, 0.16, 0.55, x2, 7.05, z2 - side * 1.75) });
          glowPositions.push(x2, 7.05, z2 - side * 1.75);
          this.colliders.push({ minX: x2 - 0.25, maxX: x2 + 0.25, minZ: z2 - 0.25, maxZ: z2 + 0.25 });
        }
      }
    }
    addMerged(this.group, poleMat, poleEntries, { shadow: false });
    addMerged(this.group, poleMat, armEntries, { shadow: false });
    addMerged(this.group, bulbMat, bulbEntries, { shadow: false });

    // glow points
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPositions, 3));
    const glowMat = new THREE.PointsMaterial({
      map: glowTexture('rgba(255,220,160,0.9)', 'rgba(255,140,50,0)'),
      color: 0xffc98a, size: 4.2, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const glows = new THREE.Points(glowGeo, glowMat);
    this.group.add(glows);

    // warm pools of light on the ground
    const poolGeo = new THREE.PlaneGeometry(13, 13);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.MeshBasicMaterial({
      map: glowTexture('rgba(255,190,110,0.55)', 'rgba(255,120,40,0)'),
      transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    });
    const count = Math.floor(glowPositions.length / 3);
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, count);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      mm.makeTranslation(glowPositions[i * 3], 0.055, glowPositions[i * 3 + 2]);
      pools.setMatrixAt(i, mm);
    }
    pools.count = count;
    this.group.add(pools);

    this._buildTrafficLights(poleMat, bulbMat);
  }

  _buildTrafficLights(poleMat, bulbMat) {
    const poles = [], heads = [], reds = [], greens = [];
    const intersections = [];
    for (const x of [-128, 0, 128]) for (const z of [-128, 0, 128]) intersections.push([x, z]);
    for (const [x, z] of intersections) {
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [sx, sz] of corners) {
        if (this.rand.chance(0.45)) continue;
        const px = x + sx * 9.6, pz = z + sz * 9.6;
        poles.push({ geo: cylAt(0.1, 0.13, 5.6, 6, px, 2.8, pz) });
        heads.push({ geo: boxAt(0.7, 1.9, 0.7, px, 5.4, pz) });
        const green = this.rand.chance(0.5);
        const arr = green ? greens : reds;
        arr.push({ geo: new THREE.SphereGeometry(0.18, 6, 5).translate(px + sx * 0.37, 5.05, pz + sz * 0.37) });
        this.colliders.push({ minX: px - 0.25, maxX: px + 0.25, minZ: pz - 0.25, maxZ: pz + 0.25 });
      }
    }
    addMerged(this.group, poleMat, poles, { shadow: false });
    addMerged(this.group, new THREE.MeshStandardMaterial({ color: 0x262a30, roughness: 0.7 }), heads);
    addMerged(this.group, new THREE.MeshBasicMaterial({ color: 0xff3b30 }), reds, { shadow: false });
    addMerged(this.group, new THREE.MeshBasicMaterial({ color: 0x4dff7a }), greens, { shadow: false });
  }

  _buildBeach() {
    // palms along the shoreline
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4c30, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b39, roughness: 0.9, side: THREE.DoubleSide });
    const trunks = [], crowns = [];
    const spots = [];
    for (let x = -215; x <= 215; x += 26) {
      spots.push([x, -218], [x, 218]);
    }
    for (let z = -190; z <= 190; z += 30) {
      spots.push([-218, z], [218, z]);
    }
    for (const [x, z] of spots) {
      if (this.rand.chance(0.18)) continue;
      const h = this.rand.range(6, 11);
      const lean = this.rand.range(-1.2, 1.2);
      trunks.push({ geo: cylAt(0.22, 0.4, h, 6, x + lean * 0.4, h / 2 - 0.25, z) });
      const crown = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const leaf = new THREE.ConeGeometry(0.55, this.rand.range(4, 5.6), 3);
        leaf.rotateX(Math.PI / 2 + 0.45);
        leaf.rotateY((i / 7) * TAU + this.rand.range(-0.15, 0.15));
        leaf.translate(0, this.rand.range(0.1, 0.6), 0);
        crowns.push({ geo: leaf, matrix: new THREE.Matrix4().makeTranslation(x + lean, h - 0.35, z) });
      }
    }
    addMerged(this.group, trunkMat, trunks);
    // crowns merged manually with per-entry matrices
    const crownEntries = crowns.map((c) => ({ geo: c.geo, matrix: c.matrix }));
    addMerged(this.group, leafMat, crownEntries);

    // beach umbrellas
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd9d4c6, roughness: 0.7 });
    const umbCols = [0xff6b5e, 0x3fd0d4, 0xffd166];
    const poleEntries = [];
    for (let i = 0; i < umbCols.length; i++) {
      const entries = [];
      for (let k = 0; k < 6; k++) {
        const x = this.rand.range(-190, 190);
        const z = this.rand.sign() * this.rand.range(200, 224);
        poleEntries.push({ geo: cylAt(0.07, 0.07, 3, 5, x, 1.2, z) });
        const cone = new THREE.ConeGeometry(2.6, 1.1, 8);
        cone.translate(x, 2.7, z);
        entries.push({ geo: cone });
      }
      addMerged(this.group, new THREE.MeshStandardMaterial({ color: umbCols[i], roughness: 0.85, side: THREE.DoubleSide }), entries);
    }
    addMerged(this.group, poleMat, poleEntries);
  }

  _buildSkyline() {
    // distant mountains / islands
    const mat = new THREE.MeshBasicMaterial({ color: 0x8a5f66, fog: true });
    const entries = [];
    for (let i = 0; i < 30; i++) {
      const ang = this.rand.range(0, TAU);
      const dist = this.rand.range(1050, 1750);
      const h = this.rand.range(40, 150);
      const r = this.rand.range(200, 420);
      const cone = new THREE.ConeGeometry(r, h, 5 + this.rand.int(0, 3), 1);
      cone.translate(Math.cos(ang) * dist, h / 2 - 20, Math.sin(ang) * dist);
      entries.push({ geo: cone });
    }
    addMerged(this.group, mat, entries, { shadow: false, receive: false });

    // far towers on a hazy island
    const towerMat = new THREE.MeshBasicMaterial({ color: 0x4b3a50, fog: true });
    const towers = [];
    for (let i = 0; i < 16; i++) {
      const x = this.rand.range(-260, -120) + 460;
      const z = this.rand.range(-220, 220) - 360;
      const w = this.rand.range(14, 40);
      const h = this.rand.range(50, 160);
      towers.push({ geo: boxAt(w, h, w, x, h / 2, z) });
    }
    addMerged(this.group, towerMat, towers, { shadow: false, receive: false });
  }

  _buildBoundary() {
    // low seawall around the playable beach
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a8175, roughness: 0.9 });
    const entries = [];
    const L = BOUNDARY * 2 + 8;
    for (const s of [-1, 1]) {
      entries.push({ geo: boxAt(L, 1.1, 1.6, 0, 0.55, s * BOUNDARY) });
      entries.push({ geo: boxAt(1.6, 1.1, L, s * BOUNDARY, 0.55, 0) });
      this.colliders.push({ minX: -BOUNDARY, maxX: BOUNDARY, minZ: s * BOUNDARY - 0.9, maxZ: s * BOUNDARY + 0.9 });
      this.colliders.push({ minX: s * BOUNDARY - 0.9, maxX: s * BOUNDARY + 0.9, minZ: -BOUNDARY, maxZ: BOUNDARY });
    }
    addMerged(this.group, wallMat, entries, { shadow: false });

    // rail posts along the wall
    const postEntries = [];
    for (let t = -228; t <= 228; t += 12) {
      for (const s of [-1, 1]) {
        postEntries.push({ geo: cylAt(0.05, 0.05, 1.2, 4, t, 1.7, s * BOUNDARY) });
        postEntries.push({ geo: cylAt(0.05, 0.05, 1.2, 4, s * BOUNDARY, 1.7, t) });
      }
    }
    addMerged(this.group, new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.6, roughness: 0.5 }), postEntries, { shadow: false });
  }

  /* ---------------- queries ---------------- */
  isOnRoad(x, z, pad = 1) {
    for (const r of ROAD_COORDS) {
      if (Math.abs(x - r) < ROAD_W / 2 + pad || Math.abs(z - r) < ROAD_W / 2 + pad) return true;
    }
    return false;
  }

  surfaceAt(x, z) {
    if (Math.abs(x) > 225 || Math.abs(z) > 225) return 'sand';
    if (this.isOnRoad(x, z)) return 'road';
    return 'sidewalk';
  }

  randomRoadPoint(rand = this.rand) {
    const axis = rand.chance(0.5) ? 'x' : 'z';
    const road = rand.pick(ROAD_COORDS);
    const t = rand.range(-180, 180);
    const lane = rand.sign() * 4;
    if (axis === 'x') return { x: road + lane, z: t, axis };
    return { x: t, z: road + lane, axis };
  }

  randomSidewalkPoint(rand = this.rand) {
    const bx = rand.pick(BLOCK_CENTERS) + rand.range(-22, 22);
    const bz = rand.pick(BLOCK_CENTERS) + rand.range(-22, 22);
    if (this.isOnRoad(bx, bz, 2)) return this.randomRoadPoint(rand);
    return { x: bx, z: bz };
  }

  resolveCircle(pos, radius) {
    let hit = null;
    for (const c of this.colliders) {
      const cx = clamp(pos.x, c.minX, c.maxX);
      const cz = clamp(pos.z, c.minZ, c.maxZ);
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      let nx, nz, push;
      const d = Math.sqrt(d2);
      if (d > 0.0001) {
        nx = dx / d; nz = dz / d;
        push = radius - d;
      } else {
        const dl = pos.x - c.minX, dr = c.maxX - pos.x;
        const dt = pos.z - c.minZ, db = c.maxZ - pos.z;
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) { nx = -1; nz = 0; push = dl + radius; }
        else if (m === dr) { nx = 1; nz = 0; push = dr + radius; }
        else if (m === dt) { nx = 0; nz = -1; push = dt + radius; }
        else { nx = 0; nz = 1; push = db + radius; }
      }
      pos.x += nx * push;
      pos.z += nz * push;
      if (!hit || push > hit.push) hit = { nx, nz, push };
    }
    return hit;
  }

  /* ---------------- per-frame ---------------- */
  update(dt, time, focus) {
    this.time = time;
    this.oceanUniforms.uTime.value = time;
    for (const c of this.clouds) {
      c.sprite.position.x += c.speed * dt;
      if (c.sprite.position.x > 1500) c.sprite.position.x = -1500;
    }
    if (this.warningLights) {
      const on = Math.sin(time * 2.2) > 0.2;
      this.warningLights.visible = on;
    }
    for (const s of this.signs) {
      const flicker = 0.82 + Math.sin(time * 3 + s.phase) * 0.06 + (Math.sin(time * 17 + s.phase * 3) > 0.94 ? -0.45 : 0);
      s.mesh.material.opacity = clamp(flicker, 0.2, 1);
      s.mesh.material.transparent = true;
    }
    if (focus) {
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 170);
      this.sun.target.position.copy(focus);
      this.sun.target.updateMatrixWorld();
    }
  }
}
