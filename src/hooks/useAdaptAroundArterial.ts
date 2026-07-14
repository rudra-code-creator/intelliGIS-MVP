'use client'

import { useCallback } from 'react'
import { usePlannerStore } from '@/store/planner-store'
import { adaptMasterPlanAroundArterial } from '@/utils/adapt-around-arterial'
import type { Position } from 'geojson'

const STEPS = [
  { step: 'analysing' as const, delay: 450 },
  { step: 'transport' as const, delay: 550 },
  { step: 'land-use' as const, delay: 500 },
  { step: 'finalising' as const, delay: 400 },
]

export function useAdaptAroundArterial() {
  const startRefinement = usePlannerStore((s) => s.startRefinement)
  const setGenerationStep = usePlannerStore((s) => s.setGenerationStep)
  const finishArterialAdaptation = usePlannerStore((s) => s.finishArterialAdaptation)

  const adaptFromDrawnLine = useCallback(async (coords: Position[]) => {
    const state = usePlannerStore.getState()
    const { masterPlan, boundary, fullPlanPrompt } = state
    if (!masterPlan || !boundary || coords.length < 2) return false

    startRefinement()
    for (const { step, delay } of STEPS) {
      setGenerationStep(step)
      await new Promise((r) => setTimeout(r, delay))
    }

    const result = adaptMasterPlanAroundArterial(masterPlan, coords, boundary)
    if (!result) {
      usePlannerStore.setState({ isGenerating: false, generationStep: 'complete' })
      return false
    }

    let plan = result.plan

    try {
      const response = await fetch('/api/adapt-road', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          arterial: result.arterial,
          boundary,
          planPrompt: fullPlanPrompt || state.prompt,
          roadName: result.roadName,
        }),
      })
      if (response.ok) {
        const data = await response.json() as { summary?: typeof plan.summary; source?: string }
        if (data.summary) {
          plan = {
            ...plan,
            summary: {
              ...plan.summary,
              ...data.summary,
              constructionPhases: plan.summary.constructionPhases,
            },
          }
        }
      }
    } catch {
      // geometry adaptation already applied
    }

    finishArterialAdaptation(plan, result.roadName)
    usePlannerStore.getState().setMapTool('select')
    return true
  }, [startRefinement, setGenerationStep, finishArterialAdaptation])

  return { adaptFromDrawnLine }
}
