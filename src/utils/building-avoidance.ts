import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Point, Polygon, Position } from 'geojson'

const BUILDING_BLOCK_THRESHOLD = 0.42

/** Spatial index over many tiny constraint cells (basemap scout pixels). */
export class ConstraintIndex {
  private cells: Feature<Polygon>[]
  private bins = new Map<string, number[]>()
  private readonly binDeg: number

  constructor(features: Feature<Polygon>[], binMeters = 40) {
    this.cells = features
    // ~40 m bins at Brisbane latitude
    this.binDeg = binMeters / 111320
    features.forEach((f, i) => {
      try {
        const [minX, minY, maxX, maxY] = turf.bbox(f)
        const x0 = Math.floor(minX / this.binDeg)
        const x1 = Math.floor(maxX / this.binDeg)
        const y0 = Math.floor(minY / this.binDeg)
        const y1 = Math.floor(maxY / this.binDeg)
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            const key = `${x}:${y}`
            const list = this.bins.get(key)
            if (list) list.push(i)
            else this.bins.set(key, [i])
          }
        }
      } catch {
        // skip bad geometry
      }
    })
  }

  get size(): number {
    return this.cells.length
  }

  containsPoint(lon: number, lat: number): boolean {
    if (!this.cells.length) return false
    const key = `${Math.floor(lon / this.binDeg)}:${Math.floor(lat / this.binDeg)}`
    const idxs = this.bins.get(key)
    if (!idxs) return false
    const pt = turf.point([lon, lat])
    for (const i of idxs) {
      try {
        if (turf.booleanPointInPolygon(pt, this.cells[i])) return true
      } catch {
        continue
      }
    }
    return false
  }

  /** Fraction of interior sample points that land in constraints (0–1). */
  coverageRatio(poly: Feature<Polygon>, samplesPerSide = 6): number {
    if (!this.cells.length) return 0
    const [minX, minY, maxX, maxY] = turf.bbox(poly)
    let hits = 0
    let total = 0
    for (let iy = 0; iy <= samplesPerSide; iy++) {
      for (let ix = 0; ix <= samplesPerSide; ix++) {
        const lon = minX + ((maxX - minX) * ix) / samplesPerSide
        const lat = minY + ((maxY - minY) * iy) / samplesPerSide
        const pt = turf.point([lon, lat])
        if (!turf.booleanPointInPolygon(pt, poly)) continue
        total++
        if (this.containsPoint(lon, lat)) hits++
      }
    }
    if (total === 0) {
      const c = turf.centroid(poly).geometry.coordinates
      return this.containsPoint(c[0], c[1]) ? 1 : 0
    }
    return hits / total
  }
}

const indexCache = new WeakMap<FeatureCollection<Polygon>, ConstraintIndex>()

export function getConstraintIndex(
  forbidden: FeatureCollection<Polygon>,
): ConstraintIndex {
  let idx = indexCache.get(forbidden)
  if (!idx) {
    idx = new ConstraintIndex(forbidden.features)
    indexCache.set(forbidden, idx)
  }
  return idx
}

export function buildingCoverageRatio(
  block: Feature<Polygon>,
  buildings: FeatureCollection<Polygon>,
): number {
  const blockArea = turf.area(block)
  if (blockArea < 1) return 1

  let covered = 0
  for (const b of buildings.features) {
    try {
      const intersection = turf.intersect(turf.featureCollection([block, b]))
      if (intersection) covered += turf.area(intersection)
    } catch {
      // ignore invalid intersections
    }
  }
  return covered / blockArea
}

export function subtractBuildingsFromPolygon(
  poly: Feature<Polygon>,
  buildings: FeatureCollection<Polygon>,
): Feature<Polygon> | null {
  let current: Feature<Polygon> | null = poly

  for (const building of buildings.features) {
    if (!current) break
    try {
      if (!turf.booleanIntersects(current, building)) continue
      const diff = turf.difference(turf.featureCollection([current, building]))
      if (!diff) {
        current = null
        break
      }
      if (diff.geometry.type === 'Polygon') {
        current = diff as Feature<Polygon>
      } else if (diff.geometry.type === 'MultiPolygon') {
        const polys = diff.geometry.coordinates.map((coords) => turf.polygon(coords))
        current = polys.sort((a, b) => turf.area(b) - turf.area(a))[0] ?? null
      }
    } catch {
      continue
    }
  }

  if (!current || turf.area(current) < 400) return null
  return current
}

