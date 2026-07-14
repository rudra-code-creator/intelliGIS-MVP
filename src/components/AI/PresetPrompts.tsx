'use client'

import { PRESET_PROMPTS } from '@/types/presets'
import { usePlannerStore } from '@/store/planner-store'
import { cn } from '@/lib/utils'

export function PresetPrompts() {
  const setPrompt = usePlannerStore((s) => s.setPrompt)

  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_PROMPTS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => setPrompt(preset.prompt)}
          className={cn(
            'rounded-xl border border-brand-teal-500/10 bg-white/5 px-3 py-2 text-left text-xs text-zinc-300 transition-all hover:border-brand-teal-500/40 hover:bg-brand-teal-500/10 hover:text-white',
          )}
        >
          <span className="mr-1.5">{preset.emoji}</span>
          {preset.label}
        </button>
      ))}
    </div>
  )
}
