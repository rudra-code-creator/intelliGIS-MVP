import * as turf from '@turf/turf'
import { v4 as uuid } from 'uuid'
import type { Feature, FeatureCollection, LineString, Point, Polygon, Position } from 'geojson'
import type { MasterPlanLayers } from '@/types/master-plan'
import type { OsmStreet, SiteContext } from '@/utils/osm-context'
import { buildTransportForbiddenAreas, HARD_HIGHWAYS } from '@/utils/osm-context'
import {
  distanceToWaterways,
  filterFootprintsOffConstraints,
  filterStreetsAllowingBridges,
  getConstraintIndex,
  isDevelopableBlock,
  lineCrossesForbidden,
  pointOnDevelopableLand,
  prepareDevelopableParcel,
  samplePointsAlongPolygonEdge,
} from '@/utils/building-avoidance'
import { buildHospitalCampus, buildSchoolCampus } from '@/utils/civic-footprints'
import { enrichRoadCollection } from '@/utils/osm-road-enrich'
import { generateStyledBlocks } from '@/utils/layout-styles'
import type { RoadClass } from '@/utils/road-names'

export interface PlanIntent {
  cbd: boolean
  highDensity: boolean
  greenCity: boolean
  waterfront: boolean
  transit: boolean
  industrial: boolean
  moreParks: boolean
  longerTransit: boolean
}

export function parsePlanIntent(prompt: string): PlanIntent {
  const p = prompt.toLowerCase()
  return {
    cbd: /\b(cbd|second cbd|central business|downtown|city centre|city center|commercial hub|business district)\b/.test(p),
    highDensity: /\b(dense|density|high.?rise|urban infill|second cbd|tower|mid.?rise)\b/.test(p),
    greenCity: /\b(green|park|garden|sustainable|eco)\b/.test(p),
    waterfront: /\b(waterfront|river|harbour|harbor|bay|coastal)\b/.test(p),
    transit: /\b(transit|tod|rail|metro|brt|bus)\b/.test(p),
    industrial: /\b(industrial|warehouse|logistics|manufacturing|employment zone|factory)\b/.test(p),
    moreParks: /\b(more park|add park|extra park|more green|open space|playground)\b/.test(p),
    longerTransit: /\b(longer transit|extend transit|more transit|expand transit|longer rail|extend bus|longer lines)\b/.test(p),
  }
}

function highwayToClass(highway: string): RoadClass {
  // Motorway/trunk always remain the arterial spine
  if (HARD_HIGHWAYS.has(highway) || highway === 'primary') return 'arterial'
  if (['secondary', 'tertiary'].includes(highway)) return 'collector'
  if (['residential', 'living_street', 'unclassified'].includes(highway)) return 'local'
  if (highway === 'service') return 'cul-de-sac'
  return 'local'
}

function buildRoadsFromStreets(
  streets: OsmStreet[],
  forbidden: FeatureCollection<Polygon>,
  bridgeIds: Set<string>,
): FeatureCollection<LineString> {
  const raw = turf.featureCollection(
    streets.map((s) =>
      turf.lineString(s.coordinates, {
        class: highwayToClass(s.highway),
        type: 'road',
        name: s.name,
        highway: s.highway,
        fromOsm: true,
        bridge: bridgeIds.has(s.id) || undefined,
      }),
    ),
  )
  return enrichRoadCollection(raw)
}

function normalizeGridRotation(bearingFromNorth: number): number {
  let rotation = ((bearingFromNorth % 90) + 90) % 90
  if (rotation > 45) rotation -= 90
  return rotation
}

function boundaryGridRotation(boundary: Feature<Polygon>): number {
  const ring = boundary.geometry.coordinates[0]
  let longestM = 0
  let rotation = 0

  for (let i = 0; i < ring.length - 1; i++) {
    const lengthM = turf.distance(ring[i], ring[i + 1], { units: 'kilometers' }) * 1000
    if (lengthM <= longestM) continue
    longestM = lengthM
    rotation = normalizeGridRotation(turf.bearing(turf.point(ring[i]), turf.point(ring[i + 1])))
  }

  return rotation
}

