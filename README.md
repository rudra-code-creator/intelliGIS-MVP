# intelliGIS — Proof of Concept

AI-powered urban planning platform for demonstrating the vision of natural-language master plan generation.

**Figma + ChatGPT + Google Maps + GIS** for urban planners.

[![Netlify Status](https://api.netlify.com/api/v1/badges/6d3c84fd-7cdf-4a09-b614-07521d6ddeea/deploy-status)](https://app.netlify.com/projects/intelligis-mvp/deploys)

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Launch App**

## Demo Flow

1. Open the **Planner Workspace**
2. Click **Draw Boundary** (or **Sample Area** for a quick demo)
3. Enter a prompt or choose a preset (e.g. 🚉 Transit Oriented Development)
4. Click **Generate Master Plan**
5. Watch AI loading animation → layers animate onto the map
6. Review summary metrics and construction timeline
7. Export PNG or JSON

## Tech Stack

- Next.js (App Router) · TypeScript · TailwindCSS
- MapLibre GL JS · OpenStreetMap tiles
- Zustand · Turf.js · shadcn-style UI
- OpenAI API (optional) · Mock provider fallback

## AI Provider

The app supports **NVIDIA NIM** (recommended free tier), **OpenAI**, or **mock data** fallback.

### NVIDIA NIM + GLM-5.2 (recommended)

1. Sign up at [build.nvidia.com](https://build.nvidia.com)
2. Generate an API key at [build.nvidia.com/settings](https://build.nvidia.com/settings)
3. Add to `.env.local`:

```env
AI_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-your-key-here
NVIDIA_MODEL=z-ai/glm-5.2
```

Endpoint: `https://integrate.api.nvidia.com/v1` · Model: `z-ai/glm-5.2`

If no API key is set, the demo uses realistic mock data and **always works**.

### OpenAI (optional)

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
```

Provider priority when `AI_PROVIDER` is unset: `NVIDIA_API_KEY` → `OPENAI_API_KEY` → mock.

## Architecture

```
src/
├── app/              # Landing + Planner pages, API route
├── components/
│   ├── Map/          # MapLibre canvas + drawing
│   ├── AI/           # Prompt panel, presets, loader
│   ├── Sidebar/      # Layer toggles + legend
│   ├── Summary/      # Master plan metrics
│   ├── Timeline/     # Construction phases
│   └── Planning/     # Workspace shell + export
├── lib/ai/           # AIProvider interface, NVIDIA NIM, OpenAI, Mock
├── store/            # Zustand planner state
├── types/            # Master plan types + presets
└── utils/            # Mock geometry generator
```

## Not Built (Placeholders Only)

Authentication · Database · Projects · Collaboration · Real GIS uploads

## License

MIT
