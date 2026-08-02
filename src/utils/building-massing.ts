/**
 * Building massing helpers.
 * These generate GeoJSON Polygon features with `heightM` / `baseM` properties
 * for 3D fill-extrusion rendering in MapLibre.
 */

import * as turf from '@turf/turf'
import type { Feature, Polygon } from 'geojson'
import { hash01, lerpHeight } from './building-heights'

export type MassingLandUse = 'commercial' | 'office' | 'residential' | 'industrial'

export interface MassingIntent {
  cbd: boolean
  highDensity: boolean
}

/** Per-use height ranges (min/max metres). */
const HEIGHT_RANGES: Record<MassingLandUse, { min: number; max: number }> = {
  office:      { min: 55,  max: 160 },
  commercial:  { min: 20,  max: 55  },
  residential: { min: 8,   max: 40  },
  industrial:  { min: 8,   max: 14  },
}

/** Standard inset-from-parcel margins by land use. */
const INSET_M: Record<MassingLandUse, number> = {
  office:      5,
  commercial:  6,
  residential: 9,
  industrial:  5,
}

/**
 * Extract footprint polygons from a parcel, with optional subdivision.
 * Returns inset polygons with no height properties yet.
 */
function extractFootprintPolygons(
  parcel: Feature<Polygon>,
  insetM: number,
  count: number,
  gridRotationDeg: number,
): Feature<Polygon>[] {
  let inset = turf.buffer(parcel, -insetM, { units: 'meters', steps: 4 })
  if (!inset || turf.area(inset) < 250) return []
  if (inset.geometry.type === 'MultiPolygon') {
    const polys = inset.geometry.coordinates.map((c) => turf.polygon(c))
    inset = polys.sort((a, b) => turf.area(b) - turf.area(a))[0]
  }
  if (!inset || turf.area(inset) < 250) return []

  if (count <= 1) return [inset as Feature<Polygon>]

  // Subdivide into `count` rectangular footprints
  const pivot = turf.centroid(inset)
  const rotatedInset = turf.transformRotate(inset, -gridRotationDeg, { pivot }) as Feature<Polygon>
  const [minX, minY, maxX, maxY] = turf.bbox(rotatedInset)
  const cols = count <= 2 ? count : 2
  const rows = Math.ceil(count / cols)
  const result: Feature<Polygon>[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (result.length >= count) break
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
        const final = turf.intersect(turf.featureCollection([world, inset as Feature<Polygon>]))
        if (!final || final.geometry.type !== 'Polygon' || turf.area(final) <= 200) continue
        result.push(final as Feature<Polygon>)
      } catch {
        continue
      }
    }
  }

  return result.length > 0 ? result : [inset as Feature<Polygon>]
}

/**
 * Assign `heightM` and massing properties to each footprint for a single
 * land use, varying heights parcel-by-parcel with a hash seed.
 */
export function parcelToMassing(
  parcel: Feature<Polygon>,
  landUse: MassingLandUse,
  intent: MassingIntent,
  gridBearing: number,
): Feature<Polygon>[] {
  const area = turf.area(parcel)
  const range = HEIGHT_RANGES[landUse]

  const seed = `${parcel.geometry.coordinates[0][0]?.[0] ?? 0},${parcel.geometry.coordinates[0][0]?.[1] ?? 0},${landUse}`
  const t = hash01(seed)

  // CBD/high-density boosts heights toward max
  const boost = (intent.cbd || intent.highDensity) && (landUse === 'office' || landUse === 'commercial') ? 0.35 : 0
  const heightM = lerpHeight(range.min, range.max, Math.min(1, t + boost))

  const count = area > 35000
    ? (landUse === 'office' ? 2 : landUse === 'commercial' ? 2 : 3)
    : 1

  const footprints = extractFootprintPolygons(parcel, INSET_M[landUse], count, gridBearing)

  return footprints.map((fp) => {
    fp.properties = {
      landUse,
      impression: true,
      heightM,
      height: landUse === 'commercial' ? (intent.cbd ? 'high' : 'mid')
        : landUse === 'industrial' ? 'warehouse'
        : landUse === 'office' ? (heightM > 80 ? 'high' : 'mid')
        : 'low',
    }
    return fp
  })
}

