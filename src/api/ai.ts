import type { ChatMessage, DatasetSummary } from '@/types/gis'

export interface AiChatRequest {
  message: string
  projectId: string
  layerSummaries: DatasetSummary[]
  conversationHistory: Pick<ChatMessage, 'role' | 'content'>[]
}

export interface AiChatResponse {
  reply: string
}

const API_BASE = import.meta.env.DEV ? 'http://localhost:8888' : ''

export async function sendAiMessage(request: AiChatRequest): Promise<AiChatResponse> {
  const response = await fetch(`${API_BASE}/.netlify/functions/ai-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'AI request failed' }))
    throw new Error((error as { error?: string }).error ?? 'AI request failed')
  }

  return response.json() as Promise<AiChatResponse>
}
