import type { AIProvider } from '@/lib/ai/types'
import type { GenerateRequest } from '@/types/master-plan'
import { generateMockMasterPlan } from '@/utils/mock-generator'
import { finalizeMasterPlan } from '@/utils/plan-finalize-server'
import { PROVIDER_LABELS } from '@/types/provider'

export class MockProvider implements AIProvider {
  name = 'mock' as const

  async generate(request: GenerateRequest) {
    await delay(800)
    const mock = generateMockMasterPlan(request)
    const { plan, siteContext } = await finalizeMasterPlan(mock, request.boundary, request.prompt)
    return {
      plan,
      meta: {
        providerId: 'mock' as const,
        providerLabel: PROVIDER_LABELS.mock,
        summarySource: 'mock' as const,
        geometrySource: 'osm-blocks' as const,
      },
      siteContext,
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
