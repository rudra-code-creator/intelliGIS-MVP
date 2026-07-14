import { NextResponse } from 'next/server'
import type { Feature, LineString, Polygon } from 'geojson'
import type { MasterPlanResult } from '@/types/master-plan'
import {
  generateArterialAdaptNarrative,
  mockArterialAdaptNarrative,
  resolveAiConfig,
} from '@/lib/ai/adapt-road-narrative'
import * as turf from '@turf/turf'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      plan: MasterPlanResult
      arterial: Feature<LineString>
      boundary: Feature<Polygon>
      planPrompt: string
      roadName: string
    }

    if (!body.plan || !body.arterial || !body.roadName) {
      return NextResponse.json({ error: 'Missing plan, arterial, or road name' }, { status: 400 })
    }

    const roadLengthM = Math.round(turf.length(body.arterial, { units: 'kilometers' }) * 1000)
    const input = {
      planPrompt: body.planPrompt ?? '',
      roadName: body.roadName,
      roadLengthM,
      currentSummary: body.plan.summary,
    }

    const config = resolveAiConfig()
    const result = config
      ? await generateArterialAdaptNarrative(input, config)
      : mockArterialAdaptNarrative(input)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Adapt road error:', error)
    return NextResponse.json({ error: 'Adaptation failed' }, { status: 500 })
  }
}
