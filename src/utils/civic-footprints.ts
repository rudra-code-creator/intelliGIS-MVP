import * as turf from '@turf/turf'
import type { Feature, Polygon, Position } from 'geojson'
import { SCHOOL_HEIGHT_M, HOSPITAL_HEIGHT_M, EXISTING_BUILDING_HEIGHT_M } from '@/utils/building-heights'

export function buildOrientedCampus(
  center: Position,
  widthM: number,
  depthM: number,
  bearingDeg: number,
  properties: Record<string, unknown>,
): Feature<Polygon> {
  const mPerDegLng = 111320 * Math.cos((center[1] * Math.PI) / 180)
  const halfLng = widthM / 2 / mPerDegLng
  const halfLat = depthM / 2 / 111320
  const box = turf.bboxPolygon([
    center[0] - halfLng,
    center[1] - halfLat,
    center[0] + halfLng,
    center[1] + halfLat,
  ])
  const rotated = turf.transformRotate(box, bearingDeg, { pivot: turf.point(center) }) as Feature<Polygon>
  rotated.properties = properties
  return rotated
}

export function buildSchoolCampus(center: Position, gridBearing: number): Feature<Polygon> {
  return buildOrientedCampus(center, 95, 130, gridBearing, {
    type: 'school',
    name: 'Community School',
    campus: true,
    footprintM2: 95 * 130,
    heightM: SCHOOL_HEIGHT_M,
    baseM: 0,
    height: 'mid',
  })
}

export function buildHospitalCampus(center: Position, gridBearing: number): Feature<Polygon> {
  return buildOrientedCampus(center, 140, 180, gridBearing + 12, {
    type: 'hospital',
    name: 'District Health Centre',
    campus: true,
    footprintM2: 140 * 180,
    heightM: HOSPITAL_HEIGHT_M,
    baseM: 0,
    height: 'mid',
  })
}

export { EXISTING_BUILDING_HEIGHT_M }
