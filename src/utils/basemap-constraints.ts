import 'server-only'

import sharp from 'sharp'
import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, Polygon } from 'geojson'

const TILE_SIZE = 256
const OSM_TILE_URL = 'https://tile.openstreetmap.org'
const USER_AGENT = 'intelliGIS-MVP/1.0 (urban-planning-demo)'
/** Finer step = smaller highlight cells (~4–8 m at z16) */
const PIXEL_STEP = 2
const MAX_TILES = 42
const MAX_CELLS_PER_KIND = 6000

export type BasemapConstraintKind = 'river' | 'highway' | 'arterial' | 'rail'

export interface BasemapScanResult {
  rivers: FeatureCollection<Polygon>
  highways: FeatureCollection<Polygon>
  arterials: FeatureCollection<Polygon>
  rails: FeatureCollection<Polygon>
  allConstraints: FeatureCollection<Polygon>
  summary: string
  gridZoom: number
}

interface TilePixels {
  data: Buffer
  channels: number
}

type TileCache = Map<string, TilePixels>

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z)
}

function pickZoom(bbox: [number, number, number, number]): number {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const widthM =
    turf.distance([minLon, minLat], [maxLon, minLat], { units: 'kilometers' }) * 1000
  const heightM =
    turf.distance([minLon, minLat], [minLon, maxLat], { units: 'kilometers' }) * 1000
  const spanM = Math.max(widthM, heightM)
  if (spanM > 4000) return 14
  if (spanM > 2000) return 15
  if (spanM > 1000) return 16
  return 17
}

function tilePixelToLonLat(
  z: number,
  tileX: number,
  tileY: number,
  px: number,
  py: number,
): [number, number] {
  const n = 2 ** z
  const xFloat = tileX + px / TILE_SIZE
  const yFloat = tileY + py / TILE_SIZE
  const lon = (xFloat / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * yFloat) / n)))
  const lat = (latRad * 180) / Math.PI
  return [lon, lat]
}

function pixelCellBbox(
  z: number,
  tileX: number,
  tileY: number,
  px: number,
  py: number,
  step: number,
): [number, number, number, number] {
  const [lon1, lat1] = tilePixelToLonLat(z, tileX, tileY, px, py)
  const [lon2, lat2] = tilePixelToLonLat(z, tileX, tileY, px + step, py + step)
  return [Math.min(lon1, lon2), Math.min(lat1, lat2), Math.max(lon1, lon2), Math.max(lat1, lat2)]
}

/**
 * Classify OSM Carto raster pixels.
 * Motorway fill is pink-red (#e892ac); casing is dark red.
 * Trunk is orange-red; primary/secondary are yellow-orange.
 */
function classifyPixel(r: number, g: number, b: number): BasemapConstraintKind | null {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lum = (r + g + b) / 3
  const sat = max - min

  // Paper / building fill
  if (lum > 244 && sat < 22) return null

  // Park & forest greens
  if (g > r + 18 && g > b + 14 && g > 88 && lum < 215) return null

  // Railway — near-black line strokes on the basemap
  if (lum < 52 && sat < 32 && max < 58 && min < 48) return 'rail'

  // Water — light blue fill & slightly darker blue edges
  if (b >= 148 && g >= 118 && r >= 72 && b >= g - 18 && b > r + 8 && lum < 238) {
    return 'river'
  }

  // Motorway pink-red fill (#e892ac, #e07a7a)
  if (r >= 168 && g >= 108 && g <= 188 && b >= 118 && b <= 198 && r > g && r > b + 8) {
    return 'highway'
  }

  // Dark red motorway / trunk casing (#ac6363, #c44)
  if (r >= 108 && g <= 108 && b <= 108 && r - g >= 28 && r - b >= 28) {
    return 'highway'
  }

  // Trunk orange-red hard spine (#f9b29c, #e88)
  if (r >= 210 && g >= 130 && g <= 195 && b >= 100 && b <= 175 && r - b >= 42 && r >= g - 12) {
    return 'highway'
  }

  // Saturated red road fill (missed by pink rule)
  if (r >= 185 && g <= 145 && b <= 145 && r - g >= 35 && r - b >= 35) {
    return 'highway'
  }

  // Secondary pale yellow (#f7fabf, #ffffc0)
  if (r >= 218 && g >= 228 && b >= 155 && b <= 215 && g >= r - 18) {
    return 'arterial'
  }

  // Primary light yellow-orange (#fcd6a4, #fde29a)
  if (r >= 228 && g >= 198 && b >= 148 && b <= 195 && g >= b + 18) {
    return 'arterial'
  }

  // Medium orange primary (#f9cc89, #f5c98a)
  if (r >= 220 && g >= 168 && g <= 215 && b >= 108 && b <= 168 && r > g && g > b + 12) {
    return 'arterial'
  }

  // Darker orange arterials (#f0a060, #e89858)
  if (r >= 195 && g >= 118 && g <= 175 && b >= 72 && b <= 135 && r - b >= 55 && r > g + 8) {
    return 'arterial'
  }

  // Deep yellow-orange (#e8b848)
  if (r >= 200 && g >= 155 && g <= 200 && b >= 55 && b <= 110 && r > b + 70 && g > b + 35) {
    return 'arterial'
  }

  return null
}

