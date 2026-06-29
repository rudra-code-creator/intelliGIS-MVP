import type { Feature, FeatureCollection, Geometry } from 'geojson'
import Papa from 'papaparse'
import { kml, gpx } from '@tmcw/togeojson'
import JSZip from 'jszip'
import shp from 'shpjs'
import type { SupportedFileType } from '@/types/gis'

export interface ParseResult {
  geojson: FeatureCollection
  fileType: SupportedFileType
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

function detectFileType(filename: string): SupportedFileType {
  const ext = getFileExtension(filename)
  switch (ext) {
    case 'geojson':
    case 'json':
      return 'geojson'
    case 'csv':
      return 'csv'
    case 'kml':
      return 'kml'
    case 'gpx':
      return 'gpx'
    case 'zip':
      return 'shapefile'
    default:
      return 'geojson'
  }
}

function csvToGeoJson(text: string): FeatureCollection {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  })

  const latKeys = ['lat', 'latitude', 'y', 'LAT', 'Latitude']
  const lngKeys = ['lng', 'lon', 'long', 'longitude', 'x', 'LON', 'Longitude']

  const headers = parsed.meta.fields ?? []
  const latField = headers.find((h) => latKeys.includes(h))
  const lngField = headers.find((h) => lngKeys.includes(h))

  if (!latField || !lngField) {
    throw new Error('CSV must contain latitude and longitude columns (lat/lng, latitude/longitude, or y/x)')
  }

  const features: Feature[] = parsed.data
    .filter((row) => row[latField] != null && row[lngField] != null)
    .map((row) => {
      const lat = Number(row[latField])
      const lng = Number(row[lngField])
      const { [latField]: _lat, [lngField]: _lng, ...properties } = row

      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [lng, lat],
        },
        properties,
      }
    })

  return { type: 'FeatureCollection', features }
}

function xmlToGeoJson(text: string, type: 'kml' | 'gpx'): FeatureCollection {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/xml')
  const converter = type === 'kml' ? kml : gpx
  return converter(doc) as FeatureCollection
}

async function shapefileToGeoJson(file: File): Promise<FeatureCollection> {
  const buffer = await file.arrayBuffer()
  const result = await shp(buffer)
  if (Array.isArray(result)) {
    const features = result.flatMap((fc) => fc.features)
    return { type: 'FeatureCollection', features }
  }
  return result as FeatureCollection
}

async function zipShapefileToGeoJson(file: File): Promise<FeatureCollection> {
  const zip = await JSZip.loadAsync(file)
  const shpFile = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.shp'))

  if (!shpFile) {
    throw new Error('ZIP archive does not contain a .shp file')
  }

  const buffer = await file.arrayBuffer()
  return shapefileToGeoJson(new File([buffer], file.name))
}

export async function parseGeoFile(file: File): Promise<ParseResult> {
  const fileType = detectFileType(file.name)
  const text = await file.text()

  let geojson: FeatureCollection

  switch (fileType) {
    case 'geojson':
      geojson = JSON.parse(text) as FeatureCollection
      break
    case 'csv':
      geojson = csvToGeoJson(text)
      break
    case 'kml':
      geojson = xmlToGeoJson(text, 'kml')
      break
    case 'gpx':
      geojson = xmlToGeoJson(text, 'gpx')
      break
    case 'shapefile':
      geojson = await zipShapefileToGeoJson(file)
      break
    default:
      throw new Error(`Unsupported file type: ${fileType}`)
  }

  if (!geojson.type || geojson.type !== 'FeatureCollection') {
    throw new Error('Invalid GeoJSON: expected FeatureCollection')
  }

  return { geojson, fileType }
}

export function isValidGeometry(geometry: Geometry | null): boolean {
  if (!geometry) return false
  return geometry.type !== 'GeometryCollection' || geometry.geometries.length > 0
}
