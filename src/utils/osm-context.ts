import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Polygon, Position } from 'geojson'

export interface OsmStreet {
  id: string
  name: string
  highway: string
  coordinates: Position[]
}

export const HARD_HIGHWAYS = new Set(['motorway', 'trunk', 'motorway_link', 'trunk_link'])
export const SOFT_KEEP_HIGHWAYS = new Set(['primary', 'secondary', 'primary_link', 'secondary_link'])

/** Actual water bodies — zoning and transport must not cover these */
const RIVER_BUFFER_M = 40
const RAIL_BUFFER_M = 22
const HARD_ROAD_BUFFER_M = 32
/** Orange/yellow arterials — zoning stays off the carriageway corridor */
const ARTERIAL_BUFFER_M = 26

export interface SiteContext {
  streets: OsmStreet[]
  buildings: FeatureCollection<Polygon>
  preserveAreas: FeatureCollection<Polygon>
  /** Actual rivers, canals, lakes (not flood plains) */
  waterways: FeatureCollection<LineString | Polygon>
  /** Flood-prone areas — zoning allowed; informational only */
  floodAreas: FeatureCollection<Polygon>
  railways: FeatureCollection<LineString>
  /** Motorway / trunk centerlines (hard road spine) */
  hardCorridors: FeatureCollection<LineString>
  /** Buffered no-build for zoning: river + rail + highway + arterial */
  hardConstraintAreas: FeatureCollection<Polygon>
  /** Raster basemap colour scout — matches visible OSM tile colours */
  basemapScan?: {
    rivers: FeatureCollection<Polygon>
    highways: FeatureCollection<Polygon>
    arterials: FeatureCollection<Polygon>
    /** Pixel-detected black rail strokes + vector rail buffers */
    railways: FeatureCollection<Polygon>
  }
  summaryText: string
}

interface OverpassElement {
  type: 'way' | 'node' | 'relation'
  id: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
  members?: Array<{
    type: string
    role: string
    geometry?: Array<{ lat: number; lon: number }>
  }>
}

interface OverpassResponse {
  elements: OverpassElement[]
}

function wayToLine(el: OverpassElement, props: Record<string, unknown> = {}): Feature<LineString> | null {
  if (!el.geometry || el.geometry.length < 2) return null
  const coords = el.geometry.map((p) => [p.lon, p.lat] as Position)
  return turf.lineString(coords, {
    osmId: el.id,
    name: el.tags?.name ?? '',
    ...props,
  })
}

function wayToPolygon(el: OverpassElement, props: Record<string, unknown> = {}): Feature<Polygon> | null {
  if (!el.geometry || el.geometry.length < 3) return null
  const coords = el.geometry.map((p) => [p.lon, p.lat] as Position)
  if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
    coords.push(coords[0])
  }
  try {
    return turf.polygon([coords], props)
  } catch {
    return null
  }
}

function isClosedWay(el: OverpassElement): boolean {
  if (!el.geometry || el.geometry.length < 4) return false
  const first = el.geometry[0]
  const last = el.geometry[el.geometry.length - 1]
  return first.lat === last.lat && first.lon === last.lon
}

function clipLineToBoundary(line: Feature<LineString>, boundary: Feature<Polygon>): Feature<LineString> | null {
  const coords = line.geometry.coordinates
  const inside = coords.filter((c) => turf.booleanPointInPolygon(turf.point(c), boundary))
  if (inside.length >= 2) {
    return turf.lineString(inside, line.properties ?? {})
  }

  try {
    const bbox = turf.bbox(boundary)
    const clipped = turf.bboxClip(line, bbox as [number, number, number, number])
    if (clipped.geometry.type !== 'LineString' || clipped.geometry.coordinates.length < 2) return null
    const mid = clipped.geometry.coordinates[Math.floor(clipped.geometry.coordinates.length / 2)] as Position
    if (turf.booleanPointInPolygon(turf.point(mid), boundary)) {
      return clipped as Feature<LineString>
    }
  } catch {
    // ignore
  }

  if (coords.some((c) => turf.booleanPointInPolygon(turf.point(c), boundary))) {
    try {
      const bbox = turf.bbox(boundary)
      const clipped = turf.bboxClip(line, bbox as [number, number, number, number])
      if (clipped.geometry.type === 'LineString' && clipped.geometry.coordinates.length >= 2) {
        return clipped as Feature<LineString>
      }
    } catch {
      // ignore
    }
  }

  return null
}