function computeStreetGridRotation(streets: OsmStreet[], boundary: Feature<Polygon>): number {
  if (streets.length === 0) return boundaryGridRotation(boundary)

  const buckets = new Map<number, number>()
  for (const street of streets) {
    const coords = street.coordinates
    for (let i = 0; i < coords.length - 1; i++) {
      const len = turf.distance(coords[i], coords[i + 1], { units: 'kilometers' })
      if (len < 0.025) continue
      const bearing = turf.bearing(turf.point(coords[i]), turf.point(coords[i + 1]))
      const rotation = normalizeGridRotation(bearing)
      const bucket = Math.round(rotation / 2.5)
      const weight = len * len
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + weight)
    }
  }

  let bestBucket = 0
  let bestWeight = 0
  for (const [bucket, weight] of buckets) {
    if (weight > bestWeight) {
      bestWeight = weight
      bestBucket = bucket
    }
  }

  return bestWeight > 0 ? bestBucket * 2.5 : boundaryGridRotation(boundary)
}

function estimateBlockSpacingM(streets: OsmStreet[]): number {
  if (streets.length === 0) return 140
  const lengths = streets
    .map((s) => turf.length(turf.lineString(s.coordinates), { units: 'kilometers' }) * 1000)
    .filter((l) => l > 40 && l < 400)
    .sort((a, b) => a - b)
  if (lengths.length === 0) return 100
  const median = lengths[Math.floor(lengths.length / 2)]
  return Math.min(140, Math.max(85, Math.round(median * 0.55)))
}

function polygonizeStreetBlocks(
  streets: OsmStreet[],
  boundary: Feature<Polygon>,
): Feature<Polygon>[] {
  if (streets.length < 2 || streets.length > 120) return []

  try {
    const lineFeatures = streets.map((s) => turf.lineString(s.coordinates))
    const polygonized = turf.polygonize(turf.featureCollection(lineFeatures))
    return polygonized.features
      .map((poly) => {
        try {
          const clipped = turf.intersect(turf.featureCollection([poly, boundary]))
          return clipped as Feature<Polygon> | null
        } catch {
          return null
        }
      })
      .filter((p): p is Feature<Polygon> => {
        if (!p) return false
        const area = turf.area(p)
        return area > 800 && area < 120000
      })
  } catch {
    return []
  }
}

function extractBlocksFromStreets(
  streets: OsmStreet[],
  boundary: Feature<Polygon>,
  gridBearing: number,
): Feature<Polygon>[] {
  const polygonized = polygonizeStreetBlocks(streets, boundary)
  if (polygonized.length >= 3) return polygonized
  const cellM = estimateBlockSpacingM(streets)
  return generateStyledBlocks(boundary, cellM, gridBearing, 'grid')
}

type LandUseParcel = 'commercial' | 'residential' | 'industrial'

function parcelToFootprints(
  parcel: Feature<Polygon>,
  landUse: LandUseParcel,
  intent: PlanIntent,
  gridBearing: number,
): Feature<Polygon>[] {
  const area = turf.area(parcel)
  if (area > 35000) {
    return subdivideIntoFootprints(parcel, landUse, intent, gridBearing, 2)
  }

  const insetM = landUse === 'commercial' ? 6 : landUse === 'industrial' ? 5 : 10
  let footprint = turf.buffer(parcel, -insetM, { units: 'meters', steps: 4 })
  if (!footprint || turf.area(footprint) < 400) footprint = parcel
  if (footprint.geometry.type === 'MultiPolygon') {
    const polys = footprint.geometry.coordinates.map((c) => turf.polygon(c))
    footprint = polys.sort((a, b) => turf.area(b) - turf.area(a))[0]
  }
  if (!footprint || turf.area(footprint) < 250) return []

  footprint.properties = {
    landUse,
    impression: true,
    height: landUse === 'commercial' ? (intent.cbd ? 'high' : 'mid') : landUse === 'industrial' ? 'warehouse' : 'low',
  }
  return [footprint as Feature<Polygon>]
}

