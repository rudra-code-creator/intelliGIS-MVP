import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Polygon, Position } from 'geojson'

export interface OsmStreet {
  id: string
  name: string
  highway: string
  coordinates: Position[]
}

export interface SiteContext {
  streets: OsmStreet[]
  buildings: FeatureCollection<Polygon>
  preserveAreas: FeatureCollection<Polygon>
  summaryText: string
}

interface OverpassElement {
  type: 'way' | 'node'
  id: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

interface OverpassResponse {
  elements: OverpassElement[]
}

function wayToLine(el: OverpassElement): Feature<LineString> | null {
  if (!el.geometry || el.geometry.length < 2) return null
  const coords = el.geometry.map((p) => [p.lon, p.lat] as Position)
  return turf.lineString(coords, {
    osmId: el.id,
    name: el.tags?.name ?? '',
    highway: el.tags?.highway ?? 'road',
  })
}

function wayToPolygon(el: OverpassElement): Feature<Polygon> | null {
  if (!el.geometry || el.geometry.length < 3) return null
  const coords = el.geometry.map((p) => [p.lon, p.lat] as Position)
  if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
    coords.push(coords[0])
  }
  try {
    return turf.polygon([coords], { building: el.tags?.building ?? 'yes' })
  } catch {
    return null
  }
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

export async function fetchSiteContext(boundary: Feature<Polygon>): Promise<SiteContext> {
  const bbox = turf.bbox(boundary)
  const [minLng, minLat, maxLng, maxLat] = bbox
  const areaHa = (turf.area(boundary) / 10000).toFixed(1)
  const centroid = turf.centroid(boundary).geometry.coordinates

  const empty: SiteContext = {
    streets: [],
    buildings: turf.featureCollection([]),
    preserveAreas: turf.featureCollection([]),
    summaryText: `Site area: ${areaHa} ha. Centroid: [${centroid[0].toFixed(5)}, ${centroid[1].toFixed(5)}]`,
  }

  try {
    const query = `
      [out:json][timeout:25];
      (
        way["highway"](${minLat},${minLng},${maxLat},${maxLng});
        way["building"](${minLat},${minLng},${maxLat},${maxLng});
        way["natural"="water"](${minLat},${minLng},${maxLat},${maxLng});
        way["waterway"](${minLat},${minLng},${maxLat},${maxLng});
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

    for (const el of data.elements) {
      if (el.tags?.highway) {
        const line = wayToLine(el)
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
        const poly = wayToPolygon(el)
        if (!poly) continue
        const c = turf.centroid(poly)
        if (turf.booleanPointInPolygon(c, boundary)) buildingFeatures.push(poly)
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

    const namedStreets = streets.filter((s) => s.name && !s.name.startsWith('residential') && !s.name.startsWith('tertiary'))
    const lines: string[] = [
      `Site area: ${areaHa} hectares`,
      `Centroid: [${centroid[0].toFixed(5)}, ${centroid[1].toFixed(5)}]`,
      `Existing streets inside boundary: ${streets.length}`,
      `Building footprints: ${buildingFeatures.length}`,
      `Preserved open spaces: ${preserveFeatures.length}`,
      '',
      'CRITICAL: New bike paths, local roads, and transit MUST follow these existing streets where possible.',
      'Use exact street coordinates below — do NOT draw random diagonal lines across blocks.',
      '',
      'EXISTING STREETS (use these coordinates for bike_paths, local roads, transit):',
    ]

    streets
      .sort((a, b) => b.coordinates.length - a.coordinates.length)
      .slice(0, 25)
      .forEach((s) => {
        const simplified = simplifyCoords(s.coordinates, 6)
        lines.push(`- "${s.name}" (${s.highway}): ${JSON.stringify(simplified)}`)
      })

    if (buildingFeatures.length > 0) {
      lines.push('', 'Buildings exist throughout — place residential/commercial in gaps BETWEEN streets, not on top of buildings.')
    }

    if (preserveFeatures.length > 0) {
      lines.push('', 'PRESERVE these existing open spaces — do not place new buildings on sports fields or parks.')
    }

    return {
      streets,
      buildings: turf.featureCollection(buildingFeatures.slice(0, 300)),
      preserveAreas: turf.featureCollection(preserveFeatures.slice(0, 50)),
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
