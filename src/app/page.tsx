import Link from 'next/link'
import {
  Map,
  Sparkles,
  Layers,
  Building2,
  Train,
  Trees,
  ArrowRight,
  Zap,
  BarChart3,
  PenTool,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const features = [
  {
    icon: Sparkles,
    title: 'Natural Language Planning',
    description: 'Ask questions in plain English. AI translates intent into spatial master plans.',
  },
  {
    icon: Map,
    title: 'Interactive Map Canvas',
    description: 'Draw planning boundaries on a live map centred on Brisbane with OpenStreetMap basemaps.',
  },
  {
    icon: Layers,
    title: 'Instant Layer Generation',
    description: 'Roads, parks, residential, commercial, transit, and bike networks appear as animated overlays.',
  },
  {
    icon: BarChart3,
    title: 'AI Master Plan Summary',
    description: 'Population capacity, jobs, walkability, green space, carbon impact, and development cost.',
  },
  {
    icon: Train,
    title: 'Transit-Oriented Design',
    description: 'Preset prompts for TOD, green cities, cycling districts, and waterfront redevelopment.',
  },
  {
    icon: PenTool,
    title: 'Export & Present',
    description: 'Export PNG, JSON, and print-ready views for investor and government presentations.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-brand-navy-950 text-white">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-brand-teal-500/10 bg-brand-navy-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2 font-semibold">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-teal-600 shadow-lg shadow-brand-teal-600/20">
              <Map className="h-4 w-4" />
            </div>
            <span className="text-brand-teal-400">Intelli</span>
            <span className="text-white">GIS</span>
          </div>
          <Button asChild>
            <Link href="/planner">
              Launch App
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden pt-32 pb-24">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,184,160,0.12),_transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(15,31,58,0.8),_transparent_50%)]" />
          <div className="relative mx-auto max-w-6xl px-6 text-center">
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-teal-500/25 bg-brand-teal-500/10 px-4 py-1.5 text-sm text-brand-teal-300">
                <Zap className="h-3.5 w-3.5" />
                The AI Operating System for Spatial Intelligence
              </div>
              <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
                Ask questions.{' '}
                <span className="bg-gradient-to-r from-brand-teal-400 to-cyan-400 bg-clip-text text-transparent">
                  Get maps.
                </span>{' '}
                Make decisions.
              </h1>
              <p className="text-lg text-slate-400 sm:text-xl">
                Transforming complex geospatial data into actionable insights through conversational AI.
                Simplifying geospatial analytics for urban planners and governments.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <Button size="lg" asChild>
                  <Link href="/planner">
                    Launch App
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/planner">View Demo</Link>
                </Button>
              </div>
            </div>

            <div className="mt-16 overflow-hidden rounded-2xl border border-brand-teal-500/15 bg-brand-navy-800/40 shadow-2xl shadow-brand-teal-900/10 backdrop-blur">
              <div className="flex h-8 items-center gap-2 border-b border-brand-teal-500/10 bg-brand-navy-800/80 px-4">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-brand-teal-500/80" />
              </div>
              <div className="grid aspect-[16/9] grid-cols-12 gap-0">
                <div className="col-span-2 border-r border-brand-teal-500/10 bg-brand-navy-800/50 p-4">
                  <div className="space-y-2">
                    {['Residential', 'Commercial', 'Parks', 'Transit'].map((l) => (
                      <div key={l} className="h-6 rounded-lg bg-brand-teal-500/5" />
                    ))}
                  </div>
                </div>
                <div className="col-span-7 bg-gradient-to-br from-brand-navy-700 to-brand-navy-900 p-8">
                  <div className="flex h-full items-center justify-center">
                    <div className="relative h-48 w-64">
                      <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-brand-teal-500/40" />
                      <div className="absolute left-4 top-6 h-12 w-16 rounded-lg bg-yellow-400/30" />
                      <div className="absolute right-6 top-10 h-10 w-14 rounded-lg bg-brand-teal-500/25" />
                      <div className="absolute bottom-8 left-8 h-14 w-20 rounded-lg bg-green-500/30" />
                      <div className="absolute bottom-12 right-10 h-1 w-24 rotate-12 bg-brand-teal-400/60" />
                    </div>
                  </div>
                </div>
                <div className="col-span-3 border-l border-brand-teal-500/10 bg-brand-navy-800/50 p-4">
                  <div className="space-y-3">
                    <div className="h-16 rounded-xl bg-brand-teal-500/5" />
                    <div className="h-8 rounded-lg bg-brand-teal-600/30" />
                    <div className="space-y-1.5">
                      <div className="h-4 rounded bg-brand-teal-500/5" />
                      <div className="h-4 rounded bg-brand-teal-500/5" />
                      <div className="h-4 w-2/3 rounded bg-brand-teal-500/5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-brand-teal-500/10 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold">Built for urban planners</h2>
              <p className="mt-3 text-slate-400">Investor-ready proof of concept with convincing AI workflows.</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <Card key={f.title} className="transition hover:border-brand-teal-500/25 hover:bg-brand-teal-500/5">
                  <CardHeader>
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-teal-600/20">
                      <f.icon className="h-5 w-5 text-brand-teal-400" />
                    </div>
                    <CardTitle>{f.title}</CardTitle>
                    <CardDescription>{f.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-brand-teal-500/10 py-24">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <div className="flex items-center justify-center gap-8 text-slate-600">
              <Building2 className="h-8 w-8" />
              <Trees className="h-8 w-8" />
              <Train className="h-8 w-8" />
            </div>
            <h2 className="mt-8 text-3xl font-bold">Ready to impress investors?</h2>
            <p className="mt-3 text-slate-400">Launch the demo and generate your first master plan in under a minute.</p>
            <Button size="lg" className="mt-8" asChild>
              <Link href="/planner">
                Launch App
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-brand-teal-500/10 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} IntelliGIS · Proof of Concept
      </footer>
    </div>
  )
}