function subdivideIntoFootprints(
  parcel: Feature<Polygon>,
  landUse: LandUseParcel,
  intent: PlanIntent,
  gridRotationDeg: number,
  maxPieces = 4,
): Feature<Polygon>[] {
  const insetM = landUse === 'commercial' ? (intent.cbd ? 4 : 6) : landUse === 'industrial' ? 4 : 8
  let inset = turf.buffer(parcel, -insetM, { units: 'meters', steps: 4 })
  if (!inset) return []
  if (inset.geometry.type === 'MultiPolygon') {
    const polys = inset.geometry.coordinates.map((c) => turf.polygon(c))
    inset = polys.sort((a, b) => turf.area(b) - turf.area(a))[0]
  }
  if (!inset || turf.area(inset) < 300) return []

  const area = turf.area(inset)
  let count = 1
  if (landUse === 'commercial') {
    count = intent.cbd ? (area > 12000 ? 2 : 1) : area > 8000 ? 2 : 1
  } else if (landUse === 'industrial') {
    count = area > 14000 ? 2 : 1
  } else {
    count = area > 12000 ? 3 : area > 7000 ? 2 : 1
  }
  count = Math.min(count, maxPieces)

  const pivot = turf.centroid(inset)
  const rotatedInset = turf.transformRotate(inset, -gridRotationDeg, { pivot }) as Feature<Polygon>
  const bbox = turf.bbox(rotatedInset)
  const [minX, minY, maxX, maxY] = bbox
  const cols = count <= 2 ? count : count <= 4 ? 2 : 3
  const rows = Math.ceil(count / cols)
  const footprints: Feature<Polygon>[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (footprints.length >= count) break
      const padX = (maxX - minX) * 0.04
      const padY = (maxY - minY) * 0.04
      const w = (maxX - minX - padX * 2) / cols
      const h = (maxY - minY - padY * 2) / rows
      const x1 = minX + padX + c * w
      const y1 = minY + padY + r * h
      try {
        const rect = turf.bboxPolygon([x1, y1, x1 + w * 0.92, y1 + h * 0.92])
        const clipped = turf.intersect(turf.featureCollection([rect, rotatedInset]))
        if (!clipped || clipped.geometry.type !== 'Polygon' || turf.area(clipped) <= 200) continue
        const world = turf.transformRotate(clipped, gridRotationDeg, { pivot }) as Feature<Polygon>
        const finalClip = turf.intersect(turf.featureCollection([world, inset]))
        if (!finalClip || finalClip.geometry.type !== 'Polygon' || turf.area(finalClip) <= 200) continue
        finalClip.properties = {
          landUse,
          impression: true,
          height: landUse === 'commercial' ? (intent.cbd ? 'high' : 'mid') : landUse === 'industrial' ? 'warehouse' : 'low',
        }
        footprints.push(finalClip as Feature<Polygon>)
      } catch {
        continue
      }
    }
  }

  if (footprints.length === 0) {
    inset.properties = { landUse, impression: true }
    footprints.push(inset as Feature<Polygon>)
  }

  return footprints
}

/** Zoning no-build: rivers, rail, highways, arterials (all hardConstraintAreas). */
function zoningForbidden(context: SiteContext): FeatureCollection<Polygon> {
  if (context.hardConstraintAreas?.features.length) {
    return context.hardConstraintAreas
  }
  return buildTransportForbiddenAreas(
    context.waterways?.features ?? [],
    context.railways?.features ?? [],
  )
}

/**
 * Crossing no-build for roads / bike / transit: river + rail only.
 * (Highway/arterial pixels are existing roads — do not treat every arterial
 * segment as a "crossing". Bridges/tunnels are rare exceptions over water/rail.)
 */
function crossingForbidden(context: SiteContext): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = []

  const scan = context.basemapScan
  if (scan?.rivers?.features?.length) features.push(...scan.rivers.features)
  if (scan?.railways?.features?.length) features.push(...scan.railways.features)

  // Fallback / supplement with vector river polygons + rail buffers
  const vector = buildTransportForbiddenAreas(
    context.waterways?.features ?? [],
    context.railways?.features ?? [],
  )
  features.push(...vector.features)

  if (features.length === 0 && context.hardConstraintAreas?.features.length) {
    // Last resort: river/rail-kind cells from the full hard set
    for (const f of context.hardConstraintAreas.features) {
      const kind = String(f.properties?.kind ?? '')
      if (kind === 'river' || kind === 'rail' || kind === 'railway') features.push(f)
    }
  }

  return turf.featureCollection(features)
}

