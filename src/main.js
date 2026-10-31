import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { createWorld } from './world.js'

const canvas = document.getElementById('scene')
const intro = document.getElementById('intro')
const playButton = document.getElementById('play')
const toast = document.getElementById('toast')
const shardDots = [...document.querySelectorAll('.shard-dot')]
const shardCount = document.getElementById('shard-count')
const themeButtons = [...document.querySelectorAll('[data-theme]')]
const resetButton = document.getElementById('reset-view')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.04
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 700)

const isPortrait = () => window.innerWidth / window.innerHeight < 0.8

function homePosition() {
  if (isPortrait()) {
    const distance = 62
    return new THREE.Vector3(0.68 * distance, 0.18 * distance, 0.71 * distance)
  }
  const distance = 46
  return new THREE.Vector3(0.68 * distance, 0.18 * distance, 0.71 * distance)
}

function homeTarget() {
  return new THREE.Vector3(0, isPortrait() ? 2 : 1.5, 0)
}

camera.fov = isPortrait() ? 55 : 42
camera.position.copy(homePosition())
camera.updateProjectionMatrix()

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.copy(homeTarget())
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.enablePan = false
controls.minDistance = 10
controls.maxDistance = 70
controls.minPolarAngle = 0.18
controls.maxPolarAngle = Math.PI / 2 - 0.03
controls.rotateSpeed = 0.55
controls.zoomSpeed = 0.8
controls.autoRotate = false
controls.autoRotateSpeed = 0.32
controls.update()

let started = false
let idleTimer = 0
let toastTimer = 0

const world = createWorld(scene, renderer, {
  onShard: (count, total) => {
    shardCount.textContent = `${count} / ${total}`
    shardDots.forEach((dot, index) => dot.classList.toggle('active', index < count))
    if (count > 0 && count < total) showToast(`${total - count} shard${total - count === 1 ? '' : 's'} still sleeping`)
    if (navigator.vibrate) navigator.vibrate(count === total ? [30, 40, 60] : 18)
  },
  onComplete: () => {
    document.body.classList.add('awake')
    showToast('The isles awaken')
  },
})

function showToast(message) {
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600)
}

// ---------- post processing ----------
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.8,
  0.62,
  0.84,
)
composer.addPass(bloom)

const vignette = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 0.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float d = length(vUv - 0.5) * 1.35;
      float vig = smoothstep(0.96, 0.28, d);
      texel.rgb *= mix(1.0, vig, intensity);
      gl_FragColor = texel;
    }
  `,
})
composer.addPass(vignette)
composer.addPass(new OutputPass())

// ---------- interaction ----------
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let pointerDown = null
let lastHover = 0

function setPointer(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

function shardAt(event) {
  setPointer(event)
  raycaster.setFromCamera(pointer, camera)
  return world.pickShard(raycaster)
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!started) return
  pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() }
  controls.autoRotate = false
})

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!started || !pointerDown) return
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
  const elapsed = performance.now() - pointerDown.time
  pointerDown = null
  scheduleIdle()
  if (moved > 7 || elapsed > 750) return
  const index = shardAt(event)
  if (index >= 0) world.activateShard(index)
})

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!started || event.pointerType === 'touch') return
  const now = performance.now()
  if (now - lastHover < 90) return
  lastHover = now
  const index = shardAt(event)
  renderer.domElement.style.cursor = index >= 0 ? 'pointer' : 'grab'
})

function scheduleIdle() {
  if (!started || reduceMotion) return
  window.clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => {
    if (started) controls.autoRotate = true
  }, 5200)
}

controls.addEventListener('start', () => {
  controls.autoRotate = false
  window.clearTimeout(idleTimer)
})
controls.addEventListener('end', scheduleIdle)

// ---------- UI ----------
function startExperience() {
  if (started) return
  started = true
  document.body.classList.add('started')
  intro.classList.add('hidden')
  window.setTimeout(() => intro.setAttribute('aria-hidden', 'true'), 900)
  controls.autoRotate = !reduceMotion
  scheduleIdle()
}

playButton?.addEventListener('click', startExperience)
intro?.addEventListener('click', (event) => {
  if (event.target === intro) startExperience()
})
window.addEventListener('keydown', (event) => {
  if (!started && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    startExperience()
  }
})

// The inline intro handler can request a start before this module finishes loading.
if (window.__aetheriaStartRequested) startExperience()

themeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const name = button.dataset.theme
    if (!name) return
    world.setTheme(name)
    themeButtons.forEach((item) => item.classList.toggle('active', item === button))
    button.blur()
  })
})

let cameraTween = null
resetButton?.addEventListener('click', () => {
  cameraTween = {
    from: camera.position.clone(),
    to: homePosition(),
    targetFrom: controls.target.clone(),
    targetTo: homeTarget(),
    age: 0,
    life: 0.9,
  }
  controls.autoRotate = false
  scheduleIdle()
})

// ---------- resize ----------
function resize() {
  const width = window.innerWidth
  const height = window.innerHeight
  camera.aspect = width / height
  camera.fov = isPortrait() ? 55 : 42
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(width, height)
  composer.setSize(width, height)
  bloom.setSize(width, height)
}
window.addEventListener('resize', resize)

// ---------- loop ----------
const clock = new THREE.Clock()

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05)

  if (cameraTween) {
    cameraTween.age += dt
    const t = Math.min(1, cameraTween.age / cameraTween.life)
    const ease = t * t * (3 - 2 * t)
    camera.position.lerpVectors(cameraTween.from, cameraTween.to, ease)
    controls.target.lerpVectors(cameraTween.targetFrom, cameraTween.targetTo, ease)
    if (t >= 1) cameraTween = null
  }

  world.update(dt)
  bloom.strength = world.bloomStrength
  controls.update()
  composer.render()
  requestAnimationFrame(animate)
}

animate()

// Expose a tiny hook so automated checks can confirm the world is live.
window.__aetheria = {
  ready: true,
  scene,
  camera,
  renderer,
  world,
  controls,
  start: startExperience,
  get started() {
    return started
  },
  get collected() {
    return world.collected
  },
  get theme() {
    return world.theme
  },
  setTheme: world.setTheme,
  shardScreens: () =>
    world.shards.map((shard) => {
      const point = shard.group.position.clone().project(camera)
      return {
        x: Math.round((point.x * 0.5 + 0.5) * window.innerWidth),
        y: Math.round((-point.y * 0.5 + 0.5) * window.innerHeight),
        active: shard.active,
      }
    }),
  activateAll: () => {
    for (let i = 0; i < world.shardCount; i += 1) world.activateShard(i)
  },
}
