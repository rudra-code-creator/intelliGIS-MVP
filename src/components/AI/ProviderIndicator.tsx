'use client'

import { usePlannerStore } from '@/store/planner-store'
import { useProviderStatus } from '@/hooks/useProviderStatus'
import type { GenerationMeta, ProviderId } from '@/types/provider'
import { GEOMETRY_SOURCE_LABELS } from '@/types/provider'
import { cn } from '@/lib/utils'
import { Bot, Cpu, Database, AlertTriangle } from 'lucide-react'

const PROVIDER_STYLES: Record<ProviderId, { dot: string; border: string; bg: string }> = {
  'nvidia-nim': { dot: 'bg-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
  openai: { dot: 'bg-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-500/10' },
  mock: { dot: 'bg-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
}

function ProviderIcon({ id }: { id: ProviderId }) {
  if (id === 'nvidia-nim') return <Cpu className="h-3.5 w-3.5" />
  if (id === 'openai') return <Bot className="h-3.5 w-3.5" />
  return <Database className="h-3.5 w-3.5" />
}

function buildStatusLabel(meta: GenerationMeta | null, configuredId: ProviderId, model?: string) {
  const id = meta?.providerId ?? configuredId
  const label = meta?.providerLabel ?? configuredId
  const modelLabel = meta?.model ?? model
  return modelLabel ? `${label} · ${modelLabel}` : label
}

interface ProviderIndicatorProps {
  variant?: 'compact' | 'detailed'
  className?: string
}

export function ProviderIndicator({ variant = 'compact', className }: ProviderIndicatorProps) {
  const { configuredProvider } = useProviderStatus()
  const lastMeta = usePlannerStore((s) => s.lastGenerationMeta)

  if (!configuredProvider) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-500', className)}>
        Checking AI provider...
      </div>
    )
  }

  const activeId = lastMeta?.providerId ?? configuredProvider.providerId
  const styles = PROVIDER_STYLES[activeId]
  const summaryIsAi = lastMeta?.summarySource === 'ai'
  const geometryIsAi = lastMeta?.geometrySource === 'ai' || lastMeta?.geometrySource === 'osm-blocks'
  const geometryIsHybrid = lastMeta?.geometrySource === 'hybrid'
  const hasFallback = Boolean(lastMeta?.fallbackReason)
  const missingKey = configuredProvider.providerId !== 'mock' && !configuredProvider.hasApiKey

  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('flex items-center gap-2 rounded-xl border px-3 py-2', styles.border, styles.bg)}>
        <span className={cn('h-2 w-2 shrink-0 rounded-full animate-pulse', styles.dot)} />
        <ProviderIcon id={activeId} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">
            {buildStatusLabel(lastMeta, configuredProvider.providerId, configuredProvider.model)}
          </p>
          {variant === 'compact' && (
            <p className="text-[10px] text-zinc-400">
              {lastMeta
                ? `Map: ${GEOMETRY_SOURCE_LABELS[lastMeta.geometrySource]}`
                : configuredProvider.geometryCapable
                  ? 'Ready — AI will design geometry'
                  : 'No API key — mock only'}
            </p>
          )}
        </div>
      </div>

      {variant === 'detailed' && (
        <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-zinc-400">
          <StatusRow
            label="Configured provider"
            value={configuredProvider.hasApiKey ? configuredProvider.providerLabel : `${configuredProvider.providerLabel} (no key)`}
            warn={missingKey}
          />
          {configuredProvider.model && <StatusRow label="Model" value={configuredProvider.model} />}
          <StatusRow
            label="Summary & narrative"
            value={lastMeta ? (summaryIsAi ? 'AI-generated' : 'Mock / fallback') : 'Not generated yet'}
            ok={summaryIsAi}
            warn={Boolean(lastMeta) && !summaryIsAi}
          />
          <StatusRow
            label="Map geometry"
            value={
              lastMeta
                ? GEOMETRY_SOURCE_LABELS[lastMeta.geometrySource]
                : configuredProvider.geometryCapable
                  ? 'Will be AI-designed'
                  : 'Procedural fallback'
            }
            ok={geometryIsAi}
            warn={geometryIsHybrid}
          />
          {hasFallback && lastMeta?.fallbackReason && (
            <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{lastMeta.fallbackReason}</span>
            </div>
          )}
          {!lastMeta && configuredProvider.geometryCapable && (
            <p className="pt-1 text-zinc-500">
              Geometry follows OpenStreetMap street blocks with hard constraints (rivers, rail, highways). The LLM writes the planning narrative. Generate to see results.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function StatusRow({
  label,
  value,
  ok,
  warn,
}: {
  label: string
  value: string
  ok?: boolean
  warn?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span
        className={cn(
          'font-medium text-right',
          ok && 'text-emerald-400',
          warn && !ok && 'text-amber-300',
          !ok && !warn && 'text-zinc-300',
        )}
      >
        {value}
      </span>
    </div>
  )
}
