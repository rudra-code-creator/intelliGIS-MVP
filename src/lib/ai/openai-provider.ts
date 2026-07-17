import type { AIProvider } from '@/lib/ai/types'
import type { GenerateRequest } from '@/types/master-plan'
import { generateMasterPlanFromChat } from '@/lib/ai/chat-completion'
import { generateMockMasterPlan } from '@/utils/mock-generator'
import { finalizeMasterPlan } from '@/utils/plan-finalize-server'
import { PROVIDER_LABELS } from '@/types/provider'

const OPENAI_BASE_URL = 'https://api.openai.com/v1'

export class OpenAIProvider implements AIProvider {
  name = 'openai' as const
  model: string
  private apiKey: string

  constructor(apiKey: string, model = 'gpt-4.1-mini') {
    this.apiKey = apiKey
    this.model = model
  }

  async generate(request: GenerateRequest) {
    try {
      const result = await generateMasterPlanFromChat(request, {
        baseUrl: OPENAI_BASE_URL,
        apiKey: this.apiKey,
        model: this.model,
        useJsonMode: true,
      })

      return {
        plan: result.plan,
        meta: {
          providerId: 'openai' as const,
          providerLabel: PROVIDER_LABELS.openai,
          model: this.model,
          summarySource: result.summarySource,
          geometrySource: result.geometrySource,
        },
        siteContext: result.siteContext,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'API call failed'
      console.error('OpenAI provider error:', error)

      const mock = generateMockMasterPlan(request)
      const { plan, siteContext } = await finalizeMasterPlan(mock, request.boundary, request.prompt)

      return {
        plan,
        meta: {
          providerId: 'openai' as const,
          providerLabel: PROVIDER_LABELS.openai,
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
