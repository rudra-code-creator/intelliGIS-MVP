import * as turf from '@turf/turf'
import type { Feature, LineString, Polygon, Position } from 'geojson'
import type { OsmStreet } from '@/utils/osm-context'

/** Urban fabric layout styles inspired by classic planning diagrams */
export type LayoutStyle =
  | 'grid'
  | 'loose-grid'
  | 'suburban'
  | 'irregular'
  | 'organic'
  | 'stem'
  | 'linear'
  | 'superblock'
  | 'radial'

const MIX_PALETTE: LayoutStyle[] = [
  'grid',
  'loose-grid',
  'suburban',
  'irregular',
  'organic',
  'stem',
  'linear',
  'superblock',
  'radial',
]

function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function cellSizeMultiplier(gx: number, gy: number, style: LayoutStyle): number {
  const hash = ((gx * 73856093) ^ (gy * 19349663)) >>> 0
  const base = 0.58 + (hash % 72) / 100
  if (style === 'superblock') return base * 1.85
  if (style === 'linear') return gx % 2 === 0 ? base * 0.55 : base * 1.65
  if (style === 'loose-grid') return 0.7 + (hash % 90) / 100
  if (style === 'organic') return 0.55 + (hash % 110) / 100
  if (style === 'irregular') return 0.5 + (hash % 100) / 100
  if (style === 'suburban') return 0.75 + (hash % 60) / 100
  if (style === 'radial') return 0.65 + (hash % 80) / 100
  return base
}

function styleRotationJitter(gx: number, gy: number, style: LayoutStyle): number {
  const hash = ((gx * 2654435761) ^ (gy * 2246822519)) >>> 0
  if (style === 'irregular') return ((hash % 50) - 25)
  if (style === 'organic') return ((hash % 36) - 18)
  if (style === 'loose-grid') return ((hash % 16) - 8)
  if (style === 'stem') return gy % 2 === 0 ? 18 : -18
  if (style === 'radial') return ((gx + gy) * 12) % 60
  if (style === 'suburban') return ((hash % 28) - 14)
  return 0
}

/** Pick 3–4 complementary styles for one neighbourhood mix. */
export function pickNeighbourhoodStyleMix(seedKey: string): LayoutStyle[] {
  const seed = hashSeed(seedKey)
  const shuffled = [...MIX_PALETTE].sort(
    (a, b) => (hashSeed(seedKey + a) % 997) - (hashSeed(seedKey + b) % 997),
  )
  // Always include one "structured" and one "organic/suburban" character
  const mix: LayoutStyle[] = []
  const structured = shuffled.find((s) => ['grid', 'loose-grid', 'linear', 'superblock'].includes(s))
  const soft = shuffled.find((s) => ['suburban', 'organic', 'irregular', 'radial'].includes(s))
  if (structured) mix.push(structured)
  if (soft && soft !== structured) mix.push(soft)
  for (const s of shuffled) {
    if (mix.length >= 4) break
    if (!mix.includes(s)) mix.push(s)
  }
  // Deterministic rotate
  const rot = seed % mix.length
  return [...mix.slice(rot), ...mix.slice(0, rot)]
}

/**
 * Generate parcel blocks in a chosen layout style within a clip polygon.
 */
export function generateStyledBlocks(
  clip: Feature<Polygon>,
  cellM: number,
  baseRotationDeg: number,
  style: LayoutStyle,
): Feature<Polygon>[] {
  const centroid = turf.centroid(clip)
  const rotated = turf.transformRotate(clip, -baseRotationDeg, { pivot: centroid })
  const bbox = turf.bbox(rotated)
  const [minX, minY, maxX, maxY] = bbox
  const mPerDegLng = 111320 * Math.cos((centroid.geometry.coordinates[1] * Math.PI) / 180)

  const cells: Feature<Polygon>[] = []
  let gy = 0
  let y = minY
  while (y < maxY) {
    const latMult = cellSizeMultiplier(0, gy, style)
    let cellLat = (cellM * latMult) / 111320
    if (style === 'linear') cellLat *= 0.72
    if (style === 'superblock') cellLat *= 1.4
    if (style === 'radial') cellLat *= 0.9

    let gx = 0
    let x = minX
    while (x < maxX) {
      const lngMult = cellSizeMultiplier(gx, gy, style)
      let cellLng = (cellM * lngMult) / mPerDegLng
      if (style === 'linear') cellLng *= 1.55
      if (style === 'superblock') cellLng *= 1.35
      if (style === 'stem' && gx % 3 !== 1) cellLng *= 1.25
      if (style === 'radial') cellLng *= 0.95

      try {
        const jitter = styleRotationJitter(gx, gy, style)
        const cell = turf.bboxPolygon([x, y, x + cellLng, y + cellLat])
        const jittered = jitter !== 0
          ? turf.transformRotate(cell, jitter, { pivot: turf.centroid(cell) })
          : cell
        const clipped = turf.intersect(turf.featureCollection([jittered, rotated]))
        if (!clipped || clipped.geometry.type !== 'Polygon') {
          x += cellLng
          gx += 1
          continue
        }
        const area = turf.area(clipped)
        const minArea = style === 'superblock' ? 2500 : 900
        const maxArea = style === 'superblock' ? 420000 : 220000
        if (area >= minArea && area <= maxArea) {
          const world = turf.transformRotate(clipped, baseRotationDeg, { pivot: centroid }) as Feature<Polygon>
          world.properties = { ...(world.properties ?? {}), layoutStyle: style }
          cells.push(world)
        }
      } catch {
        // skip
      }
      x += cellLng
      gx += 1
    }
    y += cellLat
    gy += 1
  }

  return cells
}

