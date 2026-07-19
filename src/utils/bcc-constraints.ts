import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Polygon, Position } from 'geojson'

/** Approximate Brisbane City LGA extents in WGS84 [minLng, minLat, maxLng, maxLat] */
export type LonLatBBox = [number, number, number, number]

export const BRISBANE_LGA_BBOX: LonLatBBox = [152.67, -27.70, 153.32, -27.02]

const BCC_FLOOD_URL =
  'https://services2.arcgis.com/dEKgZETqwmDAh1rP/arcgis/rest/services/Flood_Awareness_Brisbane_River_Creek_Storm_Tide_1percent_Annual_Chance/FeatureServer/0/query'

const BCC_RAIL_EXPORT =
  'https://prod-brisbane-queensland.opendatasoft.com/api/explore/v2.1/catalog/datasets/railway-line-locations/exports/geojson'

const FETCH_TIMEOUT_MS = 12_000

export function isInsideBrisbaneLga(centroid: Position): boolean {
  const [lng, lat] = centroid
  const [minLng, minLat, maxLng, maxLat] = BRISBANE_LGA_BBOX
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function asPolygonFeatures(fc: FeatureCollection): Feature<Polygon>[] {
  const out: Feature<Polygon>[] = []
  for (const f of fc.features) {
    if (!f.geometry) continue
    if (f.geometry.type === 'Polygon') {
      out.push(f as Feature<Polygon>)
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const coords of f.geometry.coordinates) {
        out.push(turf.polygon(coords, { ...(f.properties ?? {}), source: 'bcc' }))
      }
    }
  }
  return out
}

function asLineFeatures(fc: FeatureCollection): Feature<LineString>[] {
  const out: Feature<LineString>[] = []
  for (const f of fc.features) {
    if (!f.geometry) continue
    if (f.geometry.type === 'LineString') {
      out.push({
        ...f,
        properties: { ...(f.properties ?? {}), source: 'bcc', kind: 'railway' },
      } as Feature<LineString>)
    } else if (f.geometry.type === 'MultiLineString') {
      for (const coords of f.geometry.coordinates) {
        out.push(turf.lineString(coords, { ...(f.properties ?? {}), source: 'bcc', kind: 'railway' }))
      }
    }
  }
  return out
}

function clipPolygonsToBbox(features: Feature<Polygon>[], bbox: LonLatBBox): Feature<Polygon>[] {
  const out: Feature<Polygon>[] = []
  for (const f of features) {
    try {
      const clipped = turf.bboxClip(f, bbox)
      if (clipped.geometry.type === 'Polygon' && clipped.geometry.coordinates[0]?.length >= 4) {
        clipped.properties = { ...(f.properties ?? {}), source: 'bcc', water: true, kind: 'flood' }
        out.push(clipped as Feature<Polygon>)
      } else if (clipped.geometry.type === 'MultiPolygon') {
        for (const coords of clipped.geometry.coordinates) {
          out.push(turf.polygon(coords, { ...(f.properties ?? {}), source: 'bcc', water: true, kind: 'flood' }))
        }
      }
    } catch {
      continue
    }
  }
  return out
}

function clipLinesToBbox(features: Feature<LineString>[], bbox: LonLatBBox): Feature<LineString>[] {
  const out: Feature<LineString>[] = []
  for (const f of features) {
    try {
      const clipped = turf.bboxClip(f, bbox)
      if (clipped.geometry.type === 'LineString' && clipped.geometry.coordinates.length >= 2) {
        clipped.properties = { ...(f.properties ?? {}), source: 'bcc', kind: 'railway' }
        out.push(clipped as Feature<LineString>)
      } else if (clipped.geometry.type === 'MultiLineString') {
        for (const coords of clipped.geometry.coordinates) {
          if (coords.length >= 2) {
            out.push(turf.lineString(coords, { ...(f.properties ?? {}), source: 'bcc', kind: 'railway' }))
          }
        }
      }
    } catch {
      continue
    }
  }
  return out
}

/**
 * BCC Flood Awareness 1% AEP polygons (Brisbane River / creek / storm tide).
 * Requests GeoJSON in WGS84 via outSR=4326.
 */
export async function fetchBccWaterways(bbox: LonLatBBox): Promise<FeatureCollection<Polygon>> {
  const [minLng, minLat, maxLng, maxLat] = bbox
  const ring = [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ]
  const geometry = JSON.stringify({
    rings: [ring],
    spatialReference: { wkid: 4326 },
  })

  const params = new URLSearchParams({
    where: '1=1',
    geometry,
    geometryType: 'esriGeometryPolygon',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '500',
  })

  try {
    const response = await fetchWithTimeout(`${BCC_FLOOD_URL}?${params.toString()}`)
    if (!response.ok) return turf.featureCollection([])
    const data = await response.json() as FeatureCollection
    const polys = clipPolygonsToBbox(asPolygonFeatures(data), bbox).slice(0, 120)
    return turf.featureCollection(polys)
  } catch {
    return turf.featureCollection([])
  }
}

/**
 * BCC Open Data railway line locations (GeoJSON export), clipped to bbox.
 */
export async function fetchBccRailways(bbox: LonLatBBox): Promise<FeatureCollection<LineString>> {
  try {
    const response = await fetchWithTimeout(BCC_RAIL_EXPORT)
    if (!response.ok) return turf.featureCollection([])
    const data = await response.json() as FeatureCollection
    const lines = clipLinesToBbox(asLineFeatures(data), bbox).slice(0, 80)
    return turf.featureCollection(lines)
  } catch {
    return turf.featureCollection([])
  }
}

export interface BccConstraintPack {
  waterways: FeatureCollection<Polygon>
  railways: FeatureCollection<LineString>
  usedBccWater: boolean
  usedBccRail: boolean
}

export async function fetchBccConstraints(bbox: LonLatBBox): Promise<BccConstraintPack> {
  const [waterways, railways] = await Promise.all([
    fetchBccWaterways(bbox),
    fetchBccRailways(bbox),
  ])
  return {
    waterways,
    railways,
    usedBccWater: waterways.features.length > 0,
    usedBccRail: railways.features.length > 0,
  }
}