function buildDevelopableParcels(
  blocks: Feature<Polygon>[],
  context: SiteContext,
  boundary: Feature<Polygon>,
): Array<{ parcel: Feature<Polygon>; area: number; dist: number; waterDist: number }> {
  const centroid = turf.centroid(boundary)
  const hard = zoningForbidden(context)
  const waterways = context.waterways ?? turf.featureCollection([])

  const mapBlocks = (relaxed: boolean) =>
    blocks
      .map((block) => {
        // Never relax hard infrastructure — water/rail/motorway/arterial stay non-developable
        if (!isDevelopableBlock(block, context.buildings, context.preserveAreas, hard)) {
          if (!relaxed) return null
          // Relaxed mode may ignore building/preserve density, but still skip hard constraints
          if (!isDevelopableBlock(block, turf.featureCollection([]), turf.featureCollection([]), hard)) {
            return null
          }
        }
        const parcel = relaxed
          ? prepareDevelopableParcel(block, context.buildings, turf.featureCollection([]), hard)
          : prepareDevelopableParcel(block, context.buildings, context.preserveAreas, hard)
        if (!parcel || turf.area(parcel) < 300) return null
        return {
          parcel,
          area: turf.area(parcel),
          dist: turf.distance(centroid, turf.centroid(parcel), { units: 'kilometers' }),
          waterDist: distanceToWaterways(parcel, waterways),
        }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => b.area - a.area)

  let developable = mapBlocks(false)
  if (developable.length < 3) developable = mapBlocks(true)
  // No last-resort that ignores hard constraints — empty is better than building on the river

  return developable
}

function classifyAndBuildLayers(
  blocks: Feature<Polygon>[],
  context: SiteContext,
  boundary: Feature<Polygon>,
  intent: PlanIntent,
  gridBearing: number,
): {
  commercial: Feature<Polygon>[]
  residential: Feature<Polygon>[]
  industrial: Feature<Polygon>[]
  parks: Feature<Polygon>[]
  green_space: Feature<Polygon>[]
  trees: Feature<Point>[]
} {
  const hasWater = (context.waterways?.features.length ?? 0) > 0
  const waterfrontActive = intent.waterfront || hasWater
  let developable = buildDevelopableParcels(blocks, context, boundary)

  // Prefer waterfront parcels for parks / amenity edges
  if (waterfrontActive) {
    developable = [...developable].sort((a, b) => {
      const waterDelta = a.waterDist - b.waterDist
      if (Math.abs(waterDelta) > 0.05) return waterDelta
      return b.area - a.area
    })
  }

  const commercial: Feature<Polygon>[] = []
  const residential: Feature<Polygon>[] = []
  const industrial: Feature<Polygon>[] = []
  const parks: Feature<Polygon>[] = []
  const green_space: Feature<Polygon>[] = []
  const trees: Feature<Point>[] = []

  const commercialCount = intent.cbd
    ? Math.min(6, Math.max(3, Math.floor(developable.length * 0.35)))
    : Math.min(4, Math.max(2, Math.floor(developable.length * 0.2)))

  const industrialCount = intent.industrial
    ? Math.min(4, Math.max(2, Math.floor(developable.length * 0.14)))
    : Math.min(3, Math.max(1, Math.floor(developable.length * 0.1)))

  const parkBase = intent.greenCity || intent.moreParks || waterfrontActive ? 0.2 : 0.12
  const parkBoost = intent.moreParks ? 0.1 : waterfrontActive ? 0.06 : 0
  const parkCount = Math.min(
    intent.moreParks || waterfrontActive ? 8 : 5,
    Math.max(intent.moreParks || waterfrontActive ? 3 : 1, Math.floor(developable.length * (parkBase + parkBoost))),
  )

  // When waterfront: assign nearest-to-water parcels as parks first, then commercial/industrial/resi from remaining
  const parkIndices = new Set<number>()
  if (waterfrontActive && developable.length > 0) {
    const waterSorted = [...developable.entries()]
      .sort(([, a], [, b]) => a.waterDist - b.waterDist)
      .slice(0, parkCount)
    for (const [idx] of waterSorted) parkIndices.add(idx)
  }

  let assignedCommercial = 0
  let assignedIndustrial = 0
  let assignedParks = 0

  developable.forEach((item, index) => {
    if (parkIndices.has(index) || (!waterfrontActive && index >= commercialCount + industrialCount && index < commercialCount + industrialCount + parkCount)) {
      if (assignedParks >= parkCount && !parkIndices.has(index)) {
        // fall through to residential below
      } else {
        try {
          const park = turf.buffer(item.parcel, -3, { units: 'meters', steps: 6 })
          if (park && park.geometry.type === 'Polygon' && turf.area(park) > 400) {
            park.properties = { landUse: 'park', impression: true, waterfront: waterfrontActive }
            parks.push(park as Feature<Polygon>)
            trees.push(...samplePointsAlongPolygonEdge(park as Feature<Polygon>, 16))
            assignedParks++
            return
          }
        } catch {
          // skip
        }
      }
    }

    if (parkIndices.has(index)) {
      // park buffer failed — treat as green easement
      item.parcel.properties = { landUse: 'green', impression: true, waterfront: true }
      green_space.push(item.parcel)
      return
    }

    if (assignedCommercial < commercialCount) {
      commercial.push(...parcelToFootprints(item.parcel, 'commercial', intent, gridBearing))
      assignedCommercial++
      return
    }

    if (assignedIndustrial < industrialCount) {
      industrial.push(...parcelToFootprints(item.parcel, 'industrial', intent, gridBearing))
      assignedIndustrial++
      return
    }

    if (!waterfrontActive && assignedParks < parkCount) {
      try {
        const park = turf.buffer(item.parcel, -3, { units: 'meters', steps: 6 })
        if (park && park.geometry.type === 'Polygon' && turf.area(park) > 400) {
          park.properties = { landUse: 'park', impression: true }
          parks.push(park as Feature<Polygon>)
          trees.push(...samplePointsAlongPolygonEdge(park as Feature<Polygon>, 16))
          assignedParks++
          return
        }
      } catch {
        // skip
      }
    }

    residential.push(...parcelToFootprints(item.parcel, 'residential', intent, gridBearing))
  })

  if (commercial.length === 0 && developable.length > 0) {
    const pick = developable.find((_, i) => !parkIndices.has(i)) ?? developable[0]
    commercial.push(...parcelToFootprints(pick.parcel, 'commercial', intent, gridBearing))
  }
  if (residential.length === 0 && developable.length > 1) {
    const pick = developable.find((_, i) => !parkIndices.has(i) && i > 0) ?? developable[1]
    residential.push(...parcelToFootprints(pick.parcel, 'residential', intent, gridBearing))
  }

  if (industrial.length === 0 && developable.length > 2) {
    const pick = developable.find((_, i) => !parkIndices.has(i) && i > 1) ?? developable[2]
    industrial.push(...parcelToFootprints(pick.parcel, 'industrial', intent, gridBearing))
  }

  for (const preserve of context.preserveAreas.features.slice(0, 3)) {
    try {
      const clipped = turf.intersect(turf.featureCollection([preserve, boundary]))
      if (clipped && clipped.geometry.type === 'Polygon') {
        clipped.properties = { landUse: 'preserve', impression: true }
        green_space.push(clipped as Feature<Polygon>)
        trees.push(...samplePointsAlongPolygonEdge(clipped as Feature<Polygon>, 22))
      }
    } catch {
      continue
    }
  }

  // Hard-constraint buffers stay as map overlays only — do not style as green_space parks
  const hard = zoningForbidden(context)

  return {
    commercial: filterFootprintsOffConstraints(commercial, hard),
    residential: filterFootprintsOffConstraints(residential, hard),
    industrial: filterFootprintsOffConstraints(industrial, hard),
    parks: filterFootprintsOffConstraints(parks, hard),
    green_space: filterFootprintsOffConstraints(green_space, hard),
    trees,
  }
}

function buildBikeAndTransit(
  streets: OsmStreet[],
  crossingZones: FeatureCollection<Polygon>,
  bridgeIds: Set<string>,
): {
  bike_paths: FeatureCollection<LineString>
  transit: FeatureCollection<LineString>
} {
  const major = new Set(['primary', 'secondary', 'tertiary', 'trunk'])
  const bikeHighways = new Set([
    'residential', 'living_street', 'tertiary', 'secondary', 'cycleway', 'path',
    'unclassified', 'service', 'primary', 'primary_link',
  ])

  // Never skip obstacle checks — only explicit bridgeIds may cross river/rail
  const avoidsObstacles = (s: OsmStreet) => {
    if (bridgeIds.has(s.id)) return true
    return !lineCrossesForbidden(turf.lineString(s.coordinates), crossingZones)
  }

  const bikeStreets = streets
    .filter((s) => bikeHighways.has(s.highway) && avoidsObstacles(s))
    // Bike: at most one intentional bridge crossing
    .filter((s) => !bridgeIds.has(s.id) || [...bridgeIds][0] === s.id)

  const transitBridgeId = [...bridgeIds][0]
  const transitStreets = streets.filter((s) => {
    if (!major.has(s.highway)) return false
    if (bridgeIds.has(s.id)) return s.id === transitBridgeId
    return avoidsObstacles(s)
  })

  return {
    bike_paths: turf.featureCollection(
      bikeStreets.map((s) =>
        turf.lineString(s.coordinates, {
          type: 'bike',
          class: 'protected',
          snappedTo: s.name,
          fromOsm: true,
          bridge: bridgeIds.has(s.id) || undefined,
        }),
      ),
    ),
    transit: turf.featureCollection(
      transitStreets.map((s) =>
        turf.lineString(s.coordinates, {
          type: 'transit',
          mode: 'brt',
          snappedTo: s.name,
          fromOsm: true,
          bridge: bridgeIds.has(s.id) || undefined,
        }),
      ),
    ),
  }
}

export function buildTransportLayers(
  streets: OsmStreet[],
  context: SiteContext,
  _boundary: Feature<Polygon>,
): Pick<MasterPlanLayers, 'roads' | 'bike_paths' | 'transit'> {
  const crossing = crossingForbidden(context)

  // Up to 3 road bridges/tunnels over river or rail — realistic, not a web of crossings
  const { kept, bridgeIds } = filterStreetsAllowingBridges(
    streets,
    crossing,
    () => false,
    3,
  )

  const { bike_paths, transit } = buildBikeAndTransit(kept, crossing, bridgeIds)
  const roads = buildRoadsFromStreets(kept, crossing, bridgeIds)

  return { roads, bike_paths, transit }
}

function classifyFallbackRoadClass(lengthM: number, percentile: number): RoadClass {
  if (percentile >= 0.88) return 'arterial'
  if (percentile >= 0.62) return 'collector'
  if (lengthM < 55) return 'cul-de-sac'
  return 'local'
}

function extendTransitLines(
  transit: FeatureCollection<LineString>,
  factor = 1.65,
): FeatureCollection<LineString> {
  const features = transit.features.map((line) => {
    const coords = line.geometry.coordinates
    if (coords.length < 2) return line

    const lenKm = turf.length(line, { units: 'kilometers' })
    const extendKm = (lenKm * (factor - 1)) / 2
    const start = coords[0]
    const end = coords[coords.length - 1]
    const bearingStart = turf.bearing(turf.point(coords[1]), turf.point(start))
    const bearingEnd = turf.bearing(turf.point(coords[coords.length - 2]), turf.point(end))
    const newStart = turf.destination(turf.point(start), extendKm, bearingStart, { units: 'kilometers' }).geometry.coordinates
    const newEnd = turf.destination(turf.point(end), extendKm, bearingEnd, { units: 'kilometers' }).geometry.coordinates

    return turf.lineString([newStart, ...coords, newEnd], line.properties ?? {})
  })

  return turf.featureCollection(features)
}

function buildFallbackTransport(
  blocks: Feature<Polygon>[],
  forbidden: FeatureCollection<Polygon>,
): Pick<MasterPlanLayers, 'roads' | 'bike_paths' | 'transit'> {
  const seen = new Set<string>()
  const segments: Feature<LineString>[] = []
  const pointKey = (point: Position) => `${point[0].toFixed(6)},${point[1].toFixed(6)}`

  for (const block of blocks) {
    const ring = block.geometry.coordinates[0]
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]
      const b = ring[i + 1]
      const key = [pointKey(a), pointKey(b)].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      const lengthM = turf.distance(a, b, { units: 'kilometers' }) * 1000
      const seg = turf.lineString([a, b], {
        type: 'road',
        class: 'local',
        fallbackGrid: true,
        lengthM,
      })
      if (lineCrossesForbidden(seg, forbidden)) continue
      segments.push(seg)
    }
  }

  const sorted = [...segments].sort((a, b) => {
    const la = (a.properties?.lengthM as number) ?? 0
    const lb = (b.properties?.lengthM as number) ?? 0
    return lb - la
  })

  const maxLen = (sorted[0]?.properties?.lengthM as number) ?? 1
  const classified = sorted.map((line, index) => {
    const lengthM = (line.properties?.lengthM as number) ?? 0
    const percentile = lengthM / maxLen
    const roadClass = classifyFallbackRoadClass(lengthM, percentile)
    return turf.lineString(line.geometry.coordinates, {
      type: 'road',
      class: roadClass,
      fallbackGrid: true,
      lengthM,
      gridRank: index,
    })
  })

  const roads = enrichRoadCollection(turf.featureCollection(classified))

  const byLength = [...roads.features].sort(
    (a, b) => turf.length(b, { units: 'kilometers' }) - turf.length(a, { units: 'kilometers' }),
  )
  const transitSegments = byLength.slice(0, Math.min(5, byLength.length)).map((line) =>
    turf.lineString(line.geometry.coordinates, {
      type: 'transit',
      mode: 'brt',
      fallbackGrid: true,
      name: `${line.properties?.name ?? 'Transit'} Corridor`,
    }),
  )
  const bikeSegments = byLength.filter((_, index) => index % 3 === 0).map((line) =>
    turf.lineString(line.geometry.coordinates, {
      type: 'bike',
      class: 'protected',
      fallbackGrid: true,
    }),
  )

  return {
    roads,
    bike_paths: turf.featureCollection(bikeSegments),
    transit: turf.featureCollection(transitSegments),
  }
}

