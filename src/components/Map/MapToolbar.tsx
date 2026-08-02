'use client'

import { useState } from 'react'
import { usePlannerStore } from '@/store/planner-store'
import type { MapTool } from '@/store/planner-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  MousePointer2,
  Hand,
  Pencil,
  Minus,
  Pentagon,
  MapPin,
  Eraser,
  Undo2,
  Redo2,
  Search,
  Check,
  X,
  Route,
  Box,
} from 'lucide-react'

const TOOLS: { id: MapTool; icon: typeof Pencil; label: string; shortcut?: string; requiresPlan?: boolean }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'pan', icon: Hand, label: 'Pan', shortcut: 'Shift' },
  { id: 'draw-boundary', icon: Pencil, label: 'Boundary' },
  { id: 'draw-arterial', icon: Route, label: 'Arterial', requiresPlan: true },
  { id: 'draw-line', icon: Minus, label: 'Line', requiresPlan: true },
  { id: 'draw-polygon', icon: Pentagon, label: 'Polygon', requiresPlan: true },
  { id: 'draw-point', icon: MapPin, label: 'Point', requiresPlan: true },
  { id: 'erase', icon: Eraser, label: 'Erase' },
]

interface MapToolbarProps {
  onCompleteBoundary?: () => void
  onCancelBoundary?: () => void
  onCompleteArterial?: () => void
  onCancelArterial?: () => void
  onSampleArea?: () => void
  isDrawingBoundary?: boolean
  isDrawingArterial?: boolean
}

export function MapToolbar({
  onCompleteBoundary,
  onCancelBoundary,
  onCompleteArterial,
  onCancelArterial,
  onSampleArea,
  isDrawingBoundary,
  isDrawingArterial,
}: MapToolbarProps) {
  const mapTool = usePlannerStore((s) => s.mapTool)
  const setMapTool = usePlannerStore((s) => s.setMapTool)
  const drawColor = usePlannerStore((s) => s.drawColor)
  const setDrawColor = usePlannerStore((s) => s.setDrawColor)
  const drawOpacity = usePlannerStore((s) => s.drawOpacity)
  const setDrawOpacity = usePlannerStore((s) => s.setDrawOpacity)
  const strokeWidth = usePlannerStore((s) => s.strokeWidth)
  const setStrokeWidth = usePlannerStore((s) => s.setStrokeWidth)
  const undo = usePlannerStore((s) => s.undo)
  const redo = usePlannerStore((s) => s.redo)
  const editHistoryIndex = usePlannerStore((s) => s.editHistoryIndex)
  const editHistory = usePlannerStore((s) => s.editHistory)
  const masterPlan = usePlannerStore((s) => s.masterPlan)
  const massing3d = usePlannerStore((s) => s.massing3d)
  const toggleMassing3d = usePlannerStore((s) => s.toggleMassing3d)

  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)

  const searchPlace = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
      )
      const results = await res.json() as Array<{ lon: string; lat: string; boundingbox: string[] }>
      if (results[0]) {
        const event = new CustomEvent('planner-fly-to', {
          detail: {
            center: [parseFloat(results[0].lon), parseFloat(results[0].lat)] as [number, number],
            bbox: results[0].boundingbox.map(Number) as [number, number, number, number],
          },
        })
        window.dispatchEvent(event)
      }
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-brand-teal-500/15 bg-brand-navy-800/95 p-1.5 shadow-xl shadow-brand-navy-950/50 backdrop-blur-xl">
        {TOOLS.map(({ id, icon: Icon, label, shortcut, requiresPlan }) => (
          <Button
            key={id}
            type="button"
            size="icon"
            variant={mapTool === id ? 'default' : 'ghost'}
            className={cn('h-8 w-8 shrink-0', mapTool === id && 'bg-brand-teal-600 hover:bg-brand-teal-500')}
            title={shortcut ? `${label} (${shortcut})` : label}
            disabled={requiresPlan && !masterPlan}
            onClick={() => setMapTool(id)}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}

        <div className="mx-1 h-6 w-px bg-white/10" />

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn('h-8 w-8 shrink-0', massing3d && 'text-[#00b8a0]')}
          title="Toggle 3D Building Massing"
          onClick={toggleMassing3d}
        >
          <Box className="h-3.5 w-3.5" />
        </Button>

        <div className="mx-1 h-6 w-px bg-white/10" />

        <input
          type="color"
          value={drawColor}
          onChange={(e) => setDrawColor(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded-lg border border-white/10 bg-transparent"
          title="Color"
        />

        <div className="flex items-center gap-1 px-1">
          <span className="text-[10px] text-zinc-500">α</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={drawOpacity}
            onChange={(e) => setDrawOpacity(parseFloat(e.target.value))}
            className="h-1 w-14 accent-brand-teal-500"
          />
        </div>

        <div className="flex items-center gap-1 px-1">
          <span className="text-[10px] text-zinc-500">{strokeWidth}</span>
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
            className="h-1 w-14 accent-brand-teal-500"
          />
        </div>

        <div className="mx-1 h-6 w-px bg-white/10" />

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={!masterPlan || editHistoryIndex <= 0}
          onClick={undo}
          title="Undo"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={editHistoryIndex >= editHistory.length - 1}
          onClick={redo}
          title="Redo"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-1 rounded-xl border border-brand-teal-500/15 bg-brand-navy-800/95 px-2 py-1 backdrop-blur-xl">
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <input
            type="text"
            placeholder="Search place & boundary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchPlace()}
            className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
          />
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={searching} onClick={searchPlace}>
            Go
          </Button>
        </div>

        {mapTool === 'draw-boundary' && (
          <div className="flex items-center gap-1 rounded-xl border border-brand-teal-500/30 bg-brand-navy-800/95 p-1 backdrop-blur-xl">
            {isDrawingBoundary ? (
              <>
                <Button type="button" size="sm" className="h-7" onClick={onCompleteBoundary}>
                  <Check className="h-3 w-3" />
                  Done
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7" onClick={onCancelBoundary}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={onSampleArea}>
                Sample Area
              </Button>
            )}
          </div>
        )}
        {mapTool === 'draw-arterial' && (
          <div className="flex items-center gap-1 rounded-xl border border-stone-500/30 bg-brand-navy-800/95 p-1 backdrop-blur-xl">
            {isDrawingArterial ? (
              <>
                <Button type="button" size="sm" className="h-7" onClick={onCompleteArterial}>
                  <Check className="h-3 w-3" />
                  Adapt Plan
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7" onClick={onCancelArterial}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <span className="px-2 text-[10px] text-zinc-500">Trace arterial on map</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
