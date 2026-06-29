import type { Handler, HandlerEvent } from '@netlify/functions'

interface AiChatRequest {
  message: string
  projectId: string
  layerSummaries: Array<{
    fileName: string
    featureCount: number
    geometryTypes: string[]
    crs: string
    attributes: Array<{ name: string; type: string; missingCount: number }>
    boundingBox: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null
  }>
  conversationHistory: Array<{ role: string; content: string }>
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'OpenAI API key not configured' }),
    }
  }

  try {
    const body = JSON.parse(event.body ?? '{}') as AiChatRequest
    const { message, layerSummaries, conversationHistory } = body

    const datasetContext = layerSummaries.length > 0
      ? layerSummaries.map((s, i) => `
Dataset ${i + 1}: ${s.fileName}
- Features: ${s.featureCount}
- Geometry types: ${s.geometryTypes.join(', ')}
- CRS: ${s.crs}
- Attributes: ${s.attributes.map((a) => `${a.name} (${a.type}, ${a.missingCount} missing)`).join(', ')}
- Bounds: ${s.boundingBox ? `${s.boundingBox.minLat}, ${s.boundingBox.minLng} to ${s.boundingBox.maxLat}, ${s.boundingBox.maxLng}` : 'N/A'}
`).join('\n')
      : 'No datasets uploaded yet.'

    const systemPrompt = `You are intelliGIS, an expert AI GIS assistant. You help users understand, analyse, and visualise geospatial data.

You have access to the following dataset summaries:
${datasetContext}

Provide clear, actionable insights about the data. When discussing locations, use geographic context. Suggest appropriate visualisations when relevant. If no data is uploaded, guide the user to upload GeoJSON, CSV, KML, GPX, or Shapefile data.

Be concise but thorough. Use markdown formatting when helpful.`

    const input = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ]

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
        input,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenAI error:', err)
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'AI service error' }),
      }
    }

    const data = await response.json() as {
      output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>
      output_text?: string
    }

    let reply = data.output_text ?? ''

    if (!reply && data.output) {
      for (const item of data.output) {
        if (item.type === 'message' && item.content) {
          for (const part of item.content) {
            if (part.type === 'output_text' && part.text) {
              reply += part.text
            }
          }
        }
      }
    }

    if (!reply) {
      reply = 'I was unable to generate a response. Please try again.'
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply }),
    }
  } catch (error) {
    console.error('AI chat error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}
