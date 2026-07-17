## Learned User Preferences

- Prioritize realistic, AI-generated master plan geometry over procedural mock grids of uniform straight lines
- Treat rivers, railways, highways, and major arterials as hard no-build constraints for all plan layers (zoning, roads, bike, transit); only occasional bridges or tunnels may cross; flood-prone land may be zoned, but not the river itself
- Generated plans must align with surrounding street/block orientation and complement existing infrastructure (buildings, streets, terrain)
- Prefer grid street layouts for demos for now; roads should use plausible fake names, vary in width from arterials to local streets, and never cut through buildings or hard constraints
- Target scenic artist-impression bird's-eye view master plans for demos, with roads, bike network, and transit lines kept visible
- Color-code land-use blocks (e.g. commercial blue, residential yellow, industrial grey), vary block sizes, and show footprints for hospitals and schools
- Keep the basemap colorful after master plan generation; avoid monochrome map styling
- Support iterative follow-up prompts to refine an existing generated plan
- Use NVIDIA NIM (z-ai/glm-5.2) as the preferred free AI provider when possible, with a visible provider indicator (NVIDIA NIM, OpenAI, or Mock)
- Preserve boundary drawing and working toolbar tools; support freeform arterial drawing with AI plan adaptation around the new road
- Include a map layers sidebar and manual design toolbar similar to professional GIS/planning tools
- Follow intelliGIS pitch deck branding (dark blue and teal) and prioritize investor-ready polish over backend complexity

## Learned Workspace Facts

- intelliGIS is a proof-of-concept MVP for AI-assisted urban master planning demos (not production)
- Stack: Next.js (App Router), TypeScript, TailwindCSS, MapLibre GL JS, Zustand, Turf.js; no auth or database
- AI providers are abstracted (NVIDIA NIM, OpenAI, mock); demo falls back to mock when no API key is set
- Default NVIDIA NIM model: z-ai/glm-5.2 via https://integrate.api.nvidia.com/v1
- Master plan geometry is largely OSM/Turf procedural with LLM narrative/annotations rather than full LLM-drawn GeoJSON
- Hard constraints use spatial GIS layers (OSM, optionally BCC open GIS) plus fine-grained basemap color no-build overlays (light blue rivers, black rail, red highways, orange/yellow arterials); RAG is for policy/docs only, not geometry
- Map defaults to Brisbane with OpenStreetMap tiles; basemap cues include rivers (light blue), railways (black), highways (red), and major arterials (orange/yellow)
- Planner workspace layout: left layer sidebar, center map, right AI prompt panel
- Public GitHub repo: rudra-code-creator/intelliGIS-MVP
- Primary demo audience: investors, startup accelerators, and government innovation programs
