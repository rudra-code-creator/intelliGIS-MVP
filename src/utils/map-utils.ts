import type { BasemapStyle } from '@/types/gis'

export const BASEMAP_STYLES: Record<BasemapStyle, { name: string; url: string }> = {
  streets: {
    name: 'OpenStreetMap',
    url: 'https://tiles.openfreemap.org/styles/liberty',
  },
  satellite: {
    name: 'Satellite',
    url: 'https://tiles.openfreemap.org/styles/bright',
  },
  dark: {
    name: 'Dark',
    url: 'https://tiles.openfreemap.org/styles/dark',
  },
  light: {
    name: 'Light',
    url: 'https://tiles.openfreemap.org/styles/positron',
  },
}

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineDistance(
  coord1: [number, number],
  coord2: [number, number],
): number {
  const [lng1, lat1] = coord1
  const [lng2, lat2] = coord2
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function measureLineDistance(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistance(coords[i - 1], coords[i])
  }
  return total
}

export function measurePolygonArea(coords: [number, number][]): number {
  if (coords.length < 3) return 0

  let area = 0
  const n = coords.length

  for (let i = 0; i < n; i++) {
    const [lng1, lat1] = coords[i]
    const [lng2, lat2] = coords[(i + 1) % n]
    area += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)))
  }

  return Math.abs((area * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2)
}

export function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`
  if (km < 10) return `${km.toFixed(2)} km`
  return `${km.toFixed(1)} km`
}

export function formatArea(km2: number): string {
  if (km2 < 0.01) return `${(km2 * 1_000_000).toFixed(0)} m²`
  if (km2 < 1) return `${(km2 * 100).toFixed(2)} ha`
  return `${km2.toFixed(2)} km²`
}

export interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  boundingbox: [string, string, string, string]
}

export async function searchLocations(query: string) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '5')

  const response = await fetch(url.toString(), {
    headers: { 'Accept-Language': 'en' },
  })

  if (!response.ok) throw new Error('Location search failed')

  const results = (await response.json()) as NominatimResult[]
  return results.map((r) => ({
    id: String(r.place_id),
    name: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    bbox: [
      parseFloat(r.boundingbox[2]),
      parseFloat(r.boundingbox[0]),
      parseFloat(r.boundingbox[3]),
      parseFloat(r.boundingbox[1]),
    ] as [number, number, number, number],
  }))
}
