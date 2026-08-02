import * as turf from '@turf/turf'
import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon,
  Position,
} from 'geojson'
import type { MasterPlanLayers, MasterPlanResult } from '@/types/master-plan'
import { buildHospitalCampus, buildSchoolCampus } from '@/utils/civic-footprints'

type LayerKey = keyof Omit<MasterPlanLayers, 'annotations'>

export interface AiGeometryInput {
  roads?: AiLineInput[]
  bike_paths?: AiLineInput[]
  transit?: AiLineInput[]
  residential?: AiPolygonInput[]
  commercial?: AiPolygonInput[]
  office?: AiPolygonInput[]
  public_squares?: AiPolygonInput[]
  industrial?: AiPolygonInput[]
  parks?: AiPolygonInput[]
  green_space?: AiPolygonInput[]
  schools?: Position[]
  hospitals?: Position[]
}

export interface AiLineInput {
  coords: Position[]
  class?: string
  mode?: string
}

export interface AiPolygonInput {
  coords: Position[][]
}

function isInsideBoundary(coord: Position, boundary: Feature<Polygon>): boolean {
  return turf.booleanPointInPolygon(turf.point(coord), boundary)
}

function clipLineToBoundary(line: Feature<LineString>, boundary: Feature<Polygon>): Feature<LineString> | null {
  const coords = line.geometry.coordinates.filter((c) => isInsideBoundary(c, boundary))
  if (coords.length < 2) return null

  try {
    const split = turf.lineSplit(line, boundary)
    if (split.features.length > 0) {
      const longest = split.features.reduce((best, f) => {
        const len = turf.length(f, { units: 'kilometers' })
        const bestLen = turf.length(best, { units: 'kilometers' })
        return len > bestLen ? f : best
      })
      if (longest.geometry.coordinates.length >= 2) return longest
    }
  } catch {
    // use filtered coords
  }

  return turf.lineString(coords, line.properties ?? {})
}

function clipPolygonToBoundary(poly: Feature<Polygon>, boundary: Feature<Polygon>): Feature<Polygon> | null {
  try {
    const result = turf.intersect(turf.featureCollection([poly, boundary]))
    if (result?.geometry.type === 'Polygon' || result?.geometry.type === 'MultiPolygon') {
      return result as Feature<Polygon>
    }
  } catch {
    // fall through
  }

  const centroid = turf.centroid(poly)
  return turf.booleanPointInPolygon(centroid, boundary) ? poly : null
}

function buildLines(
  items: AiLineInput[] | undefined,
  boundary: Feature<Polygon>,
  defaultProps: Record<string, string>,
): FeatureCollection<LineString> {
  if (!items?.length) return turf.featureCollection([])

  const features: Feature<LineString>[] = []

  for (const item of items) {
    if (!item.coords || item.coords.length < 2) continue
    const line = turf.lineString(item.coords, {
      ...defaultProps,
      class: item.class ?? defaultProps.class,
      mode: item.mode,
    })
    const clipped = clipLineToBoundary(line, boundary)
    if (clipped) features.push(clipped)
  }

  return turf.featureCollection(features)
}

function buildPolygons(
  items: AiPolygonInput[] | undefined,
  boundary: Feature<Polygon>,
  landUse: string,
): FeatureCollection<Polygon> {
  if (!items?.length) return turf.featureCollection([])

  const features: Feature<Polygon>[] = []

  for (const item of items) {
    const ring = item.coords?.[0]
    if (!ring || ring.length < 4) continue

    try {
      const poly = turf.polygon([ring], { landUse })
      const clipped = clipPolygonToBoundary(poly, boundary)
      if (clipped && turf.area(clipped) > 500) features.push(clipped)
    } catch {
      continue
    }
  }

  return turf.featureCollection(features)
}

function buildCampuses(
  coords: Position[] | undefined,
  boundary: Feature<Polygon>,
  type: 'school' | 'hospital',
): FeatureCollection<Polygon> {
  if (!coords?.length) return turf.featureCollection([])

  const features = coords
    .filter((c) => isInsideBoundary(c, boundary))
    .map((c, i) => {
      const campus = type === 'school'
        ? buildSchoolCampus(c, i * 17)
        : buildHospitalCampus(c, i * 23 + 8)
      campus.properties = {
        ...campus.properties,
        name: type === 'school' ? `School ${i + 1}` : `Hospital ${i + 1}`,
      }
      return campus
    })

  return turf.featureCollection(features)
}

export function buildLayersFromAiGeometry(
  geometry: AiGeometryInput | undefined,
  boundary: Feature<Polygon>,
): MasterPlanLayers | null {
  if (!geometry) return null

  const layers: MasterPlanLayers = {
    roads: buildLines(geometry.roads, boundary, { type: 'road', class: 'local' }),
    bike_paths: buildLines(geometry.bike_paths, boundary, { type: 'bike', class: 'path' }),
    transit: buildLines(geometry.transit, boundary, { type: 'transit', mode: 'bus' }),
    residential: buildPolygons(geometry.residential, boundary, 'residential'),
    commercial: buildPolygons(geometry.commercial, boundary, 'commercial'),
    office: buildPolygons(geometry.office, boundary, 'office'),
    public_squares: buildPolygons(geometry.public_squares, boundary, 'public-square'),
    industrial: buildPolygons(geometry.industrial, boundary, 'industrial'),
    parks: buildPolygons(geometry.parks, boundary, 'park'),
    green_space: buildPolygons(geometry.green_space, boundary, 'green'),
    schools: buildCampuses(geometry.schools, boundary, 'school'),
    hospitals: buildCampuses(geometry.hospitals, boundary, 'hospital'),
    annotations: [],
  }

  const roadCount = layers.roads.features.length
  const polygonCount =
    layers.residential.features.length +
    layers.commercial.features.length +
    layers.parks.features.length

  if (roadCount < 2 || polygonCount < 2) return null

  return layers
}

export function countGeometryFeatures(layers: MasterPlanLayers): number {
  return (
    layers.roads.features.length +
    layers.bike_paths.features.length +
    layers.transit.features.length +
    layers.residential.features.length +
    layers.commercial.features.length +
    layers.office.features.length +
    layers.public_squares.features.length +
    layers.industrial.features.length +
    layers.parks.features.length +
    layers.green_space.features.length +
    layers.schools.features.length +
    layers.hospitals.features.length
  )
}

export function mergeLayers(
  ai: MasterPlanLayers,
  fallback: MasterPlanResult['layers'],
): MasterPlanLayers {
  const pick = <T extends FeatureCollection>(aiFc: T, fbFc: T): T =>
    (aiFc.features.length > 0 ? aiFc : fbFc) as T

  return {
    roads: pick(ai.roads, fallback.roads),
    bike_paths: pick(ai.bike_paths, fallback.bike_paths),
    transit: pick(ai.transit, fallback.transit),
    residential: pick(ai.residential, fallback.residential),
    commercial: pick(ai.commercial, fallback.commercial),
    office: pick(ai.office, fallback.office),
    public_squares: pick(ai.public_squares, fallback.public_squares),
    industrial: pick(ai.industrial, fallback.industrial),
    parks: pick(ai.parks, fallback.parks),
    green_space: pick(ai.green_space, fallback.green_space),
    schools: pick(ai.schools, fallback.schools),
    hospitals: pick(ai.hospitals, fallback.hospitals),
    annotations: ai.annotations.length > 0 ? ai.annotations : fallback.annotations,
  }
}