export function lineCrossesBuildings(
  line: Feature<LineString>,
  buildings: FeatureCollection<Polygon>,
): boolean {
  for (const b of buildings.features) {
    try {
      if (turf.booleanIntersects(line, b)) return true
    } catch {
      continue
    }
  }
  return false
}

/**
 * True if a line meaningfully crosses forbidden zones (river / rail).
 * Dense sampling works with thousands of tiny basemap pixel cells.
 */
export function lineCrossesForbidden(
  line: Feature<LineString>,
  forbidden: FeatureCollection<Polygon>,
): boolean {
  if (!forbidden.features.length) return false
  const lengthKm = turf.length(line, { units: 'kilometers' })
  if (lengthKm < 0.004) return false

  const index = getConstraintIndex(forbidden)
  // Sample every ~10 m
  const stepKm = 0.01
  const samples = Math.max(5, Math.ceil(lengthKm / stepKm))
  let hits = 0
  let streak = 0
  let maxStreak = 0

  for (let i = 0; i <= samples; i++) {
    const t = (lengthKm * i) / samples
    const pt = turf.along(line, t, { units: 'kilometers' })
    const [lon, lat] = pt.geometry.coordinates
    if (index.containsPoint(lon, lat)) {
      hits++
      streak++
      if (streak > maxStreak) maxStreak = streak
    } else {
      streak = 0
    }
  }

  // Two consecutive samples (~10–20 m) inside an obstacle = real crossing
  if (maxStreak >= 2) return true
  // Or ≥12% of the line sits on obstacles (long diagonal through river)
  if (hits / (samples + 1) >= 0.12) return true
  // Short spur that dips into water/rail
  if (hits >= 1 && lengthKm < 0.06) return true
  return false
}

/**
 * Filter streets that cross river/rail, keeping up to `maxBridges` as
 * realistic bridges/tunnels (prefer shorter crossings + higher-class roads).
 * Existing motorways/arterials are NOT auto-kept when they cross water —
 * only the rare bridge set is allowed through.
 */
export function filterStreetsAllowingBridges(
  streets: Array<{ id: string; highway: string; coordinates: Position[]; name: string }>,
  forbidden: FeatureCollection<Polygon>,
  _alwaysKeep: (highway: string) => boolean = () => false,
  maxBridges = 3,
): { kept: typeof streets; bridgeIds: Set<string> } {
  const safe: typeof streets = []
  const crossing: typeof streets = []

  for (const s of streets) {
    const line = turf.lineString(s.coordinates)
    if (lineCrossesForbidden(line, forbidden)) crossing.push(s)
    else safe.push(s)
  }

  const rank = (highway: string) => {
    if (['motorway', 'trunk', 'primary', 'secondary'].includes(highway)) return 0
    if (['tertiary', 'unclassified', 'residential'].includes(highway)) return 1
    return 2
  }

  const bridges = [...crossing]
    .sort((a, b) => {
      const la = turf.length(turf.lineString(a.coordinates), { units: 'kilometers' })
      const lb = turf.length(turf.lineString(b.coordinates), { units: 'kilometers' })
      return rank(a.highway) - rank(b.highway) || la - lb
    })
    .slice(0, maxBridges)

  const bridgeIds = new Set(bridges.map((b) => b.id))
  return { kept: [...safe, ...bridges], bridgeIds }
}

export function overlapsAvoidanceTooMuch(
  block: Feature<Polygon>,
  avoidanceAreas: FeatureCollection<Polygon>,
  threshold = 0.25,
): boolean {
  if (!avoidanceAreas.features.length) return false
  // Prefer sampling index for large basemap cell sets
  if (avoidanceAreas.features.length > 40) {
    return getConstraintIndex(avoidanceAreas).coverageRatio(block) > threshold
  }
  for (const area of avoidanceAreas.features) {
    try {
      if (!turf.booleanIntersects(block, area)) continue
      const overlap = turf.intersect(turf.featureCollection([block, area]))
      if (overlap && turf.area(overlap) / turf.area(block) > threshold) return true
    } catch {
      continue
    }
  }
  return false
}

export function isDevelopableBlock(
  block: Feature<Polygon>,
  buildings: FeatureCollection<Polygon>,
  preserveAreas: FeatureCollection<Polygon>,
  hardConstraintAreas: FeatureCollection<Polygon> = turf.featureCollection([]),
): boolean {
  if (buildingCoverageRatio(block, buildings) > BUILDING_BLOCK_THRESHOLD) return false
  if (overlapsAvoidanceTooMuch(block, preserveAreas, 0.25)) return false

  if (hardConstraintAreas.features.length > 0) {
    const index = getConstraintIndex(hardConstraintAreas)
    // Even a thin strip of river/highway/rail through the block is undevelopable
    if (index.coverageRatio(block, 7) > 0.04) return false
    try {
      const c = turf.centroid(block).geometry.coordinates
      if (index.containsPoint(c[0], c[1])) return false
    } catch {
      // ignore
    }
  }
  return true
}

