'use client'

import type { MasterPlanSummary as Summary } from '@/types/master-plan'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/utils'
import { Users, Briefcase, Trees, Footprints, Train, Leaf, DollarSign } from 'lucide-react'

interface Props {
  summary: Summary
}

const METRICS = [
  { key: 'populationCapacity', label: 'Population Capacity', icon: Users, format: (v: number) => formatNumber(v) },
  { key: 'estimatedJobs', label: 'Estimated Jobs', icon: Briefcase, format: (v: number) => formatNumber(v) },
  { key: 'greenSpacePercent', label: 'Green Space', icon: Trees, format: (v: number) => `${v}%` },
  { key: 'walkabilityScore', label: 'Walkability Score', icon: Footprints, format: (v: number) => `${v}/100` },
  { key: 'transitAccessibility', label: 'Transit Accessibility', icon: Train, format: (v: number) => `${v}/100` },
] as const

export function MasterPlanSummary({ summary }: Props) {
  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <CardHeader className="pb-2">
        <CardTitle>Master Plan Summary</CardTitle>
        <p className="text-xs text-zinc-400 leading-relaxed">{summary.narrative}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {METRICS.map(({ key, label, icon: Icon, format }) => (
            <div key={key} className="rounded-xl border border-white/5 bg-white/5 p-3">
              <div className="flex items-center gap-1.5 text-zinc-500">
                <Icon className="h-3 w-3" />
                <span className="text-[10px] uppercase tracking-wide">{label}</span>
              </div>
              <p className="mt-1 text-lg font-semibold text-white">
                {format(summary[key as keyof Summary] as number)}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricPill icon={Leaf} label="Carbon Impact" value={summary.carbonImpact} />
          <MetricPill icon={DollarSign} label="Development Cost" value={summary.developmentCost} />
        </div>
      </CardContent>
    </Card>
  )
}

function MetricPill({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-3">
      <div className="flex items-center gap-1.5 text-zinc-500">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}