/** Split boundary into quadrant-ish zones for mixed fabric. */
function partitionNeighbourhoodZones(
  boundary: Feature<Polygon>,
  count: number,
): Feature<Polygon>[] {
  const bbox = turf.bbox(boundary)
  const [minX, minY, maxX, maxY] = bbox
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  const thirdX = minX + (maxX - minX) / 3
  const twoThirdX = minX + (2 * (maxX - minX)) / 3

  const rawBoxes: Array<[number, number, number, number]> =
    count <= 3
      ? [
          [minX, minY, thirdX, maxY],
          [thirdX, minY, twoThirdX, maxY],
          [twoThirdX, minY, maxX, maxY],
        ]
      : [
          [minX, midY, midX, maxY],
          [midX, midY, maxX, maxY],
          [minX, minY, midX, midY],
          [midX, minY, maxX, midY],
        ]

  const zones: Feature<Polygon>[] = []
  for (const box of rawBoxes.slice(0, count)) {
    try {
      const rect = turf.bboxPolygon(box)
      const clipped = turf.intersect(turf.featureCollection([rect, boundary]))
      if (clipped && clipped.geometry.type === 'Polygon' && turf.area(clipped) > 5000) {
        zones.push(clipped as Feature<Polygon>)
      } else if (clipped && clipped.geometry.type === 'MultiPolygon') {
        const best = clipped.geometry.coordinates
          .map((c) => turf.polygon(c))
          .sort((a, b) => turf.area(b) - turf.area(a))[0]
        if (best && turf.area(best) > 5000) zones.push(best)
      }
    } catch {
      continue
    }
  }
  return zones.length > 0 ? zones : [boundary]
}

/**
 * Build a realistic neighbourhood by mixing several street layout styles across zones.
 */
export function generateMixedNeighbourhoodBlocks(
  boundary: Feature<Polygon>,
  cellM: number,
  baseRotationDeg: number,
  seedKey: string,
): { blocks: Feature<Polygon>[]; stylesUsed: LayoutStyle[] } {
  const styles = pickNeighbourhoodStyleMix(seedKey)
  const zones = partitionNeighbourhoodZones(boundary, Math.min(4, styles.length))
  const blocks: Feature<Polygon>[] = []
  const stylesUsed: LayoutStyle[] = []

  zones.forEach((zone, i) => {
    const style = styles[i % styles.length]
    stylesUsed.push(style)
    const zoneRotation =
      style === 'radial'
        ? baseRotationDeg + (i * 25)
        : style === 'irregular'
          ? baseRotationDeg + ((hashSeed(seedKey + style) % 30) - 15)
          : baseRotationDeg
    const zoneBlocks = generateStyledBlocks(zone, cellM, zoneRotation, style)
    blocks.push(...zoneBlocks)
  })

  return { blocks, stylesUsed: [...new Set(stylesUsed)] }
}

/** Short cul-de-sac stubs branching from local/collector streets (suburban character). */
export function buildCulDeSacSpurs(
  streets: OsmStreet[],
  boundary: Feature<Polygon>,
  count = 8,
): Feature<LineString>[] {
  const candidates = streets.filter((s) =>
    ['residential', 'living_street', 'unclassified', 'tertiary', 'service'].includes(s.highway),
  )
  if (candidates.length === 0) return []

  const spurs: Feature<LineString>[] = []
  const step = Math.max(1, Math.floor(candidates.length / count))

  for (let i = 0; i < candidates.length && spurs.length < count; i += step) {
    const street = candidates[i]
    const coords = street.coordinates
    if (coords.length < 2) continue
    const midIdx = Math.floor(coords.length / 2)
    const a = coords[Math.max(0, midIdx - 1)]
    const b = coords[Math.min(coords.length - 1, midIdx + 1)]
    const bearing = turf.bearing(turf.point(a), turf.point(b))
    const side = (i % 2 === 0 ? 90 : -90)
    const origin = coords[midIdx]
    const tip = turf.destination(turf.point(origin), 0.06, bearing + side, { units: 'kilometers' })
    if (!turf.booleanPointInPolygon(tip, boundary)) continue

    const bulb = turf.destination(tip, 0.025, bearing + side + 90, { units: 'kilometers' })
    const spur = turf.lineString(
      [origin, tip.geometry.coordinates, bulb.geometry.coordinates],
      { type: 'road', class: 'cul-de-sac', layoutStyle: 'suburban', name: `${street.name} Court` },
    )
    spurs.push(spur)
  }

  return spurs
}

export function layoutSeedFromBoundary(boundary: Feature<Polygon>): string {
  const c = turf.centroid(boundary).geometry.coordinates
  return `${c[0].toFixed(3)},${c[1].toFixed(3)}`
}

export function layoutStyleLabel(style: LayoutStyle): string {
  return style.replace(/-/g, ' ')
}

/** @deprecated prefer pickNeighbourhoodStyleMix */
export function pickLayoutStyle(prompt: string, seedKey: string): LayoutStyle {
  const mix = pickNeighbourhoodStyleMix(seedKey + prompt.slice(0, 20))
  return mix[0]
}