function readPixel(tile: TilePixels, px: number, py: number): [number, number, number] {
  const idx = (py * TILE_SIZE + px) * tile.channels
  return [tile.data[idx], tile.data[idx + 1], tile.data[idx + 2]]
}

async function loadTile(z: number, x: number, y: number, cache: TileCache): Promise<void> {
  const key = `${z}/${x}/${y}`
  if (cache.has(key)) return

  const url = `${OSM_TILE_URL}/${z}/${x}/${y}.png`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Tile fetch failed ${res.status}`)

  const buf = Buffer.from(await res.arrayBuffer())
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  cache.set(key, { data, channels: info.channels })
}

/**
 * Basemap colour scout — walks tile pixels and marks tiny cells for
 * river (blue), highway (red), arterial (orange/yellow), and rail (black).
 */
export async function scanBasemapConstraints(
  boundary: Feature<Polygon>,
): Promise<BasemapScanResult> {
  const bbox = turf.bbox(boundary) as [number, number, number, number]
  const [minLon, minLat, maxLon, maxLat] = bbox
  const z = pickZoom(bbox)

  const xMin = lonToTileX(minLon, z)
  const xMax = lonToTileX(maxLon, z)
  const yMin = latToTileY(maxLat, z)
  const yMax = latToTileY(minLat, z)

  const cache: TileCache = new Map()
  const tileJobs: Array<{ x: number; y: number }> = []
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tileJobs.push({ x, y })
    }
  }

  await Promise.all(tileJobs.slice(0, MAX_TILES).map(({ x, y }) => loadTile(z, x, y, cache)))

  const buckets: Record<BasemapConstraintKind, Feature<Polygon>[]> = {
    river: [],
    highway: [],
    arterial: [],
    rail: [],
  }

  for (const { x: tileX, y: tileY } of tileJobs.slice(0, MAX_TILES)) {
    const tile = cache.get(`${z}/${tileX}/${tileY}`)
    if (!tile) continue

    for (let py = 0; py < TILE_SIZE; py += PIXEL_STEP) {
      for (let px = 0; px < TILE_SIZE; px += PIXEL_STEP) {
        const cellBbox = pixelCellBbox(z, tileX, tileY, px, py, PIXEL_STEP)
        const centerLon = (cellBbox[0] + cellBbox[2]) / 2
        const centerLat = (cellBbox[1] + cellBbox[3]) / 2
        if (!turf.booleanPointInPolygon(turf.point([centerLon, centerLat]), boundary)) continue

        const [r, g, b] = readPixel(tile, px, py)
        const kind = classifyPixel(r, g, b)
        if (!kind) continue

        if (buckets[kind].length >= MAX_CELLS_PER_KIND) continue

        const cell = turf.bboxPolygon(cellBbox)
        const shade =
          kind === 'arterial'
            ? g > 215 && b > 175
              ? 'yellow'
              : g < 172
                ? 'dark-orange'
                : 'orange'
            : undefined
        cell.properties = { kind, shade, source: 'basemap-scout', constraint: true }
        buckets[kind].push(cell)
      }
    }
  }

  const rivers = turf.featureCollection(buckets.river)
  const highways = turf.featureCollection(buckets.highway)
  const arterials = turf.featureCollection(buckets.arterial)
  const rails = turf.featureCollection(buckets.rail)
  const allConstraints = turf.featureCollection([
    ...rivers.features,
    ...highways.features,
    ...arterials.features,
    ...rails.features,
  ])

  const summary = [
    `Basemap colour scout (z${z}, ${PIXEL_STEP}px cells):`,
    `${rivers.features.length} river, ${highways.features.length} highway,`,
    `${arterials.features.length} arterial, ${rails.features.length} rail pixels.`,
  ].join(' ')

  return { rivers, highways, arterials, rails, allConstraints, summary, gridZoom: z }
}
