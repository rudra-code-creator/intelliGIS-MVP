import type { ConfiguredProviderInfo, ProviderId } from '@/types/provider'
import { PROVIDER_LABELS } from '@/types/provider'

function resolveExplicitProvider(): ProviderId | 'mock-explicit' | undefined {
  const raw = process.env.AI_PROVIDER?.toLowerCase()
  if (raw === 'openai') return 'openai'
  if (raw === 'nvidia' || raw === 'nim') return 'nvidia-nim'
  if (raw === 'mock') return 'mock-explicit'
  return undefined
}

export function getConfiguredProviderInfo(): ConfiguredProviderInfo {
  const explicit = resolveExplicitProvider()
  const nvidiaKey = process.env.NVIDIA_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  const nvidiaModel = process.env.NVIDIA_MODEL ?? 'z-ai/glm-5.2'
  const openaiModel = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'

  if (explicit === 'mock-explicit') {
    return {
      providerId: 'mock',
      providerLabel: PROVIDER_LABELS.mock,
      hasApiKey: false,
      geometryCapable: false,
    }
  }

  if (explicit === 'nvidia-nim') {
    return {
      providerId: 'nvidia-nim',
      providerLabel: PROVIDER_LABELS['nvidia-nim'],
      model: nvidiaModel,
      hasApiKey: Boolean(nvidiaKey),
      geometryCapable: Boolean(nvidiaKey),
    }
  }

  if (explicit === 'openai') {
    return {
      providerId: 'openai',
      providerLabel: PROVIDER_LABELS.openai,
      model: openaiModel,
      hasApiKey: Boolean(openaiKey),
      geometryCapable: Boolean(openaiKey),
    }
  }

  if (nvidiaKey) {
    return {
      providerId: 'nvidia-nim',
      providerLabel: PROVIDER_LABELS['nvidia-nim'],
      model: nvidiaModel,
      hasApiKey: true,
      geometryCapable: true,
    }
  }

  if (openaiKey) {
    return {
      providerId: 'openai',
      providerLabel: PROVIDER_LABELS.openai,
      model: openaiModel,
      hasApiKey: true,
      geometryCapable: true,
    }
  }

  return {
    providerId: 'mock',
    providerLabel: PROVIDER_LABELS.mock,
    hasApiKey: false,
    geometryCapable: false,
  }
}
