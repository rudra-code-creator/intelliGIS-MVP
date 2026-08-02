import type { PresetPrompt } from '@/types/master-plan'

export const PRESET_PROMPTS: PresetPrompt[] = [
  { id: 'cbd', emoji: '🏙', label: 'New CBD', prompt: 'Create a vibrant mixed-use CBD with a high-rise office district, mixed-use stacked towers, public plazas, civic squares, high-density commercial core, and integrated transit.' },
  { id: 'green', emoji: '🌳', label: 'Green City', prompt: 'Design a green city district with 40% open space, urban forests, and biodiversity corridors.' },
  { id: 'cycling', emoji: '🚲', label: 'Cycling City', prompt: 'Plan a cycling-first neighbourhood with protected bike highways and car-free zones.' },
  { id: 'tod', emoji: '🚉', label: 'Transit Oriented', prompt: 'Design a transit-oriented development around this train station with medium-density housing, bike lanes, parks, and mixed-use commercial areas.' },
  { id: 'affordable', emoji: '🏘', label: 'Affordable Housing', prompt: 'Create an affordable housing master plan with diverse dwelling types and community facilities.' },
  { id: 'waterfront', emoji: '🌊', label: 'Waterfront', prompt: 'Redevelop the waterfront with promenades, mixed-use activation, and flood-resilient public realm.' },
  { id: 'netzero', emoji: '🌱', label: 'Net Zero District', prompt: 'Design a net-zero carbon district with renewable energy, green roofs, and low-emission mobility.' },
]
