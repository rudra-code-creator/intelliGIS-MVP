/**
 * Building height utilities for 3D massing in MapLibre fill-extrusion layers.
 * Heights are stored as feature properties: `heightM` (metres above ground)
 * and `baseM` (elevation of the base, for stacked podium/tower forms).
 */

/** Deterministic [0,1] hash from a string seed. */
export function hash01(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = (Math.imul(h, 16777619) >>> 0)
  }
  return (h >>> 0) / 4294967295
}

/** Linear interpolation. */
export function lerpHeight(min: number, max: number, t: number): number {
  return Math.round(min + (max - min) * t)
}

/** Categorical fallback heights by `height` property value. */
export const BUILDING_HEIGHT_M: Record<string, number> = {
  skyscraper: 220,
  high:       90,
  tower:      70,
  mid:        28,
  low:        9,
  warehouse:  11,
  residential: 9,
  commercial:  20,
  office:      45,
  plaza:        1,
}

export const EXISTING_BUILDING_HEIGHT_M = 10
export const SCHOOL_HEIGHT_M = 18
export const HOSPITAL_HEIGHT_M = 36

/**
 * MapLibre expression that resolves a feature's height in metres.
 * Priority: `heightM` property → categorical `height` label → 8 m default.
 */
export function buildingHeightExpression(): unknown[] {
  const catEntries: unknown[] = []
  for (const [key, val] of Object.entries(BUILDING_HEIGHT_M)) {
    catEntries.push(key, val)
  }
  catEntries.push(8) // default

  return [
    'coalesce',
    ['get', 'heightM'],
    ['match', ['get', 'height'], ...catEntries],
  ]
}

/**
 * MapLibre expression for the base (bottom) height of an extrusion.
 * Uses `baseM` if present, else 0.
 */
export function buildingBaseExpression(): unknown[] {
  return ['coalesce', ['get', 'baseM'], 0]
}
