import type { Feature, FeatureCollection } from 'geojson'
import type {
  AttributeStats,
  BoundingBox,
  DatasetSummary,
  SupportedFileType,
} from '@/types/gis'

function getGeometryType(feature: Feature): string {
  if (!feature.geometry) return 'Unknown'
  if (feature.geometry.type === 'GeometryCollection') {
    return feature.geometry.geometries.map((g) => g.type).join(', ') || 'Unknown'
  }
  return feature.geometry.type
}

function updateBounds(
  bbox: BoundingBox | null,
  coords: number[],
): BoundingBox | null {
  const [lng, lat] = coords
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return bbox

  if (!bbox) {
    return { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat }
  }

  return {
    minLng: Math.min(bbox.minLng, lng),
    minLat: Math.min(bbox.minLat, lat),
    maxLng: Math.max(bbox.maxLng, lng),
    maxLat: Math.max(bbox.maxLat, lat),
  }
}

function walkCoordinates(
  geometry: Feature['geometry'],
  onCoord: (coord: number[]) => void,
): void {
  if (!geometry) return

  if (geometry.type === 'GeometryCollection') {
    geometry.geometries.forEach((g) => walkCoordinates(g, onCoord))
    return
  }

  const coords = geometry.coordinates as unknown

  const traverse = (c: unknown): void => {
    if (Array.isArray(c)) {
      if (typeof c[0] === 'number') {
        onCoord(c as number[])
      } else {
        c.forEach(traverse)
      }
    }
  }

  traverse(coords)
}

function inferCrs(geojson: FeatureCollection): string {
  const crs = (geojson as FeatureCollection & { crs?: { properties?: { name?: string } } }).crs
  if (crs?.properties?.name) return crs.properties.name

  let hasOutOfRange = false
  geojson.features.forEach((f) => {
    walkCoordinates(f.geometry, ([lng, lat]) => {
      if (Math.abs(lng) > 180 || Math.abs(lat) > 90) hasOutOfRange = true
    })
  })

  return hasOutOfRange ? 'Projected (non-WGS84)' : 'EPSG:4326 (WGS84)'
}

function analyzeAttributes(features: Feature[]): {
  attributes: AttributeStats[]
  missingValues: Record<string, number>
} {
  const fieldStats = new Map<string, { values: Set<string>; missing: number; type: string }>()

  features.forEach((feature) => {
    const props = feature.properties ?? {}
    const keys = new Set([...fieldStats.keys(), ...Object.keys(props)])

    keys.forEach((key) => {
      const existing = fieldStats.get(key) ?? { values: new Set<string>(), missing: 0, type: 'string' }
      const value = props[key]

      if (value === null || value === undefined || value === '') {
        existing.missing += 1
      } else {
        const strVal = String(value)
        existing.values.add(strVal)
        if (typeof value === 'number') existing.type = 'number'
        else if (typeof value === 'boolean') existing.type = 'boolean'
      }

      fieldStats.set(key, existing)
    })
  })

  const attributes: AttributeStats[] = []
  const missingValues: Record<string, number> = {}

  fieldStats.forEach((stats, name) => {
    missingValues[name] = stats.missing
    attributes.push({
      name,
      type: stats.type,
      missingCount: stats.missing,
      uniqueCount: stats.values.size,
      sampleValues: [...stats.values].slice(0, 5),
    })
  })

  return { attributes, missingValues }
}

export function analyzeGeoJson(
  geojson: FeatureCollection,
  fileName: string,
  fileType: SupportedFileType,
  fileSize: number,
): DatasetSummary {
  const geometryTypes = [...new Set(geojson.features.map(getGeometryType))]
  let boundingBox: BoundingBox | null = null

  geojson.features.forEach((feature) => {
    walkCoordinates(feature.geometry, (coord) => {
      boundingBox = updateBounds(boundingBox, coord)
    })
  })

  const { attributes, missingValues } = analyzeAttributes(geojson.features)

  return {
    featureCount: geojson.features.length,
    geometryTypes,
    boundingBox,
    attributes,
    missingValues,
    crs: inferCrs(geojson),
    fileSize,
    fileName,
    fileType,
  }
}

export function bboxToArray(bbox: BoundingBox): [number, number, number, number] {
  return [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]
}
