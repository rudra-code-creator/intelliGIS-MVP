import type { GenerateRequest, MasterPlanResult } from '@/types/master-plan'
import { generateMockMasterPlan } from '@/utils/mock-generator'
import { finalizeMasterPlan } from '@/utils/plan-finalize-server'
import { fetchMergedSiteContext } from '@/utils/site-constraints'
import type { SiteContext } from '@/utils/osm-context'
import { v4 as uuid } from 'uuid'
import { buildTimeline } from '@/utils/mock-generator-helpers'

export type GeometrySource = 'ai' | 'procedural-mock' | 'hybrid' | 'osm-blocks'

export interface ChatGenerationResult {
  plan: MasterPlanResult
  summarySource: 'ai' | 'mock'
  geometrySource: GeometrySource
  siteContext: SiteContext
}

export async function generateMasterPlanFromChat(
  request: GenerateRequest,
  config: { baseUrl: string; apiKey: string; model: string; useJsonMode?: boolean },
): Promise<ChatGenerationResult> {
  const siteContext = await fetchMergedSiteContext(request.boundary)
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

Design a realistic, technically feasible master plan narrative.
Geometry is generated automatically from OpenStreetMap street blocks. Before generation, a basemap colour scout marks visible river (blue), highway (red), and arterial (orange/yellow) pixels as no-build zones — you only provide the summary and annotations.
Do NOT propose relocating rivers, railways, or motorways/trunks unless the planning prompt explicitly requires it.
Cost and density must reflect infill around fixed infrastructure, not a blank-slate rebuild.`,
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

The application builds map geometry automatically from OpenStreetMap street blocks:
- Roads follow existing streets; motorways/trunks stay as the arterial spine
- Buildings are placed only in developable blocks between streets
- Existing buildings and sports fields are preserved
- HARD CONSTRAINTS are never overwritten: rivers/water bodies, railways, motorways/trunks, and major arterials
- Flood-prone land may be zoned; only the actual river channel is a hard no-build for buildings
- Existing buildings and sports fields are preserved
- Local roads, bike paths, and transit must not cross rivers or railway corridors except for a few intentional bridges
- Neighbourhood fabric typically mixes several street patterns (grid, suburban cul-de-sacs, organic, irregular, etc.)

Your job is to write the planning SUMMARY and optional map annotations. Do NOT invent road coordinates.

HARD CONSTRAINT RULES for narrative and KPIs:
- Assume rivers, rail, highways, and major arterials STAY unless the user prompt explicitly demands moving/realigning them
- Zoning may use flood-prone areas with appropriate caveats; do not claim buildings sit in the river itself
- Prefer adaptive reuse / infill over blank-slate megaprojects
- developmentCost must reflect working WITH existing hard infrastructure (not fantasising demolishing a river or motorway)
- populationCapacity and estimatedJobs should be realistic for available developable land after hard constraints
- Narrative must mention how the plan complements named hard infrastructure when present (river, rail, highway)
- Mention the street fabric character when relevant (grid, suburban cul-de-sacs, loose grid, organic, etc.)

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
    "narrative": "<2-3 sentences: artist-impression master plan that respects hard constraints and existing streets>"
  },
  "annotations": [{ "text": "<label>", "coords": [lng, lat] }]
}

Australian urban planning context.`

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
  siteContext: SiteContext,
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
