'use client'

import { usePlannerStore } from '@/store/planner-store'
import { Loader2, Sparkles } from 'lucide-react'

const MESSAGES = {
  analysing: 'AI is analysing the planning area...',
  'land-use': 'Generating land use...',
  transport: 'Optimising transport...',
  finalising: 'Creating final master plan...',
}

export function GenerationLoader() {
  const step = usePlannerStore((s) => s.generationStep)
  const isGenerating = usePlannerStore((s) => s.isGenerating)

  if (!isGenerating || step === 'complete' || step === 'idle') return null

  const message = MESSAGES[step as keyof typeof MESSAGES] ?? 'Processing...'

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-brand-navy-950/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-brand-teal-500/15 bg-brand-navy-800/95 px-10 py-8 shadow-2xl shadow-brand-teal-900/10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-teal-600/20">
          <Sparkles className="h-7 w-7 animate-pulse text-brand-teal-400" />
        </div>
        <div className="flex items-center gap-2 text-white">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p className="text-sm font-medium">{message}</p>
        </div>
        <div className="flex gap-1.5">
          {(['analysing', 'land-use', 'transport', 'finalising'] as const).map((s) => (
            <div
              key={s}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                step === s ? 'bg-brand-teal-500' : ['analysing', 'land-use', 'transport', 'finalising'].indexOf(step) > ['analysing', 'land-use', 'transport', 'finalising'].indexOf(s) ? 'bg-brand-teal-500/50' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
