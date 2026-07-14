'use client'

import { usePlannerStore } from '@/store/planner-store'
import { useGeneratePlan } from '@/hooks/useGeneratePlan'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PresetPrompts } from '@/components/AI/PresetPrompts'
import { MasterPlanSummary } from '@/components/Summary/MasterPlanSummary'
import { MasterPlanTimeline } from '@/components/Timeline/MasterPlanTimeline'
import { ProviderIndicator } from '@/components/AI/ProviderIndicator'
import { Sparkles, History, AlertCircle, MessageSquarePlus } from 'lucide-react'

function formatTime(ts: number) {
  return new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit' }).format(ts)
}

export function AiPanel() {
  const prompt = usePlannerStore((s) => s.prompt)
  const setPrompt = usePlannerStore((s) => s.setPrompt)
  const boundary = usePlannerStore((s) => s.boundary)
  const history = usePlannerStore((s) => s.history)
  const fullPlanPrompt = usePlannerStore((s) => s.fullPlanPrompt)
  const isGenerating = usePlannerStore((s) => s.isGenerating)
  const masterPlan = usePlannerStore((s) => s.masterPlan)
  const { generate, refine } = useGeneratePlan()

  const hasPlan = Boolean(masterPlan)
  const canSubmit = Boolean(boundary && prompt.trim() && !isGenerating)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-brand-teal-500/10 p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-teal-600/20">
            <Sparkles className="h-4 w-4 text-brand-teal-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">AI Planner</h2>
            <p className="text-xs text-zinc-500">
              {hasPlan ? 'Refine your master plan' : 'Describe your vision'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ProviderIndicator variant="detailed" />

        <div className="space-y-3">
          {hasPlan && fullPlanPrompt && (
            <div className="rounded-xl border border-brand-teal-500/15 bg-brand-teal-500/5 px-3 py-2 text-xs text-zinc-400">
              <p className="mb-1 font-medium uppercase tracking-wider text-zinc-500">Active plan</p>
              <p className="line-clamp-3 text-zinc-300">{fullPlanPrompt}</p>
            </div>
          )}

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              hasPlan
                ? 'Add more parks and make the transit lines longer...'
                : 'Design a transit-oriented development with medium-density housing, bike lanes, parks...'
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
                e.preventDefault()
                void (hasPlan ? refine() : generate())
              }
            }}
          />

          {!boundary && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Draw a planning boundary on the map first
            </div>
          )}

          {hasPlan ? (
            <Button
              className="w-full"
              size="lg"
              disabled={!canSubmit}
              onClick={() => void refine()}
            >
              <MessageSquarePlus className="h-4 w-4" />
              Refine Master Plan
            </Button>
          ) : (
            <Button
              className="w-full"
              size="lg"
              disabled={!canSubmit}
              onClick={() => void generate()}
            >
              <Sparkles className="h-4 w-4" />
              Generate Master Plan
            </Button>
          )}

          {hasPlan && (
            <p className="text-center text-[11px] text-zinc-500">
              Ctrl+Enter to apply follow-up changes
            </p>
          )}
        </div>

        {!hasPlan && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Example prompts</p>
            <PresetPrompts />
          </div>
        )}

        {masterPlan && (
          <>
            <MasterPlanSummary summary={masterPlan.summary} />
            <MasterPlanTimeline phases={masterPlan.timeline} />
          </>
        )}

        {history.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-zinc-400" />
                History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {history.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPrompt(item.prompt)}
                  className="w-full rounded-lg border border-brand-teal-500/10 bg-brand-teal-500/5 px-3 py-2 text-left text-xs text-zinc-400 transition hover:border-brand-teal-500/25 hover:text-zinc-200"
                >
                  <span className="text-zinc-600">{formatTime(item.timestamp)} · </span>
                  {item.prompt.slice(0, 80)}{item.prompt.length > 80 ? '...' : ''}
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
