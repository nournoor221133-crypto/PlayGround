import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeNoise2D, mulberry32, smoothstep } from './noise.js'

const TAU = Math.PI * 2

export const THEMES = {
  dawn: {
    skyTop: '#1b2a55',
    skyMid: '#8a4f72',
    skyHorizon: '#ffc09a',
    sunColor: '#ffd2a0',
    fog: '#8f6474',
    hemiSky: '#ffd9b8',
    hemiGround: '#3a2f40',
    cloudColor: '#f2c3b0',
    sunDir: [0.62, 0.24, -0.75],
    sunIntensity: 2.6,
    hemiIntensity: 1.3,
    fogDensity: 0.0065,
    cloudOpacity: 0.9,
    starOpacity: 0,
    firefly: 0.5,
    bloom: 0.5,
    exposure: 0.98,
  },
  day: {
    skyTop: '#1e6bbd',
    skyMid: '#6aa9dd',
    skyHorizon: '#cfeaff',
    sunColor: '#fff3d8',
    fog: '#7fa8c8',
    hemiSky: '#d5ecff',
    hemiGround: '#4a5a3a',
    cloudColor: '#ffffff',
    sunDir: [0.38, 0.82, -0.43],
    sunIntensity: 3.4,
    hemiIntensity: 1.7,
    fogDensity: 0.0055,
    cloudOpacity: 1,
    starOpacity: 0,
    firefly: 0.12,
    bloom: 0.3,
    exposure: 0.98,
  },
  dusk: {
    skyTop: '#080617',
    skyMid: '#5a2358',
    skyHorizon: '#ff6358',
    sunColor: '#ff9e6a',
    fog: '#5e3450',
    hemiSky: '#ffb28a',
    hemiGround: '#3b2a3d',
    cloudColor: '#d69bb4',
    sunDir: [-0.81, 0.12, -0.57],
    sunIntensity: 2.9,
    hemiIntensity: 1.55,
    fogDensity: 0.0082,
    cloudOpacity: 1,
    starOpacity: 0.32,
    firefly: 0.9,
    bloom: 0.62,
    exposure: 0.98,
  },
  night: {
    skyTop: '#02030e',
    skyMid: '#0a1230',
    skyHorizon: '#0e1b3c',
    sunColor: '#a8c0ff',
    fog: '#060b1a',
    hemiSky: '#2b3d74',
    hemiGround: '#0a0d18',
    cloudColor: '#3c4d7c',
    sunDir: [-0.5, 0.52, -0.62],
    sunIntensity: 0.8,
    hemiIntensity: 0.62,
    fogDensity: 0.011,
    cloudOpacity: 0.62,
    starOpacity: 1,
    firefly: 1,
    bloom: 1.12,
    exposure: 1.16,
  },
}

const SHARD_COLORS = ['#62e9ff', '#ff7ad9', '#ffd166', '#7dffa8', '#b08cff']

function glowTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.16, 'rgba(255,255,255,0.88)')
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.26)')
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.06)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function cloudTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  const random = mulberry32(9173)
  for (let i = 0; i < 18; i += 1) {
    const x = 46 + random() * (size - 92)
    const y = 88 + random() * (size - 150)
    const radius = 26 + random() * 54
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, 'rgba(255,255,255,0.42)')
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.16)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, TAU)
    ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function beamTexture() {
  const width = 64
  const height = 256
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    const v = y / height
    const vertical = Math.pow(1 - v, 1.35) * (0.55 + 0.45 * Math.min(1, v * 10))
    for (let x = 0; x < width; x += 1) {
      const dx = (x - width / 2) / (width * 0.19)
      const horizontal = Math.exp(-dx * dx)
      const alpha = Math.max(0, Math.min(1, vertical * horizontal))
      const index = (y * width + x) * 4
      image.data[index] = 255
      image.data[index + 1] = 255
      image.data[index + 2] = 255
      image.data[index + 3] = Math.round(alpha * 255)
    }
  }
  ctx.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function addVertexColor(geometry, color) {
  const count = geometry.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function buildIsland(R, seed, { rings = 44, segments = 120, depth = R * 0.86 } = {}) {
  const noise = makeNoise2D(seed)
  const edgeScale = (angle) =>
    1 + 0.055 * noise(Math.cos(angle) * 1.6 + 60, Math.sin(angle) * 1.6 + 60)

  const heightAt = (t, angle) => {
    const tc = Math.min(1, Math.max(0, t))
    const flat = smoothstep(0.05, 0.22, tc)
    const n1 = noise(Math.cos(angle) * tc * 2.4 + 11, Math.sin(angle) * tc * 2.4 + 7)
    const n2 = noise(Math.cos(angle) * tc * 7 + 41, Math.sin(angle) * tc * 7 + 23)
    const dome = 3.05 * Math.pow(1 - tc * tc, 0.72)
    let height = dome + (0.72 * n1 + 0.22 * n2) * flat * (1 - tc * 0.55)
    height -= 0.55 * smoothstep(0.86, 1, tc)
    return height
  }

  const groundAt = (x, z) => {
    const radius = Math.hypot(x, z)
    const angle = Math.atan2(z, x)
    const edge = edgeScale(angle)
    return heightAt(Math.min(1, radius / (R * edge)), angle)
  }

  // ---- grassy top ----
  const positions = []
  const colors = []
  const indices = []
  const grassLow = new THREE.Color('#356b3f')
  const grassHigh = new THREE.Color('#7cc35e')
  const grassDark = new THREE.Color('#2a5233')
  const sand = new THREE.Color('#c9a76f')
  const color = new THREE.Color()

  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings
    for (let j = 0; j < segments; j += 1) {
      const angle = (j / segments) * TAU
      const edge = edgeScale(angle)
      const radius = R * t * edge
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = heightAt(t, angle)
      positions.push(x, y, z)

      const heightMix = THREE.MathUtils.clamp((y + 0.4) / 3.4, 0, 1)
      const patch = noise(x * 0.35 + 3, z * 0.35 + 9) * 0.5 + 0.5
      color.copy(grassLow).lerp(grassHigh, heightMix * 0.72 + patch * 0.28)
      color.lerp(grassDark, Math.max(0, -noise(x * 0.5, z * 0.5)) * 0.32)
      color.lerp(sand, smoothstep(0.88, 1, t) * 0.7)
      colors.push(color.r, color.g, color.b)
    }
  }

  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = i * segments + j
      const b = i * segments + ((j + 1) % segments)
      const c = (i + 1) * segments + j
      const d = (i + 1) * segments + ((j + 1) % segments)
      indices.push(a, b, c, b, d, c)
    }
  }

  const topGeometry = new THREE.BufferGeometry()
  topGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  topGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  topGeometry.setIndex(indices)
  topGeometry.computeVertexNormals()

  // ---- rocky underside ----
  const rockPositions = []
  const rockColors = []
  const rockIndices = []
  const rockA = new THREE.Color('#6a5342')
  const rockB = new THREE.Color('#9a8066')
  const rockC = new THREE.Color('#3d2f27')
  const moss = new THREE.Color('#4f6b3a')
  const rockRings = 16

  for (let k = 0; k <= rockRings; k += 1) {
    const tk = k / rockRings
    const shrink = 1 - 0.985 * Math.pow(tk, 0.8)
    for (let j = 0; j < segments; j += 1) {
      const angle = (j / segments) * TAU
      const edge = edgeScale(angle)
      const radius = R * edge * shrink
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      let y
      if (k === 0) {
        y = heightAt(1, angle) - 0.02
      } else {
        const drop = depth * Math.pow((k - 0.55) / (rockRings - 0.55), 1.28)
        const jag =
          0.74 +
          0.46 * noise(Math.cos(angle) * 2.2 + 80, Math.sin(angle) * 2.2 + 40) +
          0.2 * noise(Math.cos(angle) * 5.2 + tk * 5, Math.sin(angle) * 5.2 - tk * 3)
        y = -0.55 - drop * jag
      }
      rockPositions.push(x, y, z)

      const shade = 0.5 + 0.5 * noise(x * 0.18 + 7, z * 0.18 + 31)
      color.copy(rockA).lerp(rockB, shade)
      color.lerp(rockC, smoothstep(0.45, 1, tk) * 0.5)
      color.lerp(moss, (1 - smoothstep(0, 0.16, tk)) * 0.42)
      rockColors.push(color.r, color.g, color.b)
    }
  }

  for (let k = 0; k < rockRings; k += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = k * segments + j
      const b = k * segments + ((j + 1) % segments)
      const c = (k + 1) * segments + j
      const d = (k + 1) * segments + ((j + 1) % segments)
      rockIndices.push(a, b, c, b, d, c)
    }
  }

  // Close the tip so the hollow underside never shows through as a crack.
  const tipStart = rockRings * segments
  let tipY = Infinity
  for (let j = 0; j < segments; j += 1) {
    tipY = Math.min(tipY, rockPositions[(tipStart + j) * 3 + 1])
  }
  tipY -= 0.4
  const tipIndex = rockPositions.length / 3
  rockPositions.push(0, tipY, 0)
  rockColors.push(rockC.r * 0.7, rockC.g * 0.7, rockC.b * 0.7)
  for (let j = 0; j < segments; j += 1) {
    const a = tipStart + j
    const b = tipStart + ((j + 1) % segments)
    rockIndices.push(a, b, tipIndex)
  }

  const rockGeometry = new THREE.BufferGeometry()
  rockGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rockPositions, 3))
  rockGeometry.setAttribute('color', new THREE.Float32BufferAttribute(rockColors, 3))
  rockGeometry.setIndex(rockIndices)
  rockGeometry.computeVertexNormals()

  return { topGeometry, rockGeometry, heightAt, groundAt, R }
}

function makeTreeGeometry() {
  const parts = []
  const trunk = new THREE.CylinderGeometry(0.055, 0.11, 0.95, 5, 1)
  trunk.translate(0, 0.475, 0)
  parts.push(addVertexColor(trunk, new THREE.Color('#6b4a33')))

  const layers = [
    [0.62, 0.95, 1.05, '#3f7a45'],
    [0.47, 0.82, 1.55, '#4f944f'],
    [0.3, 0.68, 2.02, '#6cb35a'],
  ]
  for (const [radius, height, y, tint] of layers) {
    const cone = new THREE.ConeGeometry(radius, height, 7, 1)
    cone.translate(0, y, 0)
    parts.push(addVertexColor(cone, new THREE.Color(tint)))
  }
  return mergeGeometries(parts, false)
}

