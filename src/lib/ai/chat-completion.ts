import type { GenerateRequest, MasterPlanResult } from '@/types/master-plan'
import { generateMockMasterPlan } from '@/utils/mock-generator'
import { finalizeMasterPlan } from '@/utils/plan-finalize'
import { fetchSiteContext } from '@/utils/osm-context'
import { v4 as uuid } from 'uuid'
import { buildTimeline } from '@/utils/mock-generator-helpers'

export type GeometrySource = 'ai' | 'procedural-mock' | 'hybrid' | 'osm-blocks'

export interface ChatGenerationResult {
  plan: MasterPlanResult
  summarySource: 'ai' | 'mock'
  geometrySource: GeometrySource
  siteContext: Awaited<ReturnType<typeof fetchSiteContext>>
}

export async function generateMasterPlanFromChat(
  request: GenerateRequest,
  config: { baseUrl: string; apiKey: string; model: string; useJsonMode?: boolean },
): Promise<ChatGenerationResult> {
  const siteContext = await fetchSiteContext(request.boundary)
  const boundaryJson = JSON.stringify(request.boundary.geometry)

  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0.55,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Planning prompt: ${request.prompt}

${siteContext.summaryText}

Boundary polygon (all coordinates MUST stay inside this):
${boundaryJson}

Design a realistic master plan narrative. Geometry is generated automatically from OpenStreetMap street blocks — you only provide the summary and annotations.`,
      },
    ],
  }

  if (config.useJsonMode !== false) {
    body.response_format = { type: 'json_object' }
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

  if (!response.ok && body.response_format) {
    const retryBody = { ...body }
    delete retryBody.response_format
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
    const errorText = await response.text()
    throw new Error(`Chat completion failed (${response.status}): ${errorText}`)
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>
  }

  const content = data.choices[0]?.message?.content
  if (!content) throw new Error('Empty model response')

  const parsed = parseJsonResponse(content)
  return buildPlanFromAiResponse(request, parsed, siteContext)
}

const SYSTEM_PROMPT = `You are a world-class urban planner and GIS expert for intelliGIS.

The application builds map geometry automatically from OpenStreetMap:
- Roads follow existing streets only
- Buildings are placed in developable blocks between streets
- Existing buildings and sports fields are preserved

Your job is to write the planning SUMMARY and optional map annotations. Do NOT invent road coordinates.

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
    "narrative": "<2-3 sentences describing an artist-impression master plan that respects existing streets and buildings>"
  },
  "annotations": [{ "text": "<label>", "coords": [lng, lat] }]
}

Australian urban planning context. Narrative should reference respecting existing street grid and infrastructure.`

interface ParsedAiOutput {
  summary?: Partial<MasterPlanResult['summary']>
  annotations?: Array<{ text: string; coords?: [number, number] }>
}

function parseJsonResponse(content: string): ParsedAiOutput {
  try {
    return JSON.parse(content) as ParsedAiOutput
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON found in model response')
    return JSON.parse(match[0]) as ParsedAiOutput
  }
}

async function buildPlanFromAiResponse(
  request: GenerateRequest,
  parsed: ParsedAiOutput,
  siteContext: Awaited<ReturnType<typeof fetchSiteContext>>,
): Promise<ChatGenerationResult> {
  const mock = generateMockMasterPlan(request)

  let layers = mock.layers
  if (parsed.annotations?.length) {
    layers.annotations = parsed.annotations
      .filter((a) => a.coords?.length === 2)
      .map((a) => ({
        id: uuid(),
        text: a.text,
        coordinates: a.coords!,
      }))
  }

  const summary = parsed.summary
    ? {
        ...mock.summary,
        ...parsed.summary,
        constructionPhases: mock.summary.constructionPhases,
        populationCapacity: parsed.summary.populationCapacity ?? mock.summary.populationCapacity,
        estimatedJobs: parsed.summary.estimatedJobs ?? mock.summary.estimatedJobs,
        greenSpacePercent: parsed.summary.greenSpacePercent ?? mock.summary.greenSpacePercent,
        walkabilityScore: parsed.summary.walkabilityScore ?? mock.summary.walkabilityScore,
        transitAccessibility: parsed.summary.transitAccessibility ?? mock.summary.transitAccessibility,
        carbonImpact: parsed.summary.carbonImpact ?? mock.summary.carbonImpact,
        developmentCost: parsed.summary.developmentCost ?? mock.summary.developmentCost,
        narrative: parsed.summary.narrative ?? mock.summary.narrative,
      }
    : mock.summary

  const { plan: alignedPlan } = await finalizeMasterPlan(
    { layers, summary, timeline: buildTimeline(request.prompt) },
    request.boundary,
    request.prompt,
    siteContext,
  )

  return {
    plan: alignedPlan,
    summarySource: parsed.summary ? 'ai' : 'mock',
    geometrySource: 'osm-blocks',
    siteContext,
  }
}
