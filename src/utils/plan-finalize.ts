import type { Feature, Polygon } from 'geojson'
import type { MasterPlanResult } from '@/types/master-plan'
import type { SiteContext } from '@/utils/osm-context'
import { buildOsmMasterPlan } from '@/utils/osm-master-plan'

/** Attach OSM-derived geometry to an AI summary plan (client-safe). */
export function applyOsmGeometryToPlan(
  plan: MasterPlanResult,
  boundary: Feature<Polygon>,
  prompt: string,
  siteContext: SiteContext,
): MasterPlanResult {
  try {
    const osmLayers = buildOsmMasterPlan(siteContext, boundary, prompt)
    return {
      ...plan,
      layers: {
        ...osmLayers,
        annotations: plan.layers.annotations.length > 0 ? plan.layers.annotations : osmLayers.annotations,
      },
    }
  } catch (error) {
    console.error('Failed to build OSM master plan geometry:', error)
    return plan
  }
}

/** @deprecated use applyOsmGeometryToPlan */
export function hydrateMasterPlanGeometry(
  plan: MasterPlanResult,
  boundary: Feature<Polygon>,
  prompt: string,
  siteContext: SiteContext,
): MasterPlanResult {
  return applyOsmGeometryToPlan(plan, boundary, prompt, siteContext)
}
