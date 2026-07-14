'use client'

import { useCallback } from 'react'
import { usePlannerStore } from '@/store/planner-store'
import type { GenerationMeta, GeometrySource } from '@/types/provider'
import type { MasterPlanResult } from '@/types/master-plan'
import type { GenerateResponse } from '@/lib/ai/types'
import { PROVIDER_LABELS } from '@/types/provider'
import { applyOsmGeometryToPlan } from '@/utils/plan-finalize'
import type { SiteContext } from '@/utils/osm-context'

const STEPS = [
  { step: 'analysing' as const, delay: 1200 },
  { step: 'land-use' as const, delay: 1400 },
  { step: 'transport' as const, delay: 1200 },
  { step: 'finalising' as const, delay: 1000 },
]

const REFINE_STEPS = [
  { step: 'analysing' as const, delay: 500 },
  { step: 'land-use' as const, delay: 600 },
  { step: 'transport' as const, delay: 500 },
  { step: 'finalising' as const, delay: 400 },
]

const LAYER_ORDER = [
  'green_space',
  'parks',
  'industrial',
  'residential',
  'commercial',
  'roads',
  'bike_paths',
  'transit',
  'schools',
  'hospitals',
  'annotations',
]

export function useGeneratePlan() {
  const boundary = usePlannerStore((s) => s.boundary)
  const prompt = usePlannerStore((s) => s.prompt)
  const masterPlan = usePlannerStore((s) => s.masterPlan)
  const startGeneration = usePlannerStore((s) => s.startGeneration)
  const startRefinement = usePlannerStore((s) => s.startRefinement)
  const setGenerationStep = usePlannerStore((s) => s.setGenerationStep)
  const finishGeneration = usePlannerStore((s) => s.finishGeneration)
  const finishRefinement = usePlannerStore((s) => s.finishRefinement)
  const addAnimatedLayer = usePlannerStore((s) => s.addAnimatedLayer)

  const animateLayers = useCallback(async (plan: MasterPlanResult) => {
    for (const layerId of LAYER_ORDER) {
      addAnimatedLayer(layerId)
      await new Promise((r) => setTimeout(r, 350))
    }
  }, [addAnimatedLayer])

  const loadSiteContext = useCallback(async (): Promise<SiteContext | null> => {
    const cached = usePlannerStore.getState().siteContext
    if (cached) return cached
    const boundaryState = usePlannerStore.getState().boundary
    if (!boundaryState) return null
    try {
      const response = await fetch('/api/osm-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boundary: boundaryState }),
      })
      if (!response.ok) return cached
      return await response.json() as SiteContext
    } catch {
      return cached
    }
  }, [])

  const generate = useCallback(async () => {
    if (!boundary || !prompt.trim()) return

    startGeneration()

    for (const { step, delay } of STEPS) {
      setGenerationStep(step)
      await new Promise((r) => setTimeout(r, delay))
    }

    const applyOsmGeometry = (plan: MasterPlanResult, ctx: SiteContext | null | undefined) => {
      if (!ctx) return plan
      return applyOsmGeometryToPlan(plan, boundary, prompt.trim(), ctx)
    }

    try {
      const [response, siteContext] = await Promise.all([
        fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt.trim(), boundary }),
        }),
        loadSiteContext(),
      ])

      if (!response.ok) throw new Error('Generation failed')

      const data = await response.json() as GenerateResponse & { siteContext?: GenerateResponse['siteContext'] }
      const ctx = siteContext ?? data.siteContext
      const plan = applyOsmGeometry(data.plan, ctx)
      finishGeneration(plan, prompt.trim(), data.meta, ctx ?? undefined)
      await animateLayers(plan)
    } catch {
      const { generateMockMasterPlan } = await import('@/utils/mock-generator')
      const { finalizeMasterPlan } = await import('@/utils/plan-finalize')
      const mock = generateMockMasterPlan({ prompt: prompt.trim(), boundary })
      const siteContext = await loadSiteContext()
      const { plan: finalized, siteContext: ctx } = await finalizeMasterPlan(
        mock,
        boundary,
        prompt.trim(),
        siteContext,
      )
      const plan = applyOsmGeometry(finalized, ctx)
      const meta: GenerationMeta = {
        providerId: 'mock',
        providerLabel: PROVIDER_LABELS.mock,
        summarySource: 'mock',
        geometrySource: 'osm-blocks' satisfies GeometrySource,
        fallbackReason: 'Request failed — client-side OSM fallback',
      }
      finishGeneration(plan, prompt.trim(), meta, ctx)
      await animateLayers(plan)
    }
  }, [boundary, prompt, startGeneration, setGenerationStep, finishGeneration, animateLayers, loadSiteContext])

  const refine = useCallback(async () => {
    if (!boundary || !prompt.trim() || !masterPlan) return

    startRefinement()

    for (const { step, delay } of REFINE_STEPS) {
      setGenerationStep(step)
      await new Promise((r) => setTimeout(r, delay))
    }

    const state = usePlannerStore.getState()
    const followUp = prompt.trim()
    const cumulative = state.fullPlanPrompt
      ? `${state.fullPlanPrompt}\n${followUp}`
      : followUp

    const ctx = await loadSiteContext()
    const basePlan = ctx
      ? applyOsmGeometryToPlan(masterPlan, boundary, cumulative, ctx)
      : masterPlan

    finishRefinement(basePlan, followUp)
    await animateLayers(basePlan)
  }, [boundary, prompt, masterPlan, startRefinement, setGenerationStep, finishRefinement, animateLayers, loadSiteContext])

  return { generate, refine }
}
