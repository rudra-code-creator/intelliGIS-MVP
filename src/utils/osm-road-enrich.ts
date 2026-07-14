import * as turf from '@turf/turf'
import type { FeatureCollection, LineString } from 'geojson'
import { generateRoadName, type RoadClass, roadWidthMeters } from '@/utils/road-names'

export function enrichRoadCollection(roads: FeatureCollection<LineString>): FeatureCollection<LineString> {
  const usedNames = new Set<string>()
  const features = roads.features.map((line, index) => {
    const roadClass = (line.properties?.class as RoadClass | undefined) ?? 'local'
    const existingName = typeof line.properties?.name === 'string' ? line.properties.name.trim() : ''
    const name = existingName.length > 0
      ? existingName
      : generateRoadName(roadClass, index, usedNames)
    if (existingName.length > 0) usedNames.add(existingName.toLowerCase())

    return turf.lineString(line.geometry.coordinates, {
      ...line.properties,
      class: roadClass,
      type: 'road',
      name,
      widthM: roadWidthMeters(roadClass),
    })
  })
  return turf.featureCollection(features)
}
