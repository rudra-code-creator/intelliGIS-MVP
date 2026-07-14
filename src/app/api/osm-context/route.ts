import { NextResponse } from 'next/server'
import type { Feature, Polygon } from 'geojson'
import { fetchSiteContext } from '@/utils/osm-context'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { boundary: Feature<Polygon> }
    if (!body.boundary) {
      return NextResponse.json({ error: 'Missing boundary' }, { status: 400 })
    }
    const context = await fetchSiteContext(body.boundary)
    return NextResponse.json(context)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch OSM context' }, { status: 500 })
  }
}
