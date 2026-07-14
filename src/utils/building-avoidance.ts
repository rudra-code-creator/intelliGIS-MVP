import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Point, Polygon, Position } from 'geojson'

const BUILDING_BLOCK_THRESHOLD = 0.42

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

export function isDevelopableBlock(
  block: Feature<Polygon>,
  buildings: FeatureCollection<Polygon>,
  preserveAreas: FeatureCollection<Polygon>,
): boolean {
  if (buildingCoverageRatio(block, buildings) > BUILDING_BLOCK_THRESHOLD) return false

  for (const preserve of preserveAreas.features) {
    try {
      if (turf.booleanIntersects(block, preserve)) {
        const overlap = turf.intersect(turf.featureCollection([block, preserve]))
        if (overlap && turf.area(overlap) / turf.area(block) > 0.25) return false
      }
    } catch {
      continue
    }
  }

  return true
}

export function prepareDevelopableParcel(
  block: Feature<Polygon>,
  buildings: FeatureCollection<Polygon>,
  preserveAreas: FeatureCollection<Polygon> = turf.featureCollection([]),
): Feature<Polygon> | null {
  if (!isDevelopableBlock(block, buildings, preserveAreas)) return null
  return subtractBuildingsFromPolygon(block, buildings)
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
  attempts = 40,
): Position | null {
  const bbox = turf.bbox(boundary)
  for (let i = 0; i < attempts; i++) {
    const pt = turf.randomPoint(1, { bbox: bbox as [number, number, number, number] }).features[0]
    if (!turf.booleanPointInPolygon(pt, boundary)) continue
    if (buildings.features.some((b) => {
      try { return turf.booleanPointInPolygon(pt, b) } catch { return false }
    })) continue
    if (preserveAreas.features.some((p) => {
      try { return turf.booleanPointInPolygon(pt, p) } catch { return false }
    })) continue
    return pt.geometry.coordinates
  }
  return turf.centroid(boundary).geometry.coordinates
}
