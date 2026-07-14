import { NextResponse } from 'next/server'
import { getConfiguredProviderInfo } from '@/lib/ai/provider-info'

export async function GET() {
  return NextResponse.json(getConfiguredProviderInfo())
}