function makeStarField() {
  const random = mulberry32(4242)
  const positions = []
  for (let i = 0; i < 1100; i += 1) {
    const u = random() * 2 - 1
    const y = Math.abs(u) * 0.98 + 0.02
    const angle = random() * TAU
    const radius = 342
    const horizontal = Math.sqrt(Math.max(0, 1 - y * y))
    positions.push(Math.cos(angle) * horizontal * radius, y * radius, Math.sin(angle) * horizontal * radius)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

export function createWorld(scene, renderer, { onShard, onComplete } = {}) {
  const glow = glowTexture()
  const cloudMap = cloudTexture()
  const beamMap = beamTexture()

  const groundMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
  })
  const rockMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
  })

  // ---------- sky ----------
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color() },
      midColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      varying vec3 vWorldPosition;
      void main() {
        vec3 dir = normalize(vWorldPosition);
        float height = max(dir.y, 0.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.12, height));
        col = mix(col, topColor, smoothstep(0.12, 0.38, height));
        float sun = max(dot(dir, normalize(sunDirection)), 0.0);
        col += sunColor * (pow(sun, 12.0) * 0.06 + pow(sun, 260.0) * 1.25);
        float band = smoothstep(0.0, 0.1, dir.y) * (1.0 - smoothstep(0.1, 0.42, dir.y));
        col += vec3(0.035, 0.008, 0.05) * band;
        float below = 1.0 - smoothstep(-0.28, 0.02, dir.y);
        col = mix(col, horizonColor * 0.5, below * 0.85);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 24), skyMaterial)
  sky.renderOrder = -10
  scene.add(sky)

  const stars = new THREE.Points(
    makeStarField(),
    new THREE.PointsMaterial({
      map: glow,
      color: new THREE.Color('#dfe8ff'),
      size: 2.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  scene.add(stars)

  const sunGroup = new THREE.Group()
  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glow,
      color: new THREE.Color('#ffb37f'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    }),
  )
  sunGlow.scale.set(20, 20, 1)
  const sunCore = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glow,
      color: new THREE.Color('#fff2d6'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 1,
    }),
  )
  sunCore.scale.set(6, 6, 1)
  sunGroup.add(sunGlow, sunCore)
  scene.add(sunGroup)

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight('#ffb28a', '#2a1e3a', 1.35)
  scene.add(hemi)

  const sunLight = new THREE.DirectionalLight('#ffb37f', 2.7)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.set(1024, 1024)
  sunLight.shadow.camera.near = 1
  sunLight.shadow.camera.far = 190
  sunLight.shadow.camera.left = -30
  sunLight.shadow.camera.right = 30
  sunLight.shadow.camera.top = 30
  sunLight.shadow.camera.bottom = -30
  sunLight.shadow.bias = -0.0006
  sunLight.shadow.normalBias = 0.06
  scene.add(sunLight)
  scene.add(sunLight.target)

  const fillLight = new THREE.DirectionalLight('#9fc4ff', 1.0)
  fillLight.position.set(34, 20, 46)
  scene.add(fillLight)

  const bounceLight = new THREE.DirectionalLight('#d09a8a', 1.15)
  bounceLight.position.set(12, -30, 34)
  scene.add(bounceLight)
  scene.add(bounceLight.target)

  scene.fog = new THREE.FogExp2('#673a57', 0.009)

  // ---------- main isle ----------
  const main = buildIsland(15, 1337, { rings: 48, segments: 132, depth: 9 })
  const mainTop = new THREE.Mesh(main.topGeometry, groundMaterial)
  mainTop.receiveShadow = true
  const mainRock = new THREE.Mesh(main.rockGeometry, rockMaterial)
  mainRock.castShadow = true
  mainRock.receiveShadow = true
  scene.add(mainTop, mainRock)

  const R = main.R
  const groundAt = main.groundAt

  // ---------- shard placements (needed before trees) ----------
  const shardSpots = [
    { angle: 0.32, radius: 0.38 },
    { angle: 1.68, radius: 0.5 },
    { angle: 2.94, radius: 0.44 },
    { angle: 4.24, radius: 0.52 },
    { angle: 5.48, radius: 0.36 },
  ].map((spot) => {
    const x = Math.cos(spot.angle) * spot.radius * R
    const z = Math.sin(spot.angle) * spot.radius * R
    return { x, z, y: groundAt(x, z) }
  })

  // ---------- trees ----------
  const treeRandom = mulberry32(77001)
  const treeGeometry = makeTreeGeometry()
  const treeMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  })
  const treeMesh = new THREE.InstancedMesh(treeGeometry, treeMaterial, 32)
  treeMesh.castShadow = true
  treeMesh.receiveShadow = true
  const dummy = new THREE.Object3D()
  let placedTrees = 0
  let guard = 0
  while (placedTrees < 32 && guard < 3000) {
    guard += 1
    const radius = 0.2 + Math.sqrt(treeRandom()) * 0.68
    const angle = treeRandom() * TAU
    const x = Math.cos(angle) * radius * R
    const z = Math.sin(angle) * radius * R
    if (Math.hypot(x, z) < 3.3) continue
    if (shardSpots.some((spot) => Math.hypot(x - spot.x, z - spot.z) < 1.7)) continue
    const y = groundAt(x, z)
    const scale = 0.72 + treeRandom() * 0.78
    dummy.position.set(x, y - 0.06, z)
    dummy.rotation.set(0, treeRandom() * TAU, 0)
    dummy.scale.setScalar(scale)
    dummy.updateMatrix()
    treeMesh.setMatrixAt(placedTrees, dummy.matrix)
    treeMesh.setColorAt(
      placedTrees,
      new THREE.Color(0.88 + treeRandom() * 0.2, 0.92 + treeRandom() * 0.14, 0.82 + treeRandom() * 0.18),
    )
    placedTrees += 1
  }
  treeMesh.count = placedTrees
  treeMesh.instanceMatrix.needsUpdate = true
  if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true
  scene.add(treeMesh)

  // ---------- rocks ----------
  const rockRandom = mulberry32(5511)
  const boulderGeometry = new THREE.DodecahedronGeometry(0.42, 0)
  const boulderMaterial = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0.02, flatShading: true })
  const boulders = new THREE.InstancedMesh(boulderGeometry, boulderMaterial, 62)
  boulders.castShadow = true
  boulders.receiveShadow = true
  for (let i = 0; i < 62; i += 1) {
    const radius = 0.1 + Math.sqrt(rockRandom()) * 0.87
    const angle = rockRandom() * TAU
    const x = Math.cos(angle) * radius * R
    const z = Math.sin(angle) * radius * R
    const scale = 0.45 + rockRandom() * 1.25
    dummy.position.set(x, groundAt(x, z) - 0.12 * scale, z)
    dummy.rotation.set(rockRandom() * TAU, rockRandom() * TAU, rockRandom() * TAU)
    dummy.scale.set(scale * (0.8 + rockRandom() * 0.5), scale * (0.6 + rockRandom() * 0.5), scale)
    dummy.updateMatrix()
    boulders.setMatrixAt(i, dummy.matrix)
    const shade = 0.34 + rockRandom() * 0.22
    boulders.setColorAt(i, new THREE.Color(shade * 1.15, shade * 1.02, shade * 0.9))
  }
  boulders.instanceMatrix.needsUpdate = true
  if (boulders.instanceColor) boulders.instanceColor.needsUpdate = true
  scene.add(boulders)

  // ---------- grass tufts ----------
  const grassRandom = mulberry32(99123)
  const tuftGeometry = new THREE.ConeGeometry(0.05, 0.46, 3, 1)
  tuftGeometry.translate(0, 0.23, 0)
  const tuftMaterial = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true })
  const tufts = new THREE.InstancedMesh(tuftGeometry, tuftMaterial, 720)
  for (let i = 0; i < 720; i += 1) {
    const radius = Math.sqrt(grassRandom()) * 0.95
    const angle = grassRandom() * TAU
    const x = Math.cos(angle) * radius * R
    const z = Math.sin(angle) * radius * R
    const scale = 0.55 + grassRandom() * 0.95
    dummy.position.set(x, groundAt(x, z) - 0.03, z)
    dummy.rotation.set((grassRandom() - 0.5) * 0.35, grassRandom() * TAU, (grassRandom() - 0.5) * 0.35)
    dummy.scale.set(scale, scale * (0.7 + grassRandom() * 0.7), scale)
    dummy.updateMatrix()
    tufts.setMatrixAt(i, dummy.matrix)
    tufts.setColorAt(i, new THREE.Color().setHSL(0.25 + grassRandom() * 0.07, 0.46, 0.3 + grassRandom() * 0.2))
  }
  tufts.instanceMatrix.needsUpdate = true
  if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true
  scene.add(tufts)

  // ---------- winding stone path ----------
  const pathGeometry = new THREE.DodecahedronGeometry(0.52, 0)
  const pathMaterial = new THREE.MeshStandardMaterial({ color: '#b7a894', roughness: 0.92, flatShading: true })
  const pathStones = new THREE.InstancedMesh(pathGeometry, pathMaterial, 44)
  pathStones.receiveShadow = true
  pathStones.castShadow = true
  for (let i = 0; i < 44; i += 1) {
    const t = i / 43
    const angle = 0.45 + t * TAU * 1.85
    const radius = (0.82 - t * 0.68) * R
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    dummy.position.set(x, groundAt(x, z) + 0.02, z)
    dummy.rotation.set(0, angle + Math.PI / 2, 0)
    dummy.scale.set(0.7 + (i % 3) * 0.1, 0.16, 0.5 + ((i + 1) % 3) * 0.08)
    dummy.updateMatrix()
    pathStones.setMatrixAt(i, dummy.matrix)
  }
  pathStones.instanceMatrix.needsUpdate = true
  scene.add(pathStones)

  // ---------- pedestal + heart crystal ----------
  const pedestal = new THREE.Group()
  const pedestalY = groundAt(0, 0)
  pedestal.position.y = pedestalY
  const pedestalMaterial = new THREE.MeshStandardMaterial({
    color: '#6d6154',
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
  })
  const tiers = [
    [2.15, 2.55, 0.55, 0.28, 0],
    [1.5, 1.95, 0.68, 0.86, 0.4],
    [0.9, 1.3, 0.72, 1.5, 0.9],
  ]
  for (const [topRadius, bottomRadius, height, y, rotation] of tiers) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, height, 7), pedestalMaterial)
    tier.position.y = y
    tier.rotation.y = rotation
    tier.castShadow = true
    tier.receiveShadow = true
    pedestal.add(tier)
  }

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: '#7fe9ff',
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const runeRing = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.035, 6, 64), ringMaterial)
  runeRing.rotation.x = Math.PI / 2
  runeRing.position.y = 1.92
  pedestal.add(runeRing)
  const runeRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.022, 6, 48), ringMaterial.clone())
  runeRing2.rotation.x = Math.PI / 2
  runeRing2.position.y = 2.12
  pedestal.add(runeRing2)

  const heart = new THREE.Group()
  heart.position.y = 4.45
  const heartMaterial = new THREE.MeshStandardMaterial({
    color: '#a9f6ff',
    emissive: new THREE.Color('#27c8ff'),
    emissiveIntensity: 1.7,
    roughness: 0.12,
    metalness: 0.25,
    flatShading: true,
  })
  const heartCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), heartMaterial)
  heartCrystal.scale.set(1, 2.15, 1)
  heartCrystal.castShadow = true
  heart.add(heartCrystal)

  const heartGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glow,
      color: new THREE.Color('#5fe4ff'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.32,
    }),
  )
  heartGlow.scale.set(4.4, 4.4, 1)
  heart.add(heartGlow)

  const orbiters = []
  for (let i = 0; i < 3; i += 1) {
    const shard = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshStandardMaterial({
        color: '#c8fbff',
        emissive: new THREE.Color('#45d8ff'),
        emissiveIntensity: 2.4,
        roughness: 0.2,
        metalness: 0.2,
        flatShading: true,
      }),
    )
    heart.add(shard)
    orbiters.push({ mesh: shard, phase: (i / 3) * TAU, radius: 1.55 + i * 0.22, height: 0.15 - i * 0.2 })
  }

  const heartLight = new THREE.PointLight('#5fe4ff', 16, 26, 2)
  heartLight.position.y = 4.45
  pedestal.add(heart, heartLight)

  const beamMaterial = new THREE.SpriteMaterial({
    map: beamMap,
    color: '#9ff3ff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const beam = new THREE.Sprite(beamMaterial)
  beam.scale.set(2.6, 40, 1)
  beam.position.y = 26.5
  beam.visible = false
  pedestal.add(beam)

  const beamHaloMaterial = beamMaterial.clone()
  beamHaloMaterial.map = beamMap
  beamHaloMaterial.opacity = 0
  const beamHalo = new THREE.Sprite(beamHaloMaterial)
  beamHalo.scale.set(8.5, 46, 1)
  beamHalo.position.y = 28
  beamHalo.visible = false
  pedestal.add(beamHalo)
  scene.add(pedestal)

  // ---------- light shards ----------
  const shards = []
  const shardGroups = []
  shardSpots.forEach((spot, index) => {
    const tint = new THREE.Color(SHARD_COLORS[index])
    const group = new THREE.Group()
    const baseY = spot.y + 1.05
    group.position.set(spot.x, baseY, spot.z)
    group.userData.shardIndex = index

    const material = new THREE.MeshStandardMaterial({
      color: tint.clone().lerp(new THREE.Color('#ffffff'), 0.35),
      emissive: tint,
      emissiveIntensity: 2.1,
      roughness: 0.16,
      metalness: 0.18,
      flatShading: true,
    })
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), material)
    crystal.scale.set(1, 1.95, 1)
    crystal.castShadow = true
    crystal.userData.shardIndex = index
    group.add(crystal)

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        color: tint,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.6,
      }),
    )
    halo.scale.set(2.6, 2.6, 1)
    group.add(halo)

    const column = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        color: tint,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.18,
      }),
    )
    column.scale.set(1.2, 6.2, 1)
    group.add(column)

    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.02, 6, 44),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    baseRing.rotation.x = Math.PI / 2
    baseRing.position.y = -1.0
    group.add(baseRing)

    group.position.y = baseY
    scene.add(group)
    shardGroups.push(group)
    shards.push({
      group,
      crystal,
      material,
      halo,
      column,
      baseRing,
      color: tint,
      baseY,
      phase: index * 1.7,
      active: false,
      lift: 0,
      emissive: 2.1,
    })
  })

  // ---------- fireflies ----------
  const fireflyRandom = mulberry32(33119)
  const fireflyCount = 230
  const fireflyPositions = new Float32Array(fireflyCount * 3)
  const fireflyColors = new Float32Array(fireflyCount * 3)
  const fireflyBase = []
  const warm = new THREE.Color('#ffd27f')
  const cool = new THREE.Color('#8ff4ff')
  for (let i = 0; i < fireflyCount; i += 1) {
    const angle = fireflyRandom() * TAU
    const radius = 1.5 + Math.sqrt(fireflyRandom()) * 13.5
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const y = 1.2 + fireflyRandom() * 6
    fireflyPositions[i * 3] = x
    fireflyPositions[i * 3 + 1] = y
    fireflyPositions[i * 3 + 2] = z
    const tint = fireflyRandom() > 0.65 ? cool : warm
    fireflyColors[i * 3] = tint.r
    fireflyColors[i * 3 + 1] = tint.g
    fireflyColors[i * 3 + 2] = tint.b
    fireflyBase.push({
      x,
      y,
      z,
      amp: 0.35 + fireflyRandom() * 0.85,
      speed: 0.18 + fireflyRandom() * 0.5,
      phase: fireflyRandom() * TAU,
    })
  }
  const fireflyGeometry = new THREE.BufferGeometry()
  fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3))
  fireflyGeometry.setAttribute('color', new THREE.BufferAttribute(fireflyColors, 3))
  const fireflyMaterial = new THREE.PointsMaterial({
    map: glow,
    size: 0.3,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial)
  scene.add(fireflies)

  // ---------- clouds ----------
  const cloudRandom = mulberry32(81223)
  const clouds = []
  for (let i = 0; i < 62; i += 1) {
    const kind = i < 14 ? 'sea' : i < 24 ? 'horizon' : i < 52 ? 'low' : 'high'
    const high = kind === 'high'
    const horizon = kind === 'horizon'
    const sea = kind === 'sea'
    const angle = cloudRandom() * TAU
    const radius = high
      ? 55 + cloudRandom() * 55
      : horizon
        ? 66 + cloudRandom() * 48
        : sea
          ? 8 + cloudRandom() * 38
          : 16 + cloudRandom() * 74
    const baseOpacity = high
      ? 0.08 + cloudRandom() * 0.08
      : horizon
        ? 0.07 + cloudRandom() * 0.1
        : sea
          ? 0.06 + cloudRandom() * 0.1
          : 0.16 + cloudRandom() * 0.3
    const material = new THREE.SpriteMaterial({
      map: cloudMap,
      color: new THREE.Color('#ffffff'),
      transparent: true,
      depthWrite: false,
      opacity: baseOpacity,
    })
    const sprite = new THREE.Sprite(material)
    const size = high
      ? 30 + cloudRandom() * 40
      : horizon
        ? 46 + cloudRandom() * 44
        : sea
          ? 16 + cloudRandom() * 24
          : 12 + cloudRandom() * 30
    sprite.scale.set(size, size * (0.34 + cloudRandom() * 0.24), 1)
    sprite.position.set(
      Math.cos(angle) * radius,
      high
        ? 10 + cloudRandom() * 22
        : horizon
          ? -2 + cloudRandom() * 6
          : sea
            ? -14 - cloudRandom() * 12
            : -8 - cloudRandom() * 22,
      Math.sin(angle) * radius,
    )
    scene.add(sprite)
    clouds.push({
      sprite,
      material,
      angle,
      radius,
      y: sprite.position.y,
      speed: (0.0025 + cloudRandom() * 0.006) * (cloudRandom() > 0.5 ? 1 : -1),
      bob: cloudRandom() * TAU,
      baseOpacity,
    })
  }

  // ---------- distant islets ----------
  const isletDefs = [
    { x: -26, y: 5, z: -16, R: 3.6, seed: 101 },
    { x: 23, y: -3, z: -20, R: 2.6, seed: 202 },
    { x: -19, y: -7, z: 18, R: 2.2, seed: 303 },
    { x: 34, y: 3.5, z: -12, R: 3.2, seed: 404 },
    { x: 3, y: -10, z: -34, R: 4.2, seed: 505 },
  ]
  const isletGlowMaterial = new THREE.MeshStandardMaterial({
    color: '#bdf8ff',
    emissive: new THREE.Color('#35d6ff'),
    emissiveIntensity: 2.2,
    roughness: 0.2,
    metalness: 0.2,
    flatShading: true,
  })
  isletDefs.forEach((def, index) => {
    const islet = buildIsland(def.R, def.seed, { rings: 22, segments: 64, depth: def.R * 1.05 })
    const group = new THREE.Group()
    group.position.set(def.x, def.y, def.z)
    group.rotation.y = index * 1.3
    const top = new THREE.Mesh(islet.topGeometry, groundMaterial)
    top.receiveShadow = true
    const rock = new THREE.Mesh(islet.rockGeometry, rockMaterial)
    rock.castShadow = true
    group.add(top, rock)

    if (index === 0 || index === 3) {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(def.R * 0.11, 0), isletGlowMaterial)
      crystal.scale.set(1, 2.2, 1)
      crystal.position.set(0, islet.groundAt(0, 0) + def.R * 0.3, 0)
      group.add(crystal)
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glow,
          color: new THREE.Color('#5fe4ff'),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.5,
        }),
      )
      halo.scale.setScalar(def.R * 0.9)
      halo.position.copy(crystal.position)
      group.add(halo)
    }
    scene.add(group)
  })

  // ---------- theme state ----------
  const state = {
    skyTop: new THREE.Color(),
    skyMid: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    sunColor: new THREE.Color(),
    fog: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    cloudColor: new THREE.Color(),
    sunDir: new THREE.Vector3(0, 1, 0),
    sunIntensity: 0,
    hemiIntensity: 0,
    fogDensity: 0,
    cloudOpacity: 0,
    starOpacity: 0,
    firefly: 0,
    bloom: 0,
    exposure: 1,
  }
  const target = {
    skyTop: new THREE.Color(),
    skyMid: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    sunColor: new THREE.Color(),
    fog: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    cloudColor: new THREE.Color(),
    sunDir: new THREE.Vector3(0, 1, 0),
    sunIntensity: 0,
    hemiIntensity: 0,
    fogDensity: 0,
    cloudOpacity: 0,
    starOpacity: 0,
    firefly: 0,
    bloom: 0,
    exposure: 1,
  }

  const applyTheme = (destination, theme) => {
    destination.skyTop.set(theme.skyTop)
    destination.skyMid.set(theme.skyMid)
    destination.skyHorizon.set(theme.skyHorizon)
    destination.sunColor.set(theme.sunColor)
    destination.fog.set(theme.fog)
    destination.hemiSky.set(theme.hemiSky)
    destination.hemiGround.set(theme.hemiGround)
    destination.cloudColor.set(theme.cloudColor)
    destination.sunDir.set(...theme.sunDir).normalize()
    destination.sunIntensity = theme.sunIntensity
    destination.hemiIntensity = theme.hemiIntensity
    destination.fogDensity = theme.fogDensity
    destination.cloudOpacity = theme.cloudOpacity
    destination.starOpacity = theme.starOpacity
    destination.firefly = theme.firefly
    destination.bloom = theme.bloom
    destination.exposure = theme.exposure
  }

  applyTheme(state, THEMES.dusk)
  applyTheme(target, THEMES.dusk)
  skyMaterial.uniforms.topColor.value = state.skyTop
  skyMaterial.uniforms.midColor.value = state.skyMid
  skyMaterial.uniforms.horizonColor.value = state.skyHorizon
  skyMaterial.uniforms.sunColor.value = state.sunColor
  skyMaterial.uniforms.sunDirection.value = state.sunDir

  let currentTheme = 'dusk'
  let collected = 0
  let complete = false

  const pulses = []
  const spawnPulse = (position, color, big = false) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(big ? 0.9 : 0.35, big ? 1.05 : 0.44, 56),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(position)
    scene.add(ring)
    pulses.push({ mesh: ring, age: 0, life: big ? 1.8 : 1.15, grow: big ? 8 : 5 })
  }

  const activateShard = (index) => {
    const shard = shards[index]
    if (!shard || shard.active) return false
    shard.active = true
    collected += 1
    spawnPulse(shard.group.position, shard.color)
    if (collected === shards.length) {
      complete = true
      beam.visible = true
      beamHalo.visible = true
      spawnPulse(new THREE.Vector3(0, pedestalY + 1.9, 0), new THREE.Color('#8fefff'), true)
      spawnPulse(new THREE.Vector3(0, pedestalY + 1.9, 0), new THREE.Color('#ffd166'), true)
      onComplete?.()
    }
    onShard?.(collected, shards.length)
    return true
  }

  const pickShard = (raycaster) => {
    const hits = raycaster.intersectObjects(shardGroups, true)
    for (const hit of hits) {
      let node = hit.object
      while (node) {
        if (node.userData.shardIndex !== undefined) return node.userData.shardIndex
        node = node.parent
      }
    }
    return -1
  }

  const setTheme = (name) => {
    const theme = THEMES[name]
    if (!theme) return
    applyTheme(target, theme)
    currentTheme = name
  }

  const resetShards = () => {
    collected = 0
    complete = false
    beam.visible = false
    beamHalo.visible = false
    shards.forEach((shard) => {
      shard.active = false
      shard.lift = 0
    })
  }

  const world = {
    bloomStrength: state.bloom,
    exposure: state.exposure,
    setTheme,
    resetShards,
    activateShard,
    pickShard,
    get collected() {
      return collected
    },
    get complete() {
      return complete
    },
    get theme() {
      return currentTheme
    },
    get shardCount() {
      return shards.length
    },
    shards,
  }

  const clockStart = performance.now()
  const update = (dt) => {
    const elapsed = (performance.now() - clockStart) / 1000
    const k = 1 - Math.exp(-dt * 2.4)

    state.skyTop.lerp(target.skyTop, k)
    state.skyMid.lerp(target.skyMid, k)
    state.skyHorizon.lerp(target.skyHorizon, k)
    state.sunColor.lerp(target.sunColor, k)
    state.fog.lerp(target.fog, k)
    state.hemiSky.lerp(target.hemiSky, k)
    state.hemiGround.lerp(target.hemiGround, k)
    state.cloudColor.lerp(target.cloudColor, k)
    state.sunDir.lerp(target.sunDir, k).normalize()
    state.sunIntensity += (target.sunIntensity - state.sunIntensity) * k
    state.hemiIntensity += (target.hemiIntensity - state.hemiIntensity) * k
    state.fogDensity += (target.fogDensity - state.fogDensity) * k
    state.cloudOpacity += (target.cloudOpacity - state.cloudOpacity) * k
    state.starOpacity += (target.starOpacity - state.starOpacity) * k
    state.firefly += (target.firefly - state.firefly) * k
    state.bloom += (target.bloom - state.bloom) * k
    state.exposure += (target.exposure - state.exposure) * k

    world.bloomStrength = state.bloom
    world.exposure = state.exposure

    scene.fog.color.copy(state.fog)
    scene.fog.density = state.fogDensity
    renderer.toneMappingExposure = state.exposure

    hemi.color.copy(state.hemiSky)
    hemi.groundColor.copy(state.hemiGround)
    hemi.intensity = state.hemiIntensity

    sunLight.color.copy(state.sunColor)
    sunLight.intensity = state.sunIntensity
    sunLight.position.copy(state.sunDir).multiplyScalar(78)

    sunGroup.position.copy(state.sunDir).multiplyScalar(330)
    sunGlow.material.color.copy(state.sunColor)
    sunGlow.material.opacity = 0.16 + state.sunIntensity * 0.045
    sunCore.material.color.copy(state.sunColor).lerp(new THREE.Color('#ffffff'), 0.2)

    stars.material.opacity = state.starOpacity

    for (const cloud of clouds) {
      cloud.angle += cloud.speed * dt
      cloud.sprite.position.x = Math.cos(cloud.angle) * cloud.radius
      cloud.sprite.position.z = Math.sin(cloud.angle) * cloud.radius
      cloud.sprite.position.y = cloud.y + Math.sin(elapsed * 0.12 + cloud.bob) * 0.8
      cloud.material.color.copy(state.cloudColor)
      cloud.material.opacity = cloud.baseOpacity * state.cloudOpacity
    }

    fireflyMaterial.opacity = 0.12 + state.firefly * 0.8
    const positions = fireflyGeometry.attributes.position.array
    for (let i = 0; i < fireflyCount; i += 1) {
      const base = fireflyBase[i]
      positions[i * 3] = base.x + Math.sin(elapsed * base.speed + base.phase) * base.amp
      positions[i * 3 + 1] = base.y + Math.sin(elapsed * base.speed * 0.83 + base.phase * 1.7) * base.amp * 0.65
      positions[i * 3 + 2] = base.z + Math.cos(elapsed * base.speed * 0.91 + base.phase) * base.amp
    }
    fireflyGeometry.attributes.position.needsUpdate = true

    heart.rotation.y += dt * 0.35
    heart.position.y = 4.45 + Math.sin(elapsed * 0.9) * 0.16
    heartLight.intensity = (complete ? 24 : 16) + Math.sin(elapsed * 2.1) * 2.5
    heartMaterial.emissiveIntensity = complete ? 3.4 : 1.7 + Math.sin(elapsed * 1.7) * 0.18
    runeRing.rotation.z += dt * 0.25
    runeRing2.rotation.z -= dt * 0.4
    orbiters.forEach((orbiter) => {
      const angle = elapsed * 0.7 + orbiter.phase
      orbiter.mesh.position.set(
        Math.cos(angle) * orbiter.radius,
        orbiter.height + Math.sin(angle * 1.6) * 0.22,
        Math.sin(angle) * orbiter.radius,
      )
      orbiter.mesh.rotation.y += dt * 1.2
    })

    if (complete) {
      beamMaterial.opacity = 0.95 + Math.sin(elapsed * 2.4) * 0.05
      beamHaloMaterial.opacity = 0.28 + Math.sin(elapsed * 1.7) * 0.05
    }

    shards.forEach((shard) => {
      const targetLift = shard.active ? 1.15 : 0
      shard.lift += (targetLift - shard.lift) * (1 - Math.exp(-dt * 3.2))
      shard.group.position.y = shard.baseY + shard.lift + Math.sin(elapsed * 1.25 + shard.phase) * 0.13
      shard.crystal.rotation.y += dt * (shard.active ? 1.9 : 0.55)
      shard.crystal.rotation.z = Math.sin(elapsed * 0.7 + shard.phase) * 0.13
      const targetEmissive = shard.active ? 5.6 : 2.1 + Math.sin(elapsed * 1.6 + shard.phase) * 0.25
      shard.emissive += (targetEmissive - shard.emissive) * (1 - Math.exp(-dt * 3))
      shard.material.emissiveIntensity = shard.emissive
      shard.halo.material.opacity = shard.active ? 0.95 : 0.6
      shard.column.material.opacity = shard.active ? 0.32 : 0.18
      shard.baseRing.material.opacity = shard.active ? 0.95 : 0.6
      shard.baseRing.rotation.z += dt * (shard.active ? 0.8 : 0.25)
    })

    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const pulse = pulses[i]
      pulse.age += dt
      const t = pulse.age / pulse.life
      pulse.mesh.scale.setScalar(1 + t * pulse.grow)
      pulse.mesh.material.opacity = Math.max(0, 0.72 * (1 - t))
      if (pulse.age >= pulse.life) {
        scene.remove(pulse.mesh)
        pulse.mesh.geometry.dispose()
        pulse.mesh.material.dispose()
        pulses.splice(i, 1)
      }
    }
  }

  world.update = update
  return world
}
