import 'server-only'

import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Polygon, Position } from 'geojson'
import { scanBasemapConstraints } from '@/utils/basemap-constraints'
import {
  fetchBccConstraints,
  isInsideBrisbaneLga,
  type LonLatBBox,
} from '@/utils/bcc-constraints'
import {
  buildHardConstraintAreas,
  fetchSiteContext,
  HARD_HIGHWAYS,
  riverProxiesFromFlood,
  SOFT_KEEP_HIGHWAYS,
  type SiteContext,
} from '@/utils/osm-context'

function linesFromStreets(
  context: SiteContext,
  predicate: (highway: string) => boolean,
  kind: string,
): Feature<LineString>[] {
  return context.streets
    .filter((s) => predicate(s.highway))
    .map((s) =>
      turf.lineString(s.coordinates, {
        name: s.name,
        highway: s.highway,
        kind,
        source: 'osm',
      }),
    )
}

/** Thin corridor polygons for rail highlight overlay */
function railwayHighlightBuffers(lines: Feature<LineString>[]): Feature<Polygon>[] {
  const out: Feature<Polygon>[] = []
  for (const line of lines.slice(0, 80)) {
    try {
      const buffered = turf.buffer(line, 10, { units: 'meters', steps: 4 })
      if (!buffered) continue
      if (buffered.geometry.type === 'Polygon') {
        buffered.properties = { kind: 'rail', source: 'vector-rail', constraint: true }
        out.push(buffered as Feature<Polygon>)
      } else if (buffered.geometry.type === 'MultiPolygon') {
        for (const coords of buffered.geometry.coordinates) {
          out.push(
            turf.polygon(coords, { kind: 'rail', source: 'vector-rail', constraint: true }),
          )
        }
      }
    } catch {
      continue
    }
  }
  return out
}

/**
 * Fetch OSM site context, run basemap colour scout, and augment with BCC GIS in Brisbane.
 * Basemap scout marks visible river/highway/arterial/rail pixels as no-build before plan generation.
 * Vector railways are always buffered — never replaced by basemap scan.
 */
export async function fetchMergedSiteContext(boundary: Feature<Polygon>): Promise<SiteContext> {
  const [osm, basemap] = await Promise.all([
    fetchSiteContext(boundary),
    scanBasemapConstraints(boundary).catch(() => null),
  ])

  const centroid = turf.centroid(boundary).geometry.coordinates as Position
  const hardLines = linesFromStreets(osm, (h) => HARD_HIGHWAYS.has(h), 'hard-highway')
  const arterialLines = linesFromStreets(osm, (h) => SOFT_KEEP_HIGHWAYS.has(h), 'arterial')

  const basemapPolys = basemap?.allConstraints.features ?? []
  const hasBasemap = basemapPolys.length > 0

  const rebuild = (
    rivers: Array<Feature<LineString | Polygon>>,
    railways: Feature<LineString>[],
    flood: Feature<Polygon>[],
    summaryExtra: string,
  ): SiteContext => {
    const railHighlight = railwayHighlightBuffers(railways)
    const basemapRailPixels = basemap?.rails.features ?? []
    const allRailHighlight = [...basemapRailPixels, ...railHighlight]

    const hardConstraintAreas = buildHardConstraintAreas({
      rivers: hasBasemap ? [] : rivers,
      railways,
      hardHighways: hasBasemap ? [] : hardLines,
      arterials: hasBasemap ? [] : arterialLines,
      basemapPolygons: hasBasemap ? basemapPolys : undefined,
    })

    const waterDisplay = hasBasemap
      ? [...(basemap?.rivers.features ?? []), ...(osm.waterways?.features ?? [])]
      : rivers

    return {
      ...osm,
      waterways: turf.featureCollection(waterDisplay.slice(0, 200)) as FeatureCollection<
        LineString | Polygon
      >,
      floodAreas: turf.featureCollection(flood.slice(0, 150)),
      railways: turf.featureCollection(railways.slice(0, 80)),
      hardCorridors: turf.featureCollection(hardLines.slice(0, 40)),
      hardConstraintAreas,
      basemapScan: basemap
        ? {
            rivers: basemap.rivers,
            highways: basemap.highways,
            arterials: basemap.arterials,
            railways: turf.featureCollection(allRailHighlight.slice(0, 800)),
          }
        : railHighlight.length > 0
          ? { rivers: turf.featureCollection([]), highways: turf.featureCollection([]), arterials: turf.featureCollection([]), railways: turf.featureCollection(railHighlight) }
          : undefined,
      summaryText: `${osm.summaryText}${summaryExtra}`,
    }
  }

  const basemapNote = basemap
    ? `\n\n${basemap.summary}\nBasemap scout marks visible river (blue), highway (red), arterial (orange/yellow), and rail (black) as no-build before master plan generation. Railways also use BCC/OSM vector buffers.`
    : '\n\nBasemap colour scout unavailable — using vector constraints only.'

  if (!isInsideBrisbaneLga(centroid)) {
    return rebuild(
      osm.waterways?.features ?? [],
      osm.railways?.features ?? [],
      [],
      `${basemapNote}\nConstraint source: OSM + basemap scout (outside Brisbane LGA).`,
    )
  }

  const bbox = turf.bbox(boundary) as LonLatBBox

  try {
    const bcc = await fetchBccConstraints(bbox)
    const floodFeatures = bcc.usedBccWater ? [...bcc.waterways.features] : []
    const riverFeatures = riverProxiesFromFlood(
      floodFeatures,
      [...(osm.waterways?.features ?? [])],
    )

    const railFeatures: Feature<LineString>[] = bcc.usedBccRail
      ? [...bcc.railways.features]
      : [...(osm.railways?.features ?? [])]

    const sources: string[] = ['OSM streets/buildings']
    if (hasBasemap) sources.push('Basemap colour scout (river/highway/arterial/rail pixels)')
    sources.push(`Rivers (${hasBasemap ? basemap!.rivers.features.length : riverFeatures.length})`)
    if (bcc.usedBccWater) sources.push('BCC floodplain (zoning OK outside channel)')
    if (bcc.usedBccRail) sources.push('BCC railway lines')
    else sources.push('OSM railways')

    const summaryExtra = [
      basemapNote,
      '',
      `Constraint sources: ${sources.join(' · ')}`,
      `Railway lines: ${railFeatures.length} (always vector-buffered)`,
      hasBasemap
        ? `Basemap no-build pixels: ${basemapPolys.length} + rail buffers`
        : `Hard highways: ${hardLines.length} · Arterials: ${arterialLines.length}`,
      'Note: Flood-prone land may be developed; river channel + rail + highway/arterial corridors are no-build for parcels.',
    ].join('\n')

    return rebuild(riverFeatures, railFeatures, floodFeatures, summaryExtra)
  } catch {
    return rebuild(
      osm.waterways?.features ?? [],
      osm.railways?.features ?? [],
      [],
      `${basemapNote}\nConstraint source: OSM + basemap scout (BCC fetch failed).`,
    )
  }
}