function clipPolygonToBoundary(
  poly: Feature<Polygon>,
  boundary: Feature<Polygon>,
): Feature<Polygon> | null {
  try {
    const c = turf.centroid(poly)
    if (!turf.booleanPointInPolygon(c, boundary) && !turf.booleanIntersects(poly, boundary)) {
      return null
    }
    const clipped = turf.intersect(turf.featureCollection([poly, boundary]))
    if (!clipped) return null
    if (clipped.geometry.type === 'Polygon') {
      clipped.properties = poly.properties ?? {}
      return clipped as Feature<Polygon>
    }
    if (clipped.geometry.type === 'MultiPolygon') {
      const parts = clipped.geometry.coordinates.map((coords) =>
        turf.polygon(coords, poly.properties ?? {}),
      )
      return parts.sort((a, b) => turf.area(b) - turf.area(a))[0] ?? null
    }
  } catch {
    // ignore
  }
  return null
}

function bufferToPolygons(
  features: Array<Feature<LineString | Polygon>>,
  distanceM: number,
): Feature<Polygon>[] {
  const out: Feature<Polygon>[] = []
  for (const f of features) {
    try {
      const buffered = turf.buffer(f, distanceM, { units: 'meters', steps: 8 })
      if (!buffered) continue
      if (buffered.geometry.type === 'Polygon') {
        buffered.properties = { ...(f.properties ?? {}), constraint: true }
        out.push(buffered as Feature<Polygon>)
      } else if (buffered.geometry.type === 'MultiPolygon') {
        for (const coords of buffered.geometry.coordinates) {
          out.push(turf.polygon(coords, { ...(f.properties ?? {}), constraint: true }))
        }
      }
    } catch {
      continue
    }
  }
  return out
}

const RIVER_BUFFER_CAP = 80
const RAIL_BUFFER_CAP = 60
const HARD_ROAD_BUFFER_CAP = 40
const ARTERIAL_BUFFER_CAP = 50

export interface HardConstraintInputs {
  rivers: Array<Feature<LineString | Polygon>>
  railways: Array<Feature<LineString>>
  hardHighways: Array<Feature<LineString>>
  arterials?: Array<Feature<LineString>>
  /** Pre-marked no-build polygons from basemap colour scout */
  basemapPolygons?: Array<Feature<Polygon>>
}

/**
 * No-build buffers for zoning.
 * Rivers = actual water only (not flood plains).
 * Arterials (primary/secondary) included so parcels don't sit on orange/yellow roads.
 */
export function buildHardConstraintAreas(input: HardConstraintInputs): FeatureCollection<Polygon> {
  const { rivers, railways, hardHighways, arterials = [], basemapPolygons = [] } = input
  const riverPolys: Feature<Polygon>[] = []
  for (const r of rivers.slice(0, RIVER_BUFFER_CAP)) {
    if (r.geometry.type === 'Polygon') {
      riverPolys.push({
        ...r,
        properties: { ...(r.properties ?? {}), constraint: true, kind: 'river' },
      } as Feature<Polygon>)
    }
  }
  const basemap = basemapPolygons.slice(0, 400).map((p) => ({
    ...p,
    properties: { ...(p.properties ?? {}), constraint: true, source: 'basemap-scout' },
  }))
  return turf.featureCollection([
    ...basemap,
    ...riverPolys,
    ...bufferToPolygons(rivers.slice(0, RIVER_BUFFER_CAP), RIVER_BUFFER_M),
    ...bufferToPolygons(railways.slice(0, RAIL_BUFFER_CAP), RAIL_BUFFER_M),
    ...bufferToPolygons(hardHighways.slice(0, HARD_ROAD_BUFFER_CAP), HARD_ROAD_BUFFER_M),
    ...bufferToPolygons(arterials.slice(0, ARTERIAL_BUFFER_CAP), ARTERIAL_BUFFER_M),
  ])
}

