import { Link } from 'react-router-dom'
import {
  Map,
  Sparkles,
  Layers,
  BarChart3,
  Upload,
  ArrowRight,
  Globe,
  Zap,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const features = [
  {
    icon: Map,
    title: 'Interactive Maps',
    description: 'Visualise geospatial data with pan, zoom, basemap switching, and measurement tools.',
  },
  {
    icon: Sparkles,
    title: 'AI GIS Assistant',
    description: 'Chat with your data in natural language. Get insights, summaries, and analysis instantly.',
  },
  {
    icon: Upload,
    title: 'Multi-format Upload',
    description: 'Import GeoJSON, CSV, KML, GPX, and Shapefiles. See your data on the map immediately.',
  },
  {
    icon: Layers,
    title: 'Layer Management',
    description: 'Toggle visibility, adjust opacity, rename layers, and customise colours with ease.',
  },
  {
    icon: BarChart3,
    title: 'Data Visualisation',
    description: 'Generate bar, pie, line, and histogram charts from your attribute data.',
  },
  {
    icon: Globe,
    title: 'Project Workspace',
    description: 'Save projects, manage datasets, and return to your work anytime.',
  },
]

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Map className="h-4 w-4" />
            </div>
            intelliGIS
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">Features</a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden pt-32 pb-20">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
          <div className="mx-auto max-w-6xl px-6 text-center">
            <div className="animate-slide-up mx-auto max-w-3xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm">
                <Zap className="h-3.5 w-3.5 text-primary" />
                AI-native GIS platform
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
                The <span className="gradient-text">Cursor for GIS</span>
              </h1>
              <p className="text-lg text-muted-foreground sm:text-xl">
                Upload geospatial data, visualise it on interactive maps, and chat with an AI assistant
                that understands your datasets. Built for analysts, researchers, and teams.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Button size="lg" asChild>
                  <Link to="/signup">
                    Start for free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/login">View demo</Link>
                </Button>
              </div>
            </div>

            <div className="animate-fade-in mt-16 overflow-hidden rounded-2xl border bg-card/50 shadow-2xl backdrop-blur">
              <div className="flex h-8 items-center gap-2 border-b bg-muted/50 px-4">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <div className="aspect-[16/9] bg-gradient-to-br from-primary/5 via-muted to-primary/10 p-8">
                <div className="grid h-full grid-cols-3 gap-4">
                  <div className="col-span-2 rounded-xl border bg-background/60 p-4">
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Map className="mr-2 h-8 w-8" />
                      Interactive Map Viewer
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background/60 p-4">
                    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                      <Sparkles className="mb-2 h-6 w-6" />
                      AI Chat
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold">Everything you need for geospatial analysis</h2>
              <p className="mt-3 text-muted-foreground">Powerful tools in a beautiful, modern interface.</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card key={feature.title} className="glass border-border/50 transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <feature.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="aspect-video rounded-2xl border bg-muted/30 p-8">
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Map + Layers Screenshot Placeholder
                </div>
              </div>
              <div className="aspect-video rounded-2xl border bg-muted/30 p-8">
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  AI Chat Screenshot Placeholder
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="py-20">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <h2 className="text-3xl font-bold">Simple, transparent pricing</h2>
            <p className="mt-3 text-muted-foreground">Start free. Scale when you&apos;re ready.</p>
            <Card className="mx-auto mt-10 max-w-md glass">
              <CardHeader>
                <CardTitle className="text-2xl">Pro</CardTitle>
                <CardDescription>Coming Soon</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">—</p>
                <p className="mt-4 text-sm text-muted-foreground">
                  Enterprise features, team collaboration, and advanced AI analysis are on the roadmap.
                </p>
                <Button className="mt-6 w-full" disabled>
                  Join waitlist
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <Map className="h-5 w-5 text-primary" />
            <span className="font-semibold">intelliGIS</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} intelliGIS. Built with{' '}
            <Shield className="inline h-3.5 w-3.5" /> security in mind.
          </p>
        </div>
      </footer>
    </div>
  )
}
