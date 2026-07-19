'use client'

import { usePlannerStore } from '@/store/planner-store'
import { LAYER_ID_TO_SOURCE } from '@/utils/layer-map'
import {
  Eye,
  EyeOff,
  Layers,
  Lock,
  Unlock,
  Trash2,
  Building2,
  Route,
  Waves,
} from 'lucide-react'
import type { LayerId } from '@/types/master-plan'
import { cn } from '@/lib/utils'
import { IMPRESSION } from '@/lib/impression-styles'

function featureCount(layerId: LayerId, masterPlan: ReturnType<typeof usePlannerStore.getState>['masterPlan']): number {
  if (!masterPlan) return 0
  const key = LAYER_ID_TO_SOURCE[layerId]
  if (!key) return layerId === 'master-plan' ? 1 : 0
  const data = masterPlan.layers[key as keyof typeof masterPlan.layers]
  if (!data) return 0
  if (Array.isArray(data)) return data.length
  return (data as { features: unknown[] }).features?.length ?? 0
}

export function LayerSidebar() {
  const layers = usePlannerStore((s) => s.layers)
  const toggleLayer = usePlannerStore((s) => s.toggleLayer)
  const setLayerColor = usePlannerStore((s) => s.setLayerColor)
  const toggleLayerLock = usePlannerStore((s) => s.toggleLayerLock)
  const clearLayer = usePlannerStore((s) => s.clearLayer)
  const activeLayerId = usePlannerStore((s) => s.activeLayerId)
  const setActiveLayer = usePlannerStore((s) => s.setActiveLayer)
  const masterPlan = usePlannerStore((s) => s.masterPlan)
  const layerLocks = usePlannerStore((s) => s.layerLocks)
  const showOsmStreets = usePlannerStore((s) => s.showOsmStreets)
  const showOsmBuildings = usePlannerStore((s) => s.showOsmBuildings)
  const showHardConstraints = usePlannerStore((s) => s.showHardConstraints)
  const toggleOsmStreets = usePlannerStore((s) => s.toggleOsmStreets)
  const toggleOsmBuildings = usePlannerStore((s) => s.toggleOsmBuildings)
  const toggleHardConstraints = usePlannerStore((s) => s.toggleHardConstraints)
  const siteContext = usePlannerStore((s) => s.siteContext)
  const isLoadingOsm = usePlannerStore((s) => s.isLoadingOsm)

  const editableLayers = layers.filter((l) => l.id !== 'master-plan')

  const hardCount =
    (siteContext?.waterways?.features.length ?? 0) +
    (siteContext?.railways?.features.length ?? 0) +
    (siteContext?.hardCorridors?.features.length ?? 0)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-brand-teal-500/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand-teal-400" />
            <h2 className="text-sm font-semibold text-white">Layers</h2>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">Overlay</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {masterPlan ? 'Click layer to draw · toggle visibility' : 'Generate a plan to edit layers'}
        </p>
      </div>

      <div className="border-b border-white/10 px-3 py-2">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">Existing context</p>
        <div className="space-y-1">
          <ContextToggle
            icon={Route}
            label="OSM Streets"
            count={siteContext?.streets.length}
            visible={showOsmStreets}
            loading={isLoadingOsm}
            onToggle={toggleOsmStreets}
          />
          <ContextToggle
            icon={Building2}
            label="Buildings"
            count={siteContext?.buildings.features.length}
            visible={showOsmBuildings}
            loading={isLoadingOsm}
            onToggle={toggleOsmBuildings}
          />
          <ContextToggle
            icon={Waves}
            label="Hard constraints"
            count={hardCount || undefined}
            visible={showHardConstraints}
            loading={isLoadingOsm}
            onToggle={toggleHardConstraints}
            swatches={[IMPRESSION.water, IMPRESSION.railway, IMPRESSION.hardHighway, IMPRESSION.arterial]}
          />
        </div>
        {showHardConstraints && siteContext && (
          <p className="mt-1.5 px-2 text-[10px] leading-relaxed text-zinc-600">
            <span style={{ color: IMPRESSION.water }}>Rivers</span>
            {' · '}
            <span style={{ color: IMPRESSION.railway }}>Rail</span>
            {' · '}
            <span style={{ color: IMPRESSION.hardHighway }}>Highway</span>
            {' · '}
            <span style={{ color: IMPRESSION.arterial }}>Arterial</span>
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {editableLayers.map((layer) => {
          const count = featureCount(layer.id, masterPlan)
          const locked = layerLocks[layer.id]
          const isActive = activeLayerId === layer.id

          return (
            <div
              key={layer.id}
              className={cn(
                'group flex items-center gap-2 rounded-xl px-2 py-2 transition-all',
                isActive ? 'bg-brand-teal-600/20 ring-1 ring-brand-teal-500/40' : 'hover:bg-brand-teal-500/5',
                !masterPlan && 'opacity-40',
              )}
            >
              <button
                type="button"
                onClick={() => toggleLayer(layer.id)}
                className="shrink-0 text-zinc-500 hover:text-zinc-300"
                title={layer.visible ? 'Hide' : 'Show'}
              >
                {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 opacity-50" />}
              </button>

              <label className="relative shrink-0 cursor-pointer" title="Layer color">
                <span
                  className="block h-4 w-4 rounded border border-white/20"
                  style={{ backgroundColor: layer.color }}
                />
                <input
                  type="color"
                  value={layer.color}
                  onChange={(e) => setLayerColor(layer.id, e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>

              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => masterPlan && setActiveLayer(layer.id)}
                disabled={!masterPlan}
              >
                <span className="block truncate text-sm text-zinc-200">{layer.label}</span>
                <span className="text-[10px] text-zinc-600">{count} feature{count !== 1 ? 's' : ''}</span>
              </button>

              <button
                type="button"
                onClick={() => toggleLayerLock(layer.id)}
                className="shrink-0 text-zinc-600 hover:text-zinc-400"
                title={locked ? 'Unlock' : 'Lock'}
              >
                {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3 opacity-0 group-hover:opacity-100" />}
              </button>

              <button
                type="button"
                onClick={() => clearLayer(layer.id)}
                disabled={!masterPlan || locked || count === 0}
                className="shrink-0 text-zinc-600 hover:text-red-400 disabled:opacity-30"
                title="Clear layer"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="border-t border-white/10 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Layers & Data</p>
        <p className="mt-1 text-xs text-zinc-500">
          Active: <span className="text-brand-teal-400">{layers.find((l) => l.id === activeLayerId)?.label ?? '—'}</span>
        </p>
      </div>
    </div>
  )
}

function ContextToggle({
  icon: Icon,
  label,
  count,
  visible,
  loading,
  onToggle,
  swatches,
}: {
  icon: typeof Route
  label: string
  count?: number
  visible: boolean
  loading: boolean
  onToggle: () => void
  swatches?: string[]
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
        visible ? 'bg-white/5 text-zinc-300' : 'text-zinc-600 opacity-60',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {swatches && visible && (
        <span className="flex gap-0.5">
          {swatches.map((c) => (
            <span key={c} className="h-2 w-2 rounded-sm" style={{ backgroundColor: c }} />
          ))}
        </span>
      )}
      {loading ? (
        <span className="text-zinc-600">…</span>
      ) : (
        <span className="text-zinc-600">{count ?? 0}</span>
      )}
      {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
    </button>
  )
}