/** Buffers used to keep most local roads / bike / transit off rivers and rail. */
export function buildTransportForbiddenAreas(
  rivers: Array<Feature<LineString | Polygon>>,
  railways: Array<Feature<LineString>>,
): FeatureCollection<Polygon> {
  const riverPolys: Feature<Polygon>[] = []
  for (const r of rivers.slice(0, RIVER_BUFFER_CAP)) {
    if (r.geometry.type === 'Polygon') {
      riverPolys.push({
        ...r,
        properties: { ...(r.properties ?? {}), constraint: true, kind: 'river' },
      } as Feature<Polygon>)
    }
  }
  return turf.featureCollection([
    ...riverPolys,
    ...bufferToPolygons(rivers.slice(0, RIVER_BUFFER_CAP), 36),
    ...bufferToPolygons(railways.slice(0, RAIL_BUFFER_CAP), 14),
  ])
}

/**
 * When OSM river geometry is sparse, shrink BCC flood polygons toward a channel proxy
 * so zoning/roads still avoid the river itself (not the whole floodplain).
 */
export function riverProxiesFromFlood(
  flood: Array<Feature<Polygon>>,
  existingRivers: Array<Feature<LineString | Polygon>>,
): Array<Feature<LineString | Polygon>> {
  if (existingRivers.length >= 2) return existingRivers
  const proxies: Array<Feature<LineString | Polygon>> = [...existingRivers]
  for (const f of flood.slice(0, 40)) {
    try {
      // Shrink floodplain toward the wetter core / channel
      const shrunk = turf.buffer(f, -90, { units: 'meters', steps: 8 })
      if (!shrunk) continue
      if (shrunk.geometry.type === 'Polygon' && turf.area(shrunk) > 800) {
        shrunk.properties = { ...(f.properties ?? {}), kind: 'river-proxy', source: 'bcc-flood-core' }
        proxies.push(shrunk as Feature<Polygon>)
      } else if (shrunk.geometry.type === 'MultiPolygon') {
        for (const coords of shrunk.geometry.coordinates) {
          const p = turf.polygon(coords, { ...(f.properties ?? {}), kind: 'river-proxy', source: 'bcc-flood-core' })
          if (turf.area(p) > 800) proxies.push(p)
        }
      }
    } catch {
      continue
    }
  }
  // If shrink wiped everything, fall back to a thinner corridor from flood edge
  if (proxies.length === existingRivers.length && flood.length > 0) {
    for (const f of flood.slice(0, 20)) {
      try {
        const mild = turf.buffer(f, -40, { units: 'meters', steps: 6 })
        if (mild && mild.geometry.type === 'Polygon' && turf.area(mild) > 500) {
          mild.properties = { kind: 'river-proxy', source: 'bcc-flood-core' }
          proxies.push(mild as Feature<Polygon>)
        }
      } catch {
        continue
      }
    }
  }
  return proxies
}

export function isValidSiteContext(value: unknown): value is SiteContext {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.streets) && typeof v.summaryText === 'string'
}

function uniqueNames(items: Array<{ name?: string }>, fallbackPrefix: string, limit = 8): string[] {
  const names = items
    .map((i) => (i.name ?? '').trim())
    .filter((n) => n.length > 0)
  const unique = [...new Set(names)]
  if (unique.length === 0 && items.length > 0) {
    return [`${items.length} unnamed ${fallbackPrefix}`]
  }
  return unique.slice(0, limit)
}

