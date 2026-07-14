import * as turf from '@turf/turf'
import { v4 as uuid } from 'uuid'
import type { Feature, FeatureCollection, LineString, Point, Polygon, Position } from 'geojson'
import type { MasterPlanLayers } from '@/types/master-plan'
import type { OsmStreet, SiteContext } from '@/utils/osm-context'
import {
  isDevelopableBlock,
  pointOnDevelopableLand,
  prepareDevelopableParcel,
  samplePointsAlongPolygonEdge,
  subtractBuildingsFromPolygon,
} from '@/utils/building-avoidance'
import { buildHospitalCampus, buildSchoolCampus } from '@/utils/civic-footprints'
import { enrichRoadCollection } from '@/utils/osm-road-enrich'
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
  if (['motorway', 'trunk', 'primary'].includes(highway)) return 'arterial'
  if (['secondary', 'tertiary'].includes(highway)) return 'collector'
  if (['residential', 'living_street', 'unclassified'].includes(highway)) return 'local'
  if (highway === 'service') return 'cul-de-sac'
  return 'local'
}

function buildRoadsFromStreets(streets: OsmStreet[]): FeatureCollection<LineString> {
  const raw = turf.featureCollection(
    streets.map((s) =>
      turf.lineString(s.coordinates, {
        class: highwayToClass(s.highway),
        type: 'road',
        name: s.name,
        highway: s.highway,
        fromOsm: true,
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
  return gridBlocks(boundary, cellM, gridBearing)
}

function cellSizeMultiplier(gx: number, gy: number): number {
  const hash = ((gx * 73856093) ^ (gy * 19349663)) >>> 0
  return 0.58 + (hash % 72) / 100
}

function gridBlocks(
  boundary: Feature<Polygon>,
  cellM: number,
  rotationDeg = 0,
): Feature<Polygon>[] {
  const centroid = turf.centroid(boundary)
  const rotated = turf.transformRotate(boundary, -rotationDeg, { pivot: centroid })
  const bbox = turf.bbox(rotated)
  const [minX, minY, maxX, maxY] = bbox
  const mPerDegLng = 111320 * Math.cos((centroid.geometry.coordinates[1] * Math.PI) / 180)

  const cells: Feature<Polygon>[] = []
  let gy = 0
  let y = minY
  while (y < maxY) {
    const latMult = cellSizeMultiplier(0, gy)
    const cellLat = (cellM * latMult) / 111320
    let gx = 0
    let x = minX
    while (x < maxX) {
      const lngMult = cellSizeMultiplier(gx, gy)
      const cellLng = (cellM * lngMult) / mPerDegLng
      try {
        const cell = turf.bboxPolygon([x, y, x + cellLng, y + cellLat])
        const clipped = turf.intersect(turf.featureCollection([cell, rotated]))
        if (!clipped || clipped.geometry.type !== 'Polygon') {
          x += cellLng
          gx += 1
          continue
        }
        const area = turf.area(clipped)
        if (area >= 900 && area <= 220000) {
          const world = turf.transformRotate(clipped, rotationDeg, { pivot: centroid }) as Feature<Polygon>
          cells.push(world)
        }
      } catch {
        // skip cell
      }
      x += cellLng
      gx += 1
    }
    y += cellLat
    gy += 1
  }

  return cells
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

function buildDevelopableParcels(
  blocks: Feature<Polygon>[],
  context: SiteContext,
  boundary: Feature<Polygon>,
): Array<{ parcel: Feature<Polygon>; area: number; dist: number }> {
  const centroid = turf.centroid(boundary)

  const mapBlocks = (relaxed: boolean) =>
    blocks
      .map((block) => {
        if (!relaxed && !isDevelopableBlock(block, context.buildings, context.preserveAreas)) return null
        const parcel = relaxed
          ? block
          : prepareDevelopableParcel(block, context.buildings, context.preserveAreas)
        if (!parcel || turf.area(parcel) < 300) return null
        return {
          parcel,
          area: turf.area(parcel),
          dist: turf.distance(centroid, turf.centroid(parcel), { units: 'kilometers' }),
        }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => b.area - a.area)

  let developable = mapBlocks(false)
  if (developable.length < 3) developable = mapBlocks(true)
  if (developable.length === 0 && blocks.length > 0) {
    developable = blocks
      .filter((b) => turf.area(b) > 500)
      .map((parcel) => ({
        parcel,
        area: turf.area(parcel),
        dist: turf.distance(centroid, turf.centroid(parcel), { units: 'kilometers' }),
      }))
      .sort((a, b) => b.area - a.area)
      .slice(0, 20)
  }

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
  const developable = buildDevelopableParcels(blocks, context, boundary)

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

  const parkBase = intent.greenCity || intent.moreParks ? 0.2 : 0.12
  const parkBoost = intent.moreParks ? 0.1 : 0
  const parkCount = Math.min(
    intent.moreParks ? 8 : 5,
    Math.max(intent.moreParks ? 3 : 1, Math.floor(developable.length * (parkBase + parkBoost))),
  )

  developable.forEach((item, index) => {
    if (index < commercialCount) {
      commercial.push(...parcelToFootprints(item.parcel, 'commercial', intent, gridBearing))
      return
    }

    if (index < commercialCount + industrialCount) {
      industrial.push(...parcelToFootprints(item.parcel, 'industrial', intent, gridBearing))
      return
    }

    if (index < commercialCount + industrialCount + parkCount) {
      try {
        const park = turf.buffer(item.parcel, -3, { units: 'meters', steps: 6 })
        if (park && park.geometry.type === 'Polygon' && turf.area(park) > 400) {
          park.properties = { landUse: 'park', impression: true }
          parks.push(park as Feature<Polygon>)
          trees.push(...samplePointsAlongPolygonEdge(park as Feature<Polygon>, 16))
        }
      } catch {
        // skip
      }
      return
    }

    residential.push(...parcelToFootprints(item.parcel, 'residential', intent, gridBearing))
  })

  if (commercial.length === 0 && developable.length > 0) {
    commercial.push(...parcelToFootprints(developable[0].parcel, 'commercial', intent, gridBearing))
  }
  if (residential.length === 0 && developable.length > 1) {
    residential.push(...parcelToFootprints(developable[1].parcel, 'residential', intent, gridBearing))
  }

  if (industrial.length === 0 && developable.length > 2) {
    industrial.push(...parcelToFootprints(developable[2].parcel, 'industrial', intent, gridBearing))
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

  return { commercial, residential, industrial, parks, green_space, trees }
}

function buildBikeAndTransit(streets: OsmStreet[]): {
  bike_paths: FeatureCollection<LineString>
  transit: FeatureCollection<LineString>
} {
  const major = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'motorway'])
  const bikeHighways = new Set([
    'residential', 'living_street', 'tertiary', 'secondary', 'cycleway', 'path',
    'unclassified', 'service', 'primary', 'primary_link',
  ])

  const bikeStreets = streets.filter((s) => bikeHighways.has(s.highway))
  const transitStreets = streets.filter((s) => major.has(s.highway))

  return {
    bike_paths: turf.featureCollection(
      bikeStreets.map((s) =>
        turf.lineString(s.coordinates, { type: 'bike', class: 'protected', snappedTo: s.name, fromOsm: true }),
      ),
    ),
    transit: turf.featureCollection(
      transitStreets.map((s) =>
        turf.lineString(s.coordinates, { type: 'transit', mode: 'brt', snappedTo: s.name, fromOsm: true }),
      ),
    ),
  }
}

export function buildTransportLayers(streets: OsmStreet[]): Pick<MasterPlanLayers, 'roads' | 'bike_paths' | 'transit'> {
  const { bike_paths, transit } = buildBikeAndTransit(streets)
  return {
    roads: buildRoadsFromStreets(streets),
    bike_paths,
    transit,
  }
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
      segments.push(turf.lineString([a, b], {
        type: 'road',
        class: 'local',
        fallbackGrid: true,
        lengthM,
      }))
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
  const transport = context.streets.length > 0
    ? buildTransportLayers(context.streets)
    : buildFallbackTransport(blocks)

  let transit = transport.transit
  if (intent.longerTransit || intent.transit) {
    transit = extendTransitLines(transit, intent.longerTransit ? 1.85 : 1.45)
  }

  const parkFeatures: Array<Feature<Polygon> | Feature<Point>> = [
    ...classified.parks,
    ...classified.trees,
  ]

  let commercial = classified.commercial
  let residential = classified.residential
  let industrial = classified.industrial

  if (commercial.length === 0 && residential.length === 0 && blocks.length > 0) {
    const fallbackBlocks = blocks
      .filter((b) => turf.area(b) > 800)
      .sort((a, b) => turf.area(b) - turf.area(a))
      .slice(0, 16)
    commercial = fallbackBlocks.slice(0, Math.min(4, fallbackBlocks.length)).map((parcel) => {
      parcel.properties = { landUse: 'commercial', impression: true, height: 'mid' }
      return parcel
    })
    industrial = fallbackBlocks.slice(commercial.length, commercial.length + 2).map((parcel) => {
      parcel.properties = { landUse: 'industrial', impression: true, height: 'warehouse' }
      return parcel
    })
    residential = fallbackBlocks.slice(commercial.length + industrial.length).map((parcel) => {
      parcel.properties = { landUse: 'residential', impression: true, height: 'low' }
      return parcel
    })
  }

  const schoolCoord = pointOnDevelopableLand(boundary, context.buildings, context.preserveAreas)
  let hospitalCoord = pointOnDevelopableLand(boundary, context.buildings, context.preserveAreas)
  if (
    schoolCoord &&
    hospitalCoord &&
    turf.distance(schoolCoord, hospitalCoord, { units: 'kilometers' }) < 0.2
  ) {
    hospitalCoord = turf.destination(turf.point(schoolCoord), 0.28, 95, { units: 'kilometers' }).geometry.coordinates
  }
  const centroid = turf.centroid(boundary)

  const schoolCampus = schoolCoord ? buildSchoolCampus(schoolCoord, gridBearing) : null
  const hospitalCampus = hospitalCoord ? buildHospitalCampus(hospitalCoord, gridBearing) : null

  return {
    roads: transport.roads,
    bike_paths: transport.bike_paths,
    transit,
    commercial: turf.featureCollection(commercial),
    residential: turf.featureCollection(residential),
    industrial: turf.featureCollection(industrial),
    parks: { type: 'FeatureCollection', features: parkFeatures } as FeatureCollection<Polygon | Point>,
    green_space: turf.featureCollection(classified.green_space),
    schools: turf.featureCollection(schoolCampus ? [schoolCampus] : []),
    hospitals: turf.featureCollection(hospitalCampus ? [hospitalCampus] : []),
    annotations: [
      {
        id: uuid(),
        text: intent.cbd ? 'CBD core' : 'Civic centre',
        coordinates: centroid.geometry.coordinates,
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
