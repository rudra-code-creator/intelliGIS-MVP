import * as turf from '@turf/turf'
import { v4 as uuid } from 'uuid'
import type { Feature, FeatureCollection, LineString, Polygon, Position } from 'geojson'
import type { MasterPlanResult } from '@/types/master-plan'
import { buildOrientedCampus } from '@/utils/civic-footprints'
import { enrichRoadCollection } from '@/utils/osm-road-enrich'
import { generateRoadName } from '@/utils/road-names'

const CORRIDOR_BUFFER_M = 40
const MIN_ARTERIAL_LENGTH_M = 90
const FOOTPRINT_CLEAR_THRESHOLD = 0.3

function clipArterialToBoundary(
  coords: Position[],
  boundary: Feature<Polygon>,
): Feature<LineString> | null {
  const inside = coords.filter((c) => turf.booleanPointInPolygon(turf.point(c), boundary))
  if (inside.length < 2) return null

  let line = turf.lineString(inside)
  const lenM = turf.length(line, { units: 'kilometers' }) * 1000
  if (lenM < MIN_ARTERIAL_LENGTH_M) return null

  if (inside.length >= 3) {
    try {
      line = turf.bezierSpline(line, { resolution: 10000, sharpness: 0.55 }) as Feature<LineString>
    } catch {
      // keep polyline
    }
  }

  return line
}

function overlapRatio(poly: Feature<Polygon>, zone: Feature<Polygon>): number {
  try {
    const inter = turf.intersect(turf.featureCollection([poly, zone]))
    if (!inter) return 0
    const polyArea = turf.area(poly)
    if (polyArea <= 0) return 0
    return turf.area(inter) / polyArea
  } catch {
    return 0
  }
}

function filterFootprintsOutsideCorridor(
  fc: FeatureCollection<Polygon>,
  corridor: Feature<Polygon>,
): Feature<Polygon>[] {
  return fc.features.filter((f) => {
    if (f.geometry.type !== 'Polygon') return false
    return overlapRatio(f as Feature<Polygon>, corridor) < FOOTPRINT_CLEAR_THRESHOLD
  }) as Feature<Polygon>[]
}

function bearingAtDistance(line: Feature<LineString>, distanceKm: number): number {
  const lenKm = turf.length(line, { units: 'kilometers' })
  const delta = Math.min(0.025, lenKm * 0.15)
  const a = turf.along(line, Math.max(0, distanceKm - delta), { units: 'kilometers' })
  const b = turf.along(line, Math.min(lenKm, distanceKm + delta), { units: 'kilometers' })
  return turf.bearing(a, b)
}

function commercialFrontageAlongArterial(
  arterial: Feature<LineString>,
  boundary: Feature<Polygon>,
  corridor: Feature<Polygon>,
): Feature<Polygon>[] {
  const lenKm = turf.length(arterial, { units: 'kilometers' })
  const parcels: Feature<Polygon>[] = []

  for (let d = 0.06; d < lenKm - 0.04; d += 0.11) {
    const bearing = bearingAtDistance(arterial, d)
    const side = parcels.length % 2 === 0 ? 90 : -90
    const center = turf.along(arterial, d, { units: 'kilometers' })
    const frontCenter = turf.destination(center, 0.042, bearing + side, { units: 'kilometers' })
    const parcel = buildOrientedCampus(
      frontCenter.geometry.coordinates,
      48,
      28,
      bearing,
      { landUse: 'commercial', impression: true, height: 'mid', corridorFrontage: true },
    )

    try {
      const clipped = turf.intersect(turf.featureCollection([parcel, boundary]))
      if (!clipped || clipped.geometry.type !== 'Polygon') continue
      if (overlapRatio(clipped as Feature<Polygon>, corridor) < 0.15) continue
      if (turf.area(clipped) < 400) continue
      clipped.properties = parcel.properties
      parcels.push(clipped as Feature<Polygon>)
    } catch {
      continue
    }
  }

  return parcels.slice(0, 12)
}

function collectorSpurs(
  arterial: Feature<LineString>,
  boundary: Feature<Polygon>,
): Feature<LineString>[] {
  const lenKm = turf.length(arterial, { units: 'kilometers' })
  const spurs: Feature<LineString>[] = []

  for (let d = 0.1; d < lenKm - 0.06; d += 0.19) {
    const pt = turf.along(arterial, d, { units: 'kilometers' })
    const bearing = bearingAtDistance(arterial, d)

    for (const offset of [92, -92]) {
      const end = turf.destination(pt, 0.13, bearing + offset, { units: 'kilometers' })
      if (!turf.booleanPointInPolygon(end, boundary)) continue
      spurs.push(
        turf.lineString([pt.geometry.coordinates, end.geometry.coordinates], {
          type: 'road',
          class: 'collector',
          spur: true,
        }),
      )
    }
  }

  return spurs.slice(0, 14)
}

