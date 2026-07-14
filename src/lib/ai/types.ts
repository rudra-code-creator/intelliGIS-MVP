import type { GenerateRequest, MasterPlanResult } from '@/types/master-plan'
import type { GenerationMeta, ProviderId } from '@/types/provider'
import type { SiteContext } from '@/utils/osm-context'

export interface AIProvider {
  name: ProviderId
  model?: string
  generate(request: GenerateRequest): Promise<GenerateResponse>
}

export interface GenerateResponse {
  plan: MasterPlanResult
  meta: GenerationMeta
  siteContext?: SiteContext
}
