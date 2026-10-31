// Small deterministic value-noise helpers used to sculpt the isles.

export function mulberry32(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// Value noise with four octaves. Returns a function in roughly [-1, 1].
export function makeNoise2D(seed = 1) {
  const offset = seed * 13.37
  const hash = (x, y) => {
    const value = Math.sin(x * 127.1 + y * 311.7 + offset) * 43758.5453123
    return value - Math.floor(value)
  }
  const noise = (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const a = hash(xi, yi)
    const b = hash(xi + 1, yi)
    const c = hash(xi, yi + 1)
    const d = hash(xi + 1, yi + 1)
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
  }
  return (x, y) => {
    let amplitude = 1
    let frequency = 1
    let sum = 0
    let norm = 0
    for (let i = 0; i < 4; i += 1) {
      sum += amplitude * noise(x * frequency, y * frequency)
      norm += amplitude
      amplitude *= 0.5
      frequency *= 2.03
    }
    return (sum / norm) * 2 - 1
  }
}
