import { NextResponse } from 'next/server'
import type { Feature, Polygon } from 'geojson'
import { createAIProvider } from '@/lib/ai'
import type { GenerateRequest } from '@/types/master-plan'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      prompt: string
      boundary: Feature<Polygon>
    }

    if (!body.prompt || !body.boundary) {
      return NextResponse.json({ error: 'Missing prompt or boundary' }, { status: 400 })
    }

    let provider
    try {
      provider = createAIProvider()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid AI provider configuration'
      return NextResponse.json({ error: message }, { status: 500 })
    }

    const { plan, meta, siteContext } = await provider.generate(body as GenerateRequest)

    return NextResponse.json({ plan, meta, siteContext })
  } catch (error) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
