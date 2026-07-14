import type { MasterPlanSummary } from '@/types/master-plan'

export interface AdaptRoadNarrativeInput {
  planPrompt: string
  roadName: string
  roadLengthM: number
  currentSummary: MasterPlanSummary
}

export interface AdaptRoadNarrativeResult {
  summary: Partial<MasterPlanSummary>
  source: 'ai' | 'mock'
}

const ADAPT_SYSTEM_PROMPT = `You are an urban planner for intelliGIS. The user drew a new major arterial road on an existing master plan.
Geometry has already been updated (commercial frontage, transit, collector spurs). Write an updated planning summary.

Return ONLY valid JSON:
{
  "summary": {
    "populationCapacity": <number>,
    "estimatedJobs": <number>,
    "greenSpacePercent": <number>,
    "walkabilityScore": <number>,
    "transitAccessibility": <number>,
    "carbonImpact": "<string>",
    "developmentCost": "<string>",
    "narrative": "<2-3 sentences explaining how the plan adapted around the new arterial>"
  }
}`

export function mockArterialAdaptNarrative(input: AdaptRoadNarrativeInput): AdaptRoadNarrativeResult {
  const { roadName, roadLengthM, currentSummary } = input
  return {
    source: 'mock',
    summary: {
      narrative: `${currentSummary.narrative} The plan was reorganised around ${roadName} (${roadLengthM} m), with mixed-use frontage, BRT alignment, and perpendicular collector streets tying existing neighbourhoods into the new corridor.`,
      transitAccessibility: Math.min(currentSummary.transitAccessibility + 12, 98),
      walkabilityScore: Math.min(currentSummary.walkabilityScore + 5, 95),
      estimatedJobs: Math.round(currentSummary.estimatedJobs * 1.08),
      populationCapacity: Math.round(currentSummary.populationCapacity * 1.03),
    },
  }
}

export async function generateArterialAdaptNarrative(
  input: AdaptRoadNarrativeInput,
  config: { baseUrl: string; apiKey: string; model: string },
): Promise<AdaptRoadNarrativeResult> {
  const body = {
    model: config.model,
    temperature: 0.5,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: ADAPT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Original planning brief:\n${input.planPrompt}\n\nNew arterial: ${input.roadName} (${input.roadLengthM} m)\n\nCurrent summary narrative:\n${input.currentSummary.narrative}\n\nDescribe how land use and mobility adapt around this corridor.`,
      },
    ],
  }

  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const retryBody = { ...body }
    delete (retryBody as { response_format?: unknown }).response_format
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(retryBody),
    })
  }

  if (!response.ok) {
    return mockArterialAdaptNarrative(input)
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>
  }
  const content = data.choices[0]?.message?.content
  if (!content) return mockArterialAdaptNarrative(input)

  try {
    const parsed = JSON.parse(content) as { summary?: Partial<MasterPlanSummary> }
    if (!parsed.summary?.narrative) return mockArterialAdaptNarrative(input)
    return {
      source: 'ai',
      summary: {
        ...input.currentSummary,
        ...parsed.summary,
        constructionPhases: input.currentSummary.constructionPhases,
      },
    }
  } catch {
    return mockArterialAdaptNarrative(input)
  }
}

export function resolveAiConfig(): { baseUrl: string; apiKey: string; model: string } | null {
  if (process.env.NVIDIA_API_KEY) {
    return {
      baseUrl: process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY,
      model: process.env.NVIDIA_MODEL ?? 'z-ai/glm-5.2',
    }
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    }
  }
  return null
}
