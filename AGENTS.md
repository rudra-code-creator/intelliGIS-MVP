## Learned User Preferences

- Prioritize realistic, AI-generated master plan geometry over procedural mock grids of uniform straight lines
- Generated plans must respect and complement existing surrounding infrastructure (buildings, streets, terrain)
- Roads should follow context (terrain, rivers), vary from arterials to cul-de-sacs, and never cut through buildings
- Target scenic artist-impression bird's-eye view master plans for demos, not schematic line overlays alone
- Keep roads, bike network, and transit layer lines visible when artistic renderings are shown
- Use NVIDIA NIM (z-ai/glm-5.2) as the preferred free AI provider when possible
- Show a visible AI provider indicator (NVIDIA NIM, OpenAI, or Mock) so it is clear when real AI is active
- Preserve boundary drawing and working toolbar tools when changing layout or adding features
- Include a map layers sidebar and manual design toolbar similar to professional GIS/planning tools
- Follow intelliGIS pitch deck branding: dark blue and teal color palette
- Prioritize investor-ready polish and convincing demo UX over backend complexity

## Learned Workspace Facts

- intelliGIS is a proof-of-concept MVP for AI-assisted urban master planning demos (not production)
- Stack: Next.js (App Router), TypeScript, TailwindCSS, MapLibre GL JS, Zustand, Turf.js; no auth or database
- AI providers are abstracted (NVIDIA NIM, OpenAI, mock); demo falls back to mock when no API key is set
- Default NVIDIA NIM model: z-ai/glm-5.2 via https://integrate.api.nvidia.com/v1
- Map defaults to Brisbane with OpenStreetMap tiles
- Planner workspace layout: left layer sidebar, center map, right AI prompt panel
- Public GitHub repo: rudra-code-creator/intelliGIS
- Primary demo audience: investors, startup accelerators, and government innovation programs

## Cursor Cloud specific instructions

- Node 22 is available and works with Next.js 16; no version manager setup needed. Deps install via `npm install` (run automatically by the startup update script).
- Standard commands live in `package.json`: `npm run dev` (dev server on port 3000), `npm run build`, `npm run lint`. Start the dev server yourself when testing (it is not started by the update script).
- No database, auth, or external services are required to run or demo the app.
- AI provider auto-detects from env: `NVIDIA_API_KEY` → `OPENAI_API_KEY` → mock. With no key set it falls back to the mock provider, which fully works for the demo (top-nav badge shows "Mock data"). To use real AI, add keys to `.env.local` (see `.env.example`); env changes require a dev server restart.
- Hello-world/demo flow: open `/`, click "Launch App" → on `/planner` click "Use Sample Area" → pick a preset (e.g. "Transit Oriented") or type a prompt → "Generate Master Plan". Colored land-use layers render on the map with a summary/metrics panel and construction timeline.
- Pre-existing `npm run lint` reports 2 errors and several warnings in the current tree; these are unrelated to environment setup.
