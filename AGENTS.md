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

- Single Next.js service; standard commands live in `package.json` (`npm run dev`, `npm run build`, `npm run lint`). Dev server runs on `http://localhost:3000`.
- No API key is required to run or demo the app: with no `AI_PROVIDER`/`NVIDIA_API_KEY`/`OPENAI_API_KEY` set, the API routes fall back to the mock provider and every flow (generate master plan, metrics, timeline) works fully. To exercise real AI, set keys in `.env.local` per `README.md`.
- Hello-world / smoke check: POST to `/api/generate` with `{ prompt, boundary }` (a GeoJSON Polygon Feature) returns plan layers, or use the UI: Launch App → Use Sample Area → pick a preset → Generate Master Plan.
- `npm run lint` currently reports 2 pre-existing errors (`chat-completion.ts` prefer-const, `MapCanvas` ref-during-render) plus warnings. These are pre-existing code issues, not environment problems.
