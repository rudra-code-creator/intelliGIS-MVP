import type { AIProvider } from '@/lib/ai/types'
import type { GenerateRequest } from '@/types/master-plan'
import { generateMasterPlanFromChat } from '@/lib/ai/chat-completion'
import { generateMockMasterPlan } from '@/utils/mock-generator'
import { finalizeMasterPlan } from '@/utils/plan-finalize-server'
import { PROVIDER_LABELS } from '@/types/provider'

const NVIDIA_NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1'
const DEFAULT_NVIDIA_MODEL = 'z-ai/glm-5.2'

export class NvidiaNimProvider implements AIProvider {
  name = 'nvidia-nim' as const
  model: string
  private apiKey: string

  constructor(apiKey: string, model = DEFAULT_NVIDIA_MODEL) {
    this.apiKey = apiKey
    this.model = model
  }

  async generate(request: GenerateRequest) {
    try {
      const result = await generateMasterPlanFromChat(request, {
        baseUrl: NVIDIA_NIM_BASE_URL,
        apiKey: this.apiKey,
        model: this.model,
        useJsonMode: true,
      })

      return {
        plan: result.plan,
        meta: {
          providerId: 'nvidia-nim' as const,
          providerLabel: PROVIDER_LABELS['nvidia-nim'],
          model: this.model,
          summarySource: result.summarySource,
          geometrySource: result.geometrySource,
        },
        siteContext: result.siteContext,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'API call failed'
      console.error('NVIDIA NIM provider error:', error)

      const mock = generateMockMasterPlan(request)
      const { plan, siteContext } = await finalizeMasterPlan(mock, request.boundary, request.prompt)

      return {
        plan,
        meta: {
          providerId: 'nvidia-nim' as const,
          providerLabel: PROVIDER_LABELS['nvidia-nim'],
          model: this.model,
          summarySource: 'mock' as const,
          geometrySource: 'osm-blocks' as const,
          fallbackReason: reason,
        },
        siteContext,
      }
    }
  }
}