function emptySiteContext(areaHa: string, centroid: Position): SiteContext {
  return {
    streets: [],
    buildings: turf.featureCollection([]),
    preserveAreas: turf.featureCollection([]),
    waterways: turf.featureCollection([]),
    floodAreas: turf.featureCollection([]),
    railways: turf.featureCollection([]),
    hardCorridors: turf.featureCollection([]),
    hardConstraintAreas: turf.featureCollection([]),
    summaryText: `Site area: ${areaHa} ha. Centroid: [${centroid[0].toFixed(5)}, ${centroid[1].toFixed(5)}]`,
  }
}

export async function fetchSiteContext(boundary: Feature<Polygon>): Promise<SiteContext> {
  const bbox = turf.bbox(boundary)
  const [minLng, minLat, maxLng, maxLat] = bbox
  const areaHa = (turf.area(boundary) / 10000).toFixed(1)
  const centroid = turf.centroid(boundary).geometry.coordinates
  const empty = emptySiteContext(areaHa, centroid)

  try {
    const query = `
      [out:json][timeout:25];
      (
        way["highway"](${minLat},${minLng},${maxLat},${maxLng});
        way["building"](${minLat},${minLng},${maxLat},${maxLng});
        way["natural"="water"](${minLat},${minLng},${maxLat},${maxLng});
        way["waterway"](${minLat},${minLng},${maxLat},${maxLng});
        relation["natural"="water"](${minLat},${minLng},${maxLat},${maxLng});
        relation["waterway"="river"](${minLat},${minLng},${maxLat},${maxLng});
        way["railway"~"rail|light_rail|subway|tram"](${minLat},${minLng},${maxLat},${maxLng});
        way["leisure"~"pitch|park|garden|playground"](${minLat},${minLng},${maxLat},${maxLng});
        way["landuse"~"grass|recreation_ground|forest|meadow"](${minLat},${minLng},${maxLat},${maxLng});
      );
      out geom;
    `

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    })

    if (!response.ok) return empty

    const data = await response.json() as OverpassResponse
    const streets: OsmStreet[] = []
    const buildingFeatures: Feature<Polygon>[] = []
    const preserveFeatures: Feature<Polygon>[] = []
    const waterwayFeatures: Array<Feature<LineString | Polygon>> = []
    const railwayFeatures: Feature<LineString>[] = []

    for (const el of data.elements) {
      if (el.tags?.highway) {
        const line = wayToLine(el, { highway: el.tags.highway })
        if (!line) continue
        const clipped = clipLineToBoundary(line, boundary)
        if (!clipped || clipped.geometry.coordinates.length < 2) continue
        streets.push({
          id: String(el.id),
          name: el.tags.name ?? `${el.tags.highway} ${el.id}`,
          highway: el.tags.highway,
          coordinates: clipped.geometry.coordinates,
        })
      } else if (el.tags?.building) {
        const poly = wayToPolygon(el, { building: el.tags.building ?? 'yes' })
        if (!poly) continue
        const c = turf.centroid(poly)
        if (turf.booleanPointInPolygon(c, boundary)) buildingFeatures.push(poly)
      } else if (el.tags?.railway) {
        const line = wayToLine(el, { railway: el.tags.railway, kind: 'railway' })
        if (!line) continue
        const clipped = clipLineToBoundary(line, boundary)
        if (clipped && clipped.geometry.coordinates.length >= 2) {
          railwayFeatures.push(clipped)
        }
      } else if (el.tags?.['natural'] === 'water' || el.tags?.waterway) {
        const name = el.tags.name ?? ''
        const kind = el.tags.waterway ?? (el.tags['natural'] === 'water' ? 'water' : 'waterway')
        // Skip only tiny drains; keep rivers/canals/lakes/streams
        if (['ditch', 'drain', 'rapids'].includes(kind) && !name) {
          // skip unnamed drains
        } else if (el.type === 'relation' && el.members?.length) {
          // Multipolygon water relations (e.g. Brisbane River)
          const outerRings: Position[][] = []
          for (const member of el.members) {
            if (member.role !== 'outer' || !member.geometry || member.geometry.length < 3) continue
            const ring = member.geometry.map((p) => [p.lon, p.lat] as Position)
            if (
              ring[0][0] !== ring[ring.length - 1][0] ||
              ring[0][1] !== ring[ring.length - 1][1]
            ) {
              ring.push(ring[0])
            }
            outerRings.push(ring)
          }
          for (const ring of outerRings.slice(0, 8)) {
            try {
              const poly = turf.polygon([ring], { name, kind, water: true, river: true, source: 'osm-relation' })
              const clipped = clipPolygonToBoundary(poly, boundary)
              if (clipped) waterwayFeatures.push(clipped)
            } catch {
              continue
            }
          }
        } else {
          const asPolygon = isClosedWay(el) && (el.tags['natural'] === 'water' || Boolean(el.tags.waterway))
          if (asPolygon) {
            const poly = wayToPolygon(el, { name, kind, water: true, river: true })
            if (poly) {
              const clipped = clipPolygonToBoundary(poly, boundary)
              if (clipped) waterwayFeatures.push(clipped)
            }
          } else {
            const line = wayToLine(el, { name, kind, water: true, river: true })
            if (line) {
              const clipped = clipLineToBoundary(line, boundary)
              if (clipped) waterwayFeatures.push(clipped)
            }
          }
        }
      } else if (el.tags?.leisure || el.tags?.landuse) {
        const poly = wayToPolygon(el)
        if (!poly) continue
        const c = turf.centroid(poly)
        if (turf.booleanPointInPolygon(c, boundary)) {
          poly.properties = { preserve: el.tags.leisure ?? el.tags.landuse }
          preserveFeatures.push(poly)
        }
      }
    }

    const hardStreetLines = streets
      .filter((s) => HARD_HIGHWAYS.has(s.highway))
      .map((s) =>
        turf.lineString(s.coordinates, {
          name: s.name,
          highway: s.highway,
          kind: 'hard-highway',
        }),
      )

    const arterialLines = streets
      .filter((s) => SOFT_KEEP_HIGHWAYS.has(s.highway))
      .map((s) =>
        turf.lineString(s.coordinates, {
          name: s.name,
          highway: s.highway,
          kind: 'arterial',
        }),
      )

    const softKeepStreets = streets.filter((s) => SOFT_KEEP_HIGHWAYS.has(s.highway))

    const hardConstraintAreas = buildHardConstraintAreas({
      rivers: waterwayFeatures,
      railways: railwayFeatures,
      hardHighways: hardStreetLines,
      arterials: arterialLines,
    })
    const waterNames = uniqueNames(
      waterwayFeatures.map((f) => ({ name: String(f.properties?.name ?? '') })),
      'waterways',
    )
    const railNames = uniqueNames(
      railwayFeatures.map((f) => ({ name: String(f.properties?.name ?? '') })),
      'rail lines',
    )
    const hardRoadNames = uniqueNames(
      hardStreetLines.map((f) => ({ name: String(f.properties?.name ?? '') })),
      'highways',
    )
    const arterialNames = uniqueNames(
      softKeepStreets.map((s) => ({ name: s.name })),
      'arterials',
    )

    const lines: string[] = [
      `Site area: ${areaHa} hectares`,
      `Centroid: [${centroid[0].toFixed(5)}, ${centroid[1].toFixed(5)}]`,
      `Existing streets inside boundary: ${streets.length}`,
      `Building footprints: ${buildingFeatures.length}`,
      `Preserved open spaces: ${preserveFeatures.length}`,
      `Rivers / water bodies: ${waterwayFeatures.length}${waterNames.length ? ` (${waterNames.join(', ')})` : ''}`,
      `Railway lines: ${railwayFeatures.length}${railNames.length ? ` (${railNames.join(', ')})` : ''}`,
      `Hard highways (motorway/trunk): ${hardStreetLines.length}${hardRoadNames.length ? ` (${hardRoadNames.join(', ')})` : ''}`,
      `Major arterials (primary/secondary): ${softKeepStreets.length}${arterialNames.length ? ` (${arterialNames.join(', ')})` : ''}`,
      '',
      'HARD CONSTRAINTS (must remain unless the user prompt explicitly requires moving them):',
      '- Actual rivers/lakes/canals stay — do not place buildings or local roads on the water body',
      '- Flood-prone land may be zoned (with care); only the river itself is a hard no-build',
      '- Railway corridors stay — plan around them; local roads/bike/transit must not run along the tracks',
      '- Motorways, trunks, and major arterials (red/orange/yellow) stay — zoning must not cover their corridors',
      '- Soft clear: ordinary buildings and local streets may be redeveloped',
      '',
      'FEASIBILITY: Prefer adaptive reuse / infill over blank-slate megaprojects. Cost and density must reflect working WITH hard infrastructure.',
      '',
      'CRITICAL: New bike paths, local roads, and transit MUST follow existing streets where possible and must not cross rivers or railways.',
      'Use exact street coordinates below — do NOT draw random diagonal lines across blocks.',
      '',
      'EXISTING STREETS (use these coordinates for bike_paths, local roads, transit):',
    ]

    streets
      .sort((a, b) => b.coordinates.length - a.coordinates.length)
      .slice(0, 25)
      .forEach((s) => {
        const simplified = simplifyCoords(s.coordinates, 6)
        const tier = HARD_HIGHWAYS.has(s.highway)
          ? 'HARD'
          : SOFT_KEEP_HIGHWAYS.has(s.highway)
            ? 'KEEP'
            : 'local'
        lines.push(`- [${tier}] "${s.name}" (${s.highway}): ${JSON.stringify(simplified)}`)
      })

    if (buildingFeatures.length > 0) {
      lines.push('', 'Buildings exist throughout — place residential/commercial in gaps BETWEEN streets, not on top of buildings.')
    }

    if (preserveFeatures.length > 0) {
      lines.push('', 'PRESERVE these existing open spaces — do not place new buildings on sports fields or parks.')
    }

    if (waterwayFeatures.length > 0) {
      lines.push('', 'Waterfront opportunity: orient parks and amenity edges toward rivers; zoning may use nearby flood-prone land but not the river channel itself.')
    }

    return {
      streets,
      buildings: turf.featureCollection(buildingFeatures.slice(0, 300)),
      preserveAreas: turf.featureCollection(preserveFeatures.slice(0, 50)),
      waterways: turf.featureCollection(waterwayFeatures.slice(0, 80)),
      floodAreas: turf.featureCollection([]),
      railways: turf.featureCollection(railwayFeatures.slice(0, 60)),
      hardCorridors: turf.featureCollection(hardStreetLines.slice(0, 40)),
      hardConstraintAreas,
      summaryText: lines.join('\n'),
    }
  } catch {
    return empty
  }
}

function simplifyCoords(coords: Position[], maxPoints: number): Position[] {
  if (coords.length <= maxPoints) return coords.map((c) => [round(c[0]), round(c[1])])
  const step = Math.max(1, Math.floor(coords.length / maxPoints))
  const out = coords.filter((_, i) => i % step === 0 || i === coords.length - 1)
  return out.map((c) => [round(c[0]), round(c[1])])
}

function round(n: number) {
  return Math.round(n * 100000) / 100000
}

export function streetsToFeatureCollection(streets: OsmStreet[]): FeatureCollection<LineString> {
  return turf.featureCollection(
    streets.map((s) =>
      turf.lineString(s.coordinates, { name: s.name, highway: s.highway, osmId: s.id }),
    ),
  )
}

/** Combined no-build zones: parks/open space + hard infrastructure buffers */
export function combinedAvoidanceAreas(context: SiteContext): FeatureCollection<Polygon> {
  return turf.featureCollection([
    ...context.preserveAreas.features,
    ...(context.hardConstraintAreas?.features ?? []),
  ])
}