function parallelBikePath(arterial: Feature<LineString>): Feature<LineString> | null {
  try {
    const offset = turf.lineOffset(arterial, 0.022, { units: 'kilometers' })
    if (!offset || offset.geometry.coordinates.length < 2) return null
    return turf.lineString(offset.geometry.coordinates, {
      type: 'bike',
      class: 'protected',
      alongArterial: true,
    })
  } catch {
    return null
  }
}

function existingRoadNames(plan: MasterPlanResult): Set<string> {
  const used = new Set<string>()
  for (const feature of plan.layers.roads.features) {
    const name = feature.properties?.name
    if (typeof name === 'string' && name.trim()) used.add(name.trim().toLowerCase())
  }
  return used
}

export interface ArterialAdaptResult {
  plan: MasterPlanResult
  roadName: string
  arterial: Feature<LineString>
}

export function adaptMasterPlanAroundArterial(
  plan: MasterPlanResult,
  drawnCoords: Position[],
  boundary: Feature<Polygon>,
): ArterialAdaptResult | null {
  const arterial = clipArterialToBoundary(drawnCoords, boundary)
  if (!arterial) return null

  const usedNames = existingRoadNames(plan)
  const roadName = generateRoadName('arterial', plan.layers.roads.features.length + 7, usedNames)

  const arterialFeature = turf.lineString(arterial.geometry.coordinates, {
    type: 'road',
    class: 'arterial',
    name: roadName,
    userDrawn: true,
    widthM: 28,
    manual: true,
  })

  const corridor = turf.buffer(arterial, CORRIDOR_BUFFER_M, { units: 'meters', steps: 8 })
  if (!corridor || corridor.geometry.type !== 'Polygon') return null
  const corridorPoly = corridor as Feature<Polygon>

  const residential = filterFootprintsOutsideCorridor(plan.layers.residential, corridorPoly)
  const commercial = [
    ...filterFootprintsOutsideCorridor(plan.layers.commercial, corridorPoly),
    ...commercialFrontageAlongArterial(arterial, boundary, corridorPoly),
  ]
  const industrial = filterFootprintsOutsideCorridor(plan.layers.industrial, corridorPoly)

  const spurs = collectorSpurs(arterial, boundary)
  const manualRoads = enrichRoadCollection(
    turf.featureCollection([arterialFeature, ...spurs]),
  )

  const keptRoads = plan.layers.roads.features.filter((f) => !f.properties?.userDrawn)
  const roads = enrichRoadCollection(
    turf.featureCollection([...manualRoads.features, ...keptRoads]),
  )

  const transitLine = turf.lineString(arterial.geometry.coordinates, {
    type: 'transit',
    mode: 'brt',
    name: `${roadName} Transit`,
    alongArterial: true,
    userDrawn: true,
  })
  const keptTransit = plan.layers.transit.features.filter((f) => !f.properties?.userDrawn)
  const transit = turf.featureCollection([transitLine, ...keptTransit])

  const bikePath = parallelBikePath(arterial)
  const keptBike = plan.layers.bike_paths.features.filter((f) => !f.properties?.alongArterial)
  const bike_paths = bikePath
    ? turf.featureCollection([bikePath, ...keptBike])
    : plan.layers.bike_paths

  const lenM = Math.round(turf.length(arterial, { units: 'kilometers' }) * 1000)
  const midpoint = turf.along(arterial, turf.length(arterial, { units: 'kilometers' }) / 2, {
    units: 'kilometers',
  })

  const annotations = [
    ...plan.layers.annotations.filter((a) => !a.text.includes('Arterial')),
    {
      id: uuid(),
      text: `${roadName} corridor`,
      coordinates: midpoint.geometry.coordinates,
    },
  ]

  const adapted: MasterPlanResult = {
    ...plan,
    layers: {
      ...plan.layers,
      roads,
      transit,
      bike_paths,
      residential: turf.featureCollection(residential),
      commercial: turf.featureCollection(commercial),
      industrial: turf.featureCollection(industrial),
      annotations,
    },
    summary: {
      ...plan.summary,
      narrative: `${plan.summary.narrative} A user-placed major arterial (${roadName}, ${lenM} m) reshapes the block structure with transit-oriented commercial frontage and connecting collector streets.`,
      transitAccessibility: Math.min(plan.summary.transitAccessibility + 10, 98),
      walkabilityScore: Math.min(plan.summary.walkabilityScore + 4, 95),
      estimatedJobs: Math.round(plan.summary.estimatedJobs * 1.06),
    },
  }

  return { plan: adapted, roadName, arterial: arterialFeature }
}
