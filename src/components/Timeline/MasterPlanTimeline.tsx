'use client'

import type { TimelinePhase } from '@/types/master-plan'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  phases: TimelinePhase[]
}

export function MasterPlanTimeline({ phases }: Props) {
  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 duration-700">
      <CardHeader className="pb-2">
        <CardTitle>Master Plan Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-0">
          {phases.map((phase, i) => (
            <div key={phase.id} className="relative flex gap-4 pb-6 last:pb-0">
              {i < phases.length - 1 && (
                <div className="absolute left-[15px] top-8 h-full w-px bg-gradient-to-b from-brand-teal-500/50 to-transparent" />
              )}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-teal-500/30 bg-brand-teal-600/20 text-xs font-bold text-brand-teal-300">
                {phase.phase}
              </div>
              <div className="flex-1 pt-0.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">{phase.title}</h4>
                  <span className="text-xs text-zinc-500">{phase.duration}</span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-400">{phase.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
