# intelliGIS MVP

AI-powered Geographic Information System — upload, visualise, analyse, and chat with geospatial data.

## Features

- **Landing page** — Modern marketing site with hero, features, and pricing
- **Authentication** — Sign up, login, logout via Supabase Auth
- **Dashboard** — Project management with recent projects and statistics
- **Map viewer** — Interactive MapLibre map with pan, zoom, basemap switching, measurement, and location search
- **Data upload** — GeoJSON, CSV, KML, GPX, and ZIP Shapefiles
- **Layer manager** — Visibility, rename, delete, opacity, and colour controls
- **AI GIS assistant** — ChatGPT-like interface powered by OpenAI Responses API
- **Dataset summary** — Feature count, geometry types, bounds, attributes, CRS detection
- **Charts** — Bar, pie, line, and histogram via Recharts
- **User settings** — Theme, profile, and account management

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, TypeScript, TailwindCSS, shadcn/ui |
| Routing | React Router |
| Data fetching | TanStack Query |
| Maps | MapLibre GL JS, OpenStreetMap basemaps |
| Backend | Netlify Functions (Node.js) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| AI | OpenAI Responses API |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| Deployment | Netlify |

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- Supabase account
- OpenAI API key (for AI chat)
- Netlify account (for deployment)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd intelliGIS-MVP
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Set up Supabase

1. Create a new Supabase project
2. Run the migration in `supabase/migrations/001_initial_schema.sql` via the SQL Editor
3. Enable Email auth in Authentication → Providers
4. Copy your project URL and anon key to `.env`

### 4. Run locally

**Frontend only:**

```bash
npm run dev
```

**With Netlify Functions (recommended for AI chat):**

```bash
npm run dev:netlify
```

Open [http://localhost:8888](http://localhost:8888)

### 5. Test with sample data

Sample datasets are in `public/samples/`:

- `sydney-suburbs.geojson` — Point features with population data
- `sydney-points.csv` — CSV with lat/lng columns

## Project Structure

```
├── netlify/
│   └── functions/          # Serverless API (AI chat)
├── public/
│   └── samples/            # Sample geospatial datasets
├── src/
│   ├── api/                # API client functions
│   ├── components/
│   │   ├── ui/             # shadcn/ui components
│   │   ├── map/            # Map viewer, upload, summary
│   │   ├── chat/           # AI assistant
│   │   ├── layers/         # Layer manager
│   │   ├── charts/         # Chart components
│   │   ├── layout/         # App shell, protected routes
│   │   └── common/         # Loading, empty, error states
│   ├── hooks/              # Auth, theme hooks
│   ├── pages/              # Route pages
│   ├── services/           # Supabase, upload, projects
│   ├── styles/             # Global CSS
│   ├── types/              # TypeScript types
│   └── utils/              # Geo parsing, map utils
├── supabase/
│   └── migrations/         # Database schema
├── .github/workflows/      # CI/CD
├── netlify.toml            # Netlify configuration
└── .env.example            # Environment template
```

## Deploy to Netlify

### Option A: Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

### Option B: Git integration

1. Push to GitHub
2. Connect repo in Netlify dashboard
3. Build settings are auto-detected from `netlify.toml`

### Environment variables (Netlify dashboard)

Set these in **Site settings → Environment variables**:

| Variable | Scope | Description |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | Build + Runtime | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Build + Runtime | Supabase anon key |
| `OPENAI_API_KEY` | Functions only | OpenAI API key |
| `OPENAI_MODEL` | Functions only | Model name (default: gpt-4.1-mini) |

> **Note:** `VITE_*` variables must be set at build time. Redeploy after adding them.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run dev:netlify` | Start with Netlify Functions |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## Security

- Row Level Security (RLS) on all Supabase tables
- OpenAI API key stored server-side only
- Security headers configured in `netlify.toml`
- User data isolated by `auth.uid()` policies

## License

MIT
