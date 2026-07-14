import type { GenerateRequest, MasterPlanResult } from '@/types/master-plan'
import { finalizeMasterPlan } from '@/utils/plan-finalize'
import { v4 as uuid } from 'uuid'
import { buildSummary, buildTimeline } from '@/utils/mock-generator-helpers'
import * as turf from '@turf/turf'

/** Summary-only mock; geometry is built from OSM blocks in finalizeMasterPlan */
export function generateMockMasterPlan(request: GenerateRequest): MasterPlanResult {
  const area = turf.area(request.boundary)
  const centroid = turf.centroid(request.boundary)

  return {
    layers: {
      roads: turf.featureCollection([]),
      parks: turf.featureCollection([]),
      residential: turf.featureCollection([]),
      commercial: turf.featureCollection([]),
      industrial: turf.featureCollection([]),
      bike_paths: turf.featureCollection([]),
      transit: turf.featureCollection([]),
      green_space: turf.featureCollection([]),
      schools: turf.featureCollection([]),
      hospitals: turf.featureCollection([]),
      annotations: [
        {
          id: uuid(),
          text: 'Planning area',
          coordinates: centroid.geometry.coordinates,
        },
      ],
    },
    summary: buildSummary(area, request.prompt),
    timeline: buildTimeline(request.prompt),
  }
}
