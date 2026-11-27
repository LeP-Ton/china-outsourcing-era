interface RandomState { rng: number }

export function seedNumber(seed: string): number {
  let hash = 2166136261
  for (const character of seed) {
    hash ^= character.codePointAt(0)!
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) || 1
}

export function random(state: RandomState): number {
  let value = state.rng
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.rng = value >>> 0
  return state.rng / 4294967296
}

export function range(state: RandomState, min: number, max: number): number {
  return min + random(state) * (max - min)
}

export function pick<T>(state: RandomState, values: readonly T[]): T {
  return values[Math.floor(random(state) * values.length)]!
}

export function nextId(state: { nextId: number }, prefix: string): string {
  return `${prefix}-${state.nextId++}`
}
