/** Small seeded PRNG (mulberry32) so generative art is identical on every render. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function between(random: () => number, min: number, max: number): number {
  return min + random() * (max - min)
}

/** Uniformly distributed point inside a circle. */
export function pointInDisc(random: () => number, cx: number, cy: number, radius: number): { x: number; y: number } {
  const angle = random() * Math.PI * 2
  const distance = Math.sqrt(random()) * radius
  return { x: cx + Math.cos(angle) * distance, y: cy + Math.sin(angle) * distance }
}

/** Rounds to two decimals to keep generated SVG attributes compact. */
export function round(value: number): number {
  return Math.round(value * 100) / 100
}
