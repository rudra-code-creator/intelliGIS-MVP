import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson'
import type { MasterPlanLayers } from '@/types/master-plan'
import type { OsmStreet, SiteContext } from '@/utils/osm-context'

const SNAP_DISTANCE_KM = 0.08

function nearestStreet(
  line: Feature<LineString>,
  streets: OsmStreet[],
  preferMajor = false,
): OsmStreet | null {
  const mid = turf.along(line, turf.length(line, { units: 'kilometers' }) / 2, { units: 'kilometers' })
  let best: OsmStreet | null = null
  let bestDist = Infinity

  for (const street of streets) {
    if (preferMajor && !['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(street.highway)) {
      continue
    }
    const streetLine = turf.lineString(street.coordinates)
    const nearest = turf.nearestPointOnLine(streetLine, mid)
    const dist = turf.distance(mid, nearest, { units: 'kilometers' })
    if (dist < bestDist) {
      bestDist = dist
      best = street
    }
  }

  return bestDist <= SNAP_DISTANCE_KM ? best : null
}

function snapLineCollection(
  fc: FeatureCollection<LineString>,
  streets: OsmStreet[],
  boundary: Feature<Polygon>,
  options: { preferMajor?: boolean; fallbackToStreets?: boolean } = {},
): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = []
  const usedStreets = new Set<string>()

  for (const feature of fc.features) {
    const match = nearestStreet(feature, streets, options.preferMajor)
    if (match && !usedStreets.has(match.id)) {
      usedStreets.add(match.id)
      features.push(
        turf.lineString(match.coordinates, {
          ...feature.properties,
          snappedTo: match.name,
          class: feature.properties?.class ?? 'local',
        }),
      )
      continue
    }
    if (match) {
      features.push(
        turf.lineString(match.coordinates, {
          ...feature.properties,
          snappedTo: match.name,
        }),
      )
      continue
    }
    features.push(feature)
  }

  if (options.fallbackToStreets && features.length < 2 && streets.length > 0) {
    const candidates = streets
      .filter((s) => options.preferMajor ? ['tertiary', 'secondary', 'primary', 'residential', 'living_street'].includes(s.highway) : true)
      .sort((a, b) => b.coordinates.length - a.coordinates.length)
      .slice(0, 4)

    for (const street of candidates) {
      if (!usedStreets.has(street.id)) {
        usedStreets.add(street.id)
        features.push(
          turf.lineString(street.coordinates, {
            type: options.preferMajor ? 'transit' : 'bike',
            class: 'protected',
            snappedTo: street.name,
            fromOsm: true,
          }),
        )
      }
    }
  }

  return turf.featureCollection(
    features.filter((f) => {
      const mid = f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)]
      return turf.booleanPointInPolygon(turf.point(mid), boundary)
    }),
  )
}

/** Generate city blocks from street network for land-use polygons */
function generateBlocksFromStreets(
  streets: OsmStreet[],
  boundary: Feature<Polygon>,
  landUse: string,
  maxBlocks: number,
): Feature<Polygon>[] {
  if (streets.length < 3) return []

  try {
    const allLines = streets.map((s) => turf.lineString(s.coordinates))
    const merged = turf.featureCollection(allLines)
    const polygonized = turf.polygonize(merged)

    const blocks = polygonized.features
      .map((poly) => {
        const clipped = turf.intersect(turf.featureCollection([poly, boundary]))
        return clipped as Feature<Polygon> | null
      })
      .filter((p): p is Feature<Polygon> => {
        if (!p) return false
        const area = turf.area(p)
        return area > 1200 && area < 80000
      })
      .sort((a, b) => turf.area(b) - turf.area(a))
      .slice(0, maxBlocks)
      .map((p, i) => {
        p.properties = { landUse, block: i + 1, fromOsm: true }
        return p
      })

    return blocks
  } catch {
    return []
  }
}

export function alignLayersToOsm(
  layers: MasterPlanLayers,
  context: SiteContext,
  boundary: Feature<Polygon>,
): MasterPlanLayers {
  const { streets } = context
  if (streets.length === 0) return layers

  const bike_paths = snapLineCollection(layers.bike_paths, streets, boundary, {
    fallbackToStreets: true,
  })

  const transit = snapLineCollection(layers.transit, streets, boundary, {
    preferMajor: true,
    fallbackToStreets: true,
  })

  const roads = snapLineCollection(layers.roads, streets, boundary, {})

  const osmBlocks = generateBlocksFromStreets(streets, boundary, 'residential', 8)
  const commercialBlocks = generateBlocksFromStreets(
    streets.filter((s) => ['tertiary', 'secondary', 'primary'].includes(s.highway)),
    boundary,
    'commercial',
    4,
  )

  const residential =
    layers.residential.features.length >= 3
      ? layers.residential
      : turf.featureCollection(osmBlocks.length > 0 ? osmBlocks : layers.residential.features)

  const commercial =
    layers.commercial.features.length >= 2
      ? layers.commercial
      : turf.featureCollection(commercialBlocks.length > 0 ? commercialBlocks : layers.commercial.features)

  return {
    ...layers,
    roads,
    bike_paths,
    transit,
    residential,
    commercial,
  }
}