export function buildOsmMasterPlan(
  context: SiteContext,
  boundary: Feature<Polygon>,
  prompt: string,
): MasterPlanLayers {
  const intent = parsePlanIntent(prompt)
  const gridBearing = computeStreetGridRotation(context.streets, boundary)
  const blocks = extractBlocksFromStreets(context.streets, boundary, gridBearing)
  const classified = classifyAndBuildLayers(blocks, context, boundary, intent, gridBearing)
  const crossing = crossingForbidden(context)
  const hard = zoningForbidden(context)
  const transport = context.streets.length > 0
    ? buildTransportLayers(context.streets, context, boundary)
    : buildFallbackTransport(blocks, crossing)

  let transit = transport.transit
  if (intent.longerTransit || intent.transit) {
    transit = extendTransitLines(transit, intent.longerTransit ? 1.85 : 1.45)
    transit = turf.featureCollection(
      transit.features.filter((f) => {
        if (f.properties?.bridge) return true
        return !lineCrossesForbidden(f, crossing)
      }),
    )
  }

  // Final pass: drop any bike path that still crosses river/rail (except 1 bridge)
  let bike_paths = turf.featureCollection(
    transport.bike_paths.features.filter((f) => {
      if (f.properties?.bridge) return true
      return !lineCrossesForbidden(f, crossing)
    }),
  )

  let roads = turf.featureCollection(
    transport.roads.features.filter((f) => {
      if (f.properties?.bridge) return true
      // Existing hard highways that merely follow their own corridor stay;
      // anything else must not cut through river/rail.
      const hw = String(f.properties?.highway ?? '')
      if (HARD_HIGHWAYS.has(hw) && !lineCrossesForbidden(f, crossing)) return true
      return !lineCrossesForbidden(f, crossing)
    }),
  )

  const parkFeatures: Array<Feature<Polygon> | Feature<Point>> = [
    ...classified.parks,
    ...classified.trees,
  ]

  let commercial = filterFootprintsOffConstraints(classified.commercial, hard)
  let residential = filterFootprintsOffConstraints(classified.residential, hard)
  let industrial = filterFootprintsOffConstraints(classified.industrial, hard)

  // Last-resort fill only from hard-constraint-safe blocks
  if (commercial.length === 0 && residential.length === 0 && blocks.length > 0) {
    const fallbackBlocks = blocks
      .filter((b) => turf.area(b) > 800)
      .filter((b) => isDevelopableBlock(b, context.buildings, context.preserveAreas, hard))
      .sort((a, b) => turf.area(b) - turf.area(a))
      .slice(0, 16)
    commercial = filterFootprintsOffConstraints(
      fallbackBlocks.slice(0, Math.min(4, fallbackBlocks.length)).map((parcel) => {
        const copy = turf.clone(parcel)
        copy.properties = { landUse: 'commercial', impression: true, height: 'mid' }
        return copy
      }),
      hard,
    )
    industrial = filterFootprintsOffConstraints(
      fallbackBlocks.slice(commercial.length, commercial.length + 2).map((parcel) => {
        const copy = turf.clone(parcel)
        copy.properties = { landUse: 'industrial', impression: true, height: 'warehouse' }
        return copy
      }),
      hard,
    )
    residential = filterFootprintsOffConstraints(
      fallbackBlocks.slice(commercial.length + industrial.length).map((parcel) => {
        const copy = turf.clone(parcel)
        copy.properties = { landUse: 'residential', impression: true, height: 'low' }
        return copy
      }),
      hard,
    )
  }

  const schoolCoord = pointOnDevelopableLand(boundary, context.buildings, context.preserveAreas, hard)
  let hospitalCoord = pointOnDevelopableLand(boundary, context.buildings, context.preserveAreas, hard)
  if (
    schoolCoord &&
    hospitalCoord &&
    turf.distance(schoolCoord, hospitalCoord, { units: 'kilometers' }) < 0.2
  ) {
    hospitalCoord = turf.destination(turf.point(schoolCoord), 0.28, 95, { units: 'kilometers' }).geometry.coordinates
    const hardIndex = getConstraintIndex(hard)
    if (hardIndex.containsPoint(hospitalCoord[0], hospitalCoord[1])) {
      hospitalCoord = pointOnDevelopableLand(boundary, context.buildings, context.preserveAreas, hard)
    }
  }
  const centroid = turf.centroid(boundary)

  const schoolCampus = schoolCoord ? buildSchoolCampus(schoolCoord, gridBearing) : null
  const hospitalCampus = hospitalCoord ? buildHospitalCampus(hospitalCoord, gridBearing) : null

  return {
    roads,
    bike_paths,
    transit,
    commercial: turf.featureCollection(commercial),
    residential: turf.featureCollection(residential),
    industrial: turf.featureCollection(industrial),
    parks: { type: 'FeatureCollection', features: parkFeatures } as FeatureCollection<Polygon | Point>,
    green_space: turf.featureCollection(
      filterFootprintsOffConstraints(classified.green_space, hard),
    ),
    schools: turf.featureCollection(schoolCampus ? [schoolCampus] : []),
    hospitals: turf.featureCollection(hospitalCampus ? [hospitalCampus] : []),
    annotations: [
      {
        id: uuid(),
        text: intent.cbd ? 'CBD core' : 'Civic centre',
        coordinates: centroid.geometry.coordinates,
      },
      {
        id: uuid(),
        text: 'Regular street grid',
        coordinates: turf.destination(centroid, 0.12, 45, { units: 'kilometers' }).geometry.coordinates,
      },
    ],
  }
}

/** Replace AI geometry with OSM-block plan; keep summary from AI */
export function rebuildLayersFromOsm(
  layers: MasterPlanLayers,
  context: SiteContext,
  boundary: Feature<Polygon>,
  prompt: string,
): MasterPlanLayers {
  const osmLayers = buildOsmMasterPlan(context, boundary, prompt)
  return {
    ...osmLayers,
    annotations: layers.annotations.length > 0 ? layers.annotations : osmLayers.annotations,
  }
}