/**
 * Push segments from `parcelToMassing` into destination arrays.
 */
export function pushSegments(
  dest: Feature<Polygon>[],
  parcel: Feature<Polygon>,
  landUse: MassingLandUse,
  intent: MassingIntent,
  gridBearing: number,
): void {
  dest.push(...parcelToMassing(parcel, landUse, intent, gridBearing))
}

/**
 * Mixed-use stacked tower:
 *   - ground podium (commercial)
 *   - office shaft above podium
 *   - optional residential crown above office
 *
 * Returns 2 or 3 overlapping polygons with different baseM/heightM.
 */
export function mixedUseTowerMassing(
  parcel: Feature<Polygon>,
  gridBearing: number,
  intent: MassingIntent,
): Feature<Polygon>[] {
  const seed = `${parcel.geometry.coordinates[0][0]?.[0] ?? 0},${parcel.geometry.coordinates[0][0]?.[1] ?? 0},tower`
  const t = hash01(seed)

  const podiumH = lerpHeight(12, 24, t)
  const officeH = lerpHeight(40, 120, Math.min(1, t + (intent.cbd ? 0.3 : 0)))
  const hasCrown = t > 0.55

  const footprints = extractFootprintPolygons(parcel, 5, 1, gridBearing)
  if (footprints.length === 0) return []
  const base = footprints[0]

  const parts: Feature<Polygon>[] = []

  // Podium (commercial)
  const podium = turf.clone(base)
  podium.properties = {
    landUse: 'commercial',
    impression: true,
    massingPart: 'podium',
    heightM: podiumH,
    baseM: 0,
    height: 'mid',
  }
  parts.push(podium)

  // Office shaft — slightly inset from podium footprint
  let shaftBase = turf.buffer(base, -4, { units: 'meters', steps: 4 })
  if (!shaftBase || turf.area(shaftBase) < 200) shaftBase = base
  if (shaftBase.geometry.type === 'MultiPolygon') {
    const polys = shaftBase.geometry.coordinates.map((c) => turf.polygon(c))
    shaftBase = polys.sort((a, b) => turf.area(b) - turf.area(a))[0]
  }
  const shaft = shaftBase as Feature<Polygon>
  shaft.properties = {
    landUse: 'office',
    impression: true,
    massingPart: 'office-shaft',
    heightM: podiumH + officeH,
    baseM: podiumH,
    height: officeH > 80 ? 'high' : 'mid',
  }
  parts.push(shaft)

  // Residential crown (optional)
  if (hasCrown) {
    const crownH = lerpHeight(15, 35, t)
    let crownBase = turf.buffer(shaft, -5, { units: 'meters', steps: 4 })
    if (!crownBase || turf.area(crownBase) < 200) crownBase = shaft
    if (crownBase.geometry.type === 'MultiPolygon') {
      const polys = crownBase.geometry.coordinates.map((c) => turf.polygon(c))
      crownBase = polys.sort((a, b) => turf.area(b) - turf.area(a))[0]
    }
    const crown = crownBase as Feature<Polygon>
    crown.properties = {
      landUse: 'residential',
      impression: true,
      massingPart: 'residential-crown',
      heightM: podiumH + officeH + crownH,
      baseM: podiumH + officeH,
      height: 'mid',
    }
    parts.push(crown)
  }

  return parts
}

/**
 * Public square: flat low-height polygon (plaza/hardscape) with heightM 1.
 */
export function publicSquareFootprint(
  parcel: Feature<Polygon>,
): Feature<Polygon> | null {
  let plaza = turf.buffer(parcel, -3, { units: 'meters', steps: 6 })
  if (!plaza || turf.area(plaza) < 300) plaza = parcel
  if (plaza.geometry.type === 'MultiPolygon') {
    const polys = plaza.geometry.coordinates.map((c) => turf.polygon(c))
    plaza = polys.sort((a, b) => turf.area(b) - turf.area(a))[0]
  }
  if (!plaza || turf.area(plaza) < 250) return null

  const result = plaza as Feature<Polygon>
  result.properties = {
    landUse: 'public-square',
    impression: true,
    heightM: 1,
    height: 'plaza',
  }
  return result
}
