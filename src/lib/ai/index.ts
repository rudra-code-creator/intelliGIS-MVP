import { MockProvider } from '@/lib/ai/mock-provider'
import { NvidiaNimProvider } from '@/lib/ai/nvidia-nim-provider'
import { OpenAIProvider } from '@/lib/ai/openai-provider'
import type { AIProvider } from '@/lib/ai/types'

export type AIProviderName = 'mock' | 'openai' | 'nvidia' | 'nim'

function resolveProviderName(): AIProviderName | undefined {
  const raw = process.env.AI_PROVIDER?.toLowerCase()
  if (raw === 'openai') return 'openai'
  if (raw === 'nvidia' || raw === 'nim') return 'nvidia'
  if (raw === 'mock') return 'mock'
  return undefined
}

export function createAIProvider(): AIProvider {
  const explicit = resolveProviderName()

  if (explicit === 'mock') return new MockProvider()

  if (explicit === 'nvidia') {
    const key = process.env.NVIDIA_API_KEY
    if (!key) throw new Error('AI_PROVIDER=nvidia requires NVIDIA_API_KEY')
    return new NvidiaNimProvider(key, process.env.NVIDIA_MODEL)
  }

  if (explicit === 'openai') {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error('AI_PROVIDER=openai requires OPENAI_API_KEY')
    return new OpenAIProvider(key, process.env.OPENAI_MODEL)
  }

  // Auto-detect from available keys (NVIDIA preferred for free-tier demos)
  if (process.env.NVIDIA_API_KEY) {
    return new NvidiaNimProvider(process.env.NVIDIA_API_KEY, process.env.NVIDIA_MODEL)
  }

  if (process.env.OPENAI_API_KEY) {
    return new OpenAIProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL)
  }

  return new MockProvider()
}

export { MockProvider, OpenAIProvider, NvidiaNimProvider }
export type { AIProvider }
