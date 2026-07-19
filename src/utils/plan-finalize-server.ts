import 'server-only'

import type { Feature, Polygon } from 'geojson'
import type { MasterPlanResult } from '@/types/master-plan'
import type { SiteContext } from '@/utils/osm-context'
import { buildOsmMasterPlan } from '@/utils/osm-master-plan'
import { fetchMergedSiteContext } from '@/utils/site-constraints'

/** Server-only: fetches constraints (incl. basemap scout) then builds geometry. */
export async function finalizeMasterPlan(
  plan: MasterPlanResult,
  boundary: Feature<Polygon>,
  prompt: string,
  siteContext?: SiteContext | null,
): Promise<{ plan: MasterPlanResult; siteContext: SiteContext }> {
  const ctx = siteContext ?? (await fetchMergedSiteContext(boundary))
  const osmLayers = buildOsmMasterPlan(ctx, boundary, prompt)

  return {
    plan: {
      ...plan,
      layers: {
        ...osmLayers,
        annotations: plan.layers.annotations.length > 0 ? plan.layers.annotations : osmLayers.annotations,
      },
    },
    siteContext: ctx,
  }
}
