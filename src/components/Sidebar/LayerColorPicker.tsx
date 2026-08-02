'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pipette, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_LAYERS, type LayerId } from '@/types/master-plan'

const PRESET_SWATCHES = [
  '#3b82f6',
  '#00b8a0',
  '#0ea5e9',
  '#22c55e',
  '#10b981',
  '#facc15',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a78bfa',
  '#8b5cf6',
  '#6b7280',
  '#9ca3af',
  '#ffffff',
  '#1e293b',
] as const

const POPUP_WIDTH = 224
const POPUP_EST_HEIGHT = 280

function defaultColorFor(layerId: LayerId): string {
  return DEFAULT_LAYERS.find((l) => l.id === layerId)?.color ?? '#00b8a0'
}

function normalizeHex(value: string): string | null {
  const raw = value.trim()
  const withHash = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return null
}

interface LayerColorPickerProps {
  layerId: LayerId
  label: string
  color: string
  onChange: (color: string) => void
  className?: string
}

export function LayerColorPicker({
  layerId,
  label,
  color,
  onChange,
  className,
}: LayerColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [hexDraft, setHexDraft] = useState(color)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const nativeId = useId()

  useEffect(() => {
    if (open) setHexDraft(color)
  }, [color, open])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return
    const update = () => {
      const rect = rootRef.current!.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < POPUP_EST_HEIGHT && rect.top > POPUP_EST_HEIGHT
      const top = openUp ? rect.top - POPUP_EST_HEIGHT - 8 : rect.bottom + 8
      const left = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - POPUP_WIDTH - 8,
      )
      setCoords({ top, left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const applyColor = (next: string) => {
    const normalized = normalizeHex(next)
    if (!normalized) return
    onChange(normalized)
    setHexDraft(normalized)
  }

  const defaultColor = defaultColorFor(layerId)

  return (
    <div ref={rootRef} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        aria-label={`Change ${label} color`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`${label} color — click to edit`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={cn(
          'group/swatch relative h-5 w-5 rounded-md border border-white/25 shadow-sm transition-transform',
          'hover:scale-110 hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal-500/60',
        )}
        style={{ backgroundColor: color }}
      >
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-black/0 opacity-0 transition-opacity group-hover/swatch:bg-black/25 group-hover/swatch:opacity-100">
          <Pipette className="h-2.5 w-2.5 text-white drop-shadow" />
        </span>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label={`${label} color picker`}
            className="fixed z-[80] w-56 rounded-xl border border-brand-teal-500/25 bg-brand-navy-800/98 p-3 shadow-2xl shadow-brand-navy-950/80 backdrop-blur-xl"
            style={{ top: coords.top, left: coords.left, width: POPUP_WIDTH }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-white">{label}</p>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Layer color</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                aria-label="Close color picker"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <label
                htmlFor={nativeId}
                className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-white/20 shadow-inner"
                style={{ backgroundColor: color }}
                title="Open system color picker"
              >
                <input
                  id={nativeId}
                  type="color"
                  value={normalizeHex(color) ?? '#00b8a0'}
                  onChange={(e) => applyColor(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Hex</label>
                <input
                  type="text"
                  value={hexDraft}
                  spellCheck={false}
                  onChange={(e) => setHexDraft(e.target.value)}
                  onBlur={() => {
                    const normalized = normalizeHex(hexDraft)
                    if (normalized) applyColor(normalized)
                    else setHexDraft(color)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const normalized = normalizeHex(hexDraft)
                      if (normalized) {
                        applyColor(normalized)
                        setOpen(false)
                      }
                    }
                  }}
                  className="w-full rounded-lg border border-white/10 bg-brand-navy-900 px-2 py-1.5 font-mono text-xs text-zinc-100 outline-none focus:border-brand-teal-500/50"
                />
              </div>
            </div>

            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">Presets</p>
            <div className="mb-3 grid grid-cols-5 gap-1.5">
              {PRESET_SWATCHES.map((swatch) => {
                const selected = color.toLowerCase() === swatch.toLowerCase()
                return (
                  <button
                    key={swatch}
                    type="button"
                    title={swatch}
                    onClick={() => applyColor(swatch)}
                    className={cn(
                      'h-6 w-full rounded-md border transition-transform hover:scale-105',
                      selected ? 'border-white ring-2 ring-brand-teal-500/70' : 'border-white/15',
                    )}
                    style={{ backgroundColor: swatch }}
                  />
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => applyColor(defaultColor)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to default
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