export function prepareDevelopableParcel(
  block: Feature<Polygon>,
  buildings: FeatureCollection<Polygon>,
  preserveAreas: FeatureCollection<Polygon> = turf.featureCollection([]),
  hardConstraintAreas: FeatureCollection<Polygon> = turf.featureCollection([]),
): Feature<Polygon> | null {
  if (!isDevelopableBlock(block, buildings, preserveAreas, hardConstraintAreas)) return null
  let parcel = subtractBuildingsFromPolygon(block, buildings)
  if (!parcel) return null

  // With thousands of basemap pixels, full polygon difference is too slow —
  // reject parcels that still sit on obstacles after building carve.
  if (hardConstraintAreas.features.length > 0) {
    const index = getConstraintIndex(hardConstraintAreas)
    if (index.coverageRatio(parcel, 8) > 0.03) return null
    const c = turf.centroid(parcel).geometry.coordinates
    if (index.containsPoint(c[0], c[1])) return null
  }

  if (!parcel || turf.area(parcel) < 400) return null
  return parcel
}

/** Drop zoning footprints that still overlap hard constraints. */
export function filterFootprintsOffConstraints(
  footprints: Feature<Polygon>[],
  hardConstraintAreas: FeatureCollection<Polygon>,
): Feature<Polygon>[] {
  if (!hardConstraintAreas.features.length) return footprints
  const index = getConstraintIndex(hardConstraintAreas)
  return footprints.filter((f) => {
    if (index.coverageRatio(f, 5) > 0.02) return false
    const c = turf.centroid(f).geometry.coordinates
    return !index.containsPoint(c[0], c[1])
  })
}

export function samplePointsAlongPolygonEdge(
  poly: Feature<Polygon>,
  spacingM = 18,
): Feature<Point>[] {
  const ring = poly.geometry.coordinates[0]
  if (!ring || ring.length < 3) return []

  const line = turf.lineString(ring)
  const lengthKm = turf.length(line, { units: 'kilometers' })
  if (lengthKm < 0.01) return []

  const count = Math.max(4, Math.floor((lengthKm * 1000) / spacingM))
  const points: Feature<Point>[] = []

  for (let i = 0; i < count; i++) {
    const pt = turf.along(line, (lengthKm * i) / count, { units: 'kilometers' })
    pt.properties = { type: 'tree' }
    points.push(pt)
  }

  return points
}

export function pointOnDevelopableLand(
  boundary: Feature<Polygon>,
  buildings: FeatureCollection<Polygon>,
  preserveAreas: FeatureCollection<Polygon>,
  hardConstraintAreas: FeatureCollection<Polygon> = turf.featureCollection([]),
  attempts = 40,
): Position | null {
  const bbox = turf.bbox(boundary)
  const index = hardConstraintAreas.features.length
    ? getConstraintIndex(hardConstraintAreas)
    : null

  for (let i = 0; i < attempts; i++) {
    const pt = turf.randomPoint(1, { bbox: bbox as [number, number, number, number] }).features[0]
    if (!turf.booleanPointInPolygon(pt, boundary)) continue
    if (buildings.features.some((b) => {
      try { return turf.booleanPointInPolygon(pt, b) } catch { return false }
    })) continue
    if (preserveAreas.features.some((p) => {
      try { return turf.booleanPointInPolygon(pt, p) } catch { return false }
    })) continue
    const [lon, lat] = pt.geometry.coordinates
    if (index?.containsPoint(lon, lat)) continue
    return pt.geometry.coordinates
  }
  return null
}

/** Distance in km from a parcel centroid to the nearest water feature (or Infinity). */
export function distanceToWaterways(
  parcel: Feature<Polygon>,
  waterways: FeatureCollection<LineString | Polygon>,
): number {
  if (!waterways.features.length) return Number.POSITIVE_INFINITY
  const c = turf.centroid(parcel)
  let min = Number.POSITIVE_INFINITY
  for (const w of waterways.features) {
    try {
      let d: number
      if (w.geometry.type === 'LineString') {
        d = turf.pointToLineDistance(c, w as Feature<LineString>, { units: 'kilometers' })
      } else {
        d = turf.distance(c, turf.centroid(w), { units: 'kilometers' })
      }
      if (d < min) min = d
    } catch {
      continue
    }
  }
  return min
}
