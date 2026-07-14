'use client'

import dynamic from 'next/dynamic'
import { LayerSidebar } from '@/components/Sidebar/LayerSidebar'
import { AiPanel } from '@/components/AI/AiPanel'
import { ExportBar } from '@/components/Planning/ExportBar'
import { GenerationLoader } from '@/components/AI/GenerationLoader'
import { ProviderIndicator } from '@/components/AI/ProviderIndicator'
import Link from 'next/link'
import { Map, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

const PlannerMap = dynamic(() => import('@/components/Map/PlannerMap').then((m) => m.PlannerMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-brand-navy-950 text-slate-500">
      Loading map...
    </div>
  ),
})

export function PlannerWorkspace() {
  return (
    <div className="flex h-screen flex-col bg-brand-navy-950">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-brand-teal-500/10 bg-brand-navy-900/90 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-teal-600 shadow-md shadow-brand-teal-600/20">
              <Map className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold text-white">
              <span className="text-brand-teal-400">Intelli</span>GIS
            </span>
            <span className="rounded-md bg-brand-teal-500/10 px-2 py-0.5 text-xs text-brand-teal-300/80">Planner</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ProviderIndicator variant="compact" className="hidden lg:block max-w-xs" />
          <p className="hidden text-xs text-slate-500 md:block">Proof of Concept · Brisbane, QLD</p>
        </div>
      </header>

      <ExportBar />

      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex-1">
          <PlannerMap />
          <GenerationLoader />
        </main>

        <aside className="w-72 shrink-0 border-l border-brand-teal-500/10 bg-brand-navy-800/60 backdrop-blur-xl">
          <LayerSidebar />
        </aside>

        <aside className="w-96 shrink-0 border-l border-brand-teal-500/10 bg-brand-navy-800/60 backdrop-blur-xl">
          <AiPanel />
        </aside>
      </div>
    </div>
  )
}
