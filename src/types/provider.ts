export type GeometrySource = 'ai' | 'procedural-mock' | 'hybrid' | 'osm-blocks'

export type ProviderId = 'nvidia-nim' | 'openai' | 'mock'

export interface GenerationMeta {
  providerId: ProviderId
  providerLabel: string
  model?: string
  summarySource: 'ai' | 'mock'
  geometrySource: GeometrySource
  fallbackReason?: string
}

export interface ConfiguredProviderInfo {
  providerId: ProviderId
  providerLabel: string
  model?: string
  hasApiKey: boolean
  geometryCapable: boolean
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  'nvidia-nim': 'NVIDIA NIM',
  openai: 'OpenAI',
  mock: 'Mock data',
}

export const GEOMETRY_SOURCE_LABELS: Record<GeometrySource, string> = {
  ai: 'AI-generated',
  hybrid: 'AI + fallback blend',
  'procedural-mock': 'Procedural fallback',
  'osm-blocks': 'OSM block master plan',
}
