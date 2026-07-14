import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon,
  Position,
} from 'geojson'

export type LayerId =
  | 'master-plan'
  | 'roads'
  | 'parks'
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'transit'
  | 'bike-network'
  | 'green-space'
  | 'schools'
  | 'hospitals'
  | 'annotations'

export interface LayerConfig {
  id: LayerId
  label: string
  color: string
  visible: boolean
  geometryType: 'polygon' | 'line' | 'point'
  opacity?: number
}

export interface Annotation {
  id: string
  text: string
  coordinates: Position
}

export interface MasterPlanLayers {
  roads: FeatureCollection<LineString>
  parks: FeatureCollection<Polygon | Point>
  residential: FeatureCollection<Polygon>
  commercial: FeatureCollection<Polygon>
  industrial: FeatureCollection<Polygon>
  bike_paths: FeatureCollection<LineString>
  transit: FeatureCollection<LineString>
  green_space: FeatureCollection<Polygon>
  schools: FeatureCollection<Polygon>
  hospitals: FeatureCollection<Polygon>
  annotations: Annotation[]
}

export interface MasterPlanSummary {
  populationCapacity: number
  estimatedJobs: number
  greenSpacePercent: number
  walkabilityScore: number
  transitAccessibility: number
  carbonImpact: string
  developmentCost: string
  constructionPhases: string[]
  narrative: string
}

export interface TimelinePhase {
  id: string
  phase: number
  title: string
  description: string
  duration: string
}

export interface MasterPlanResult {
  layers: MasterPlanLayers
  summary: MasterPlanSummary
  timeline: TimelinePhase[]
}

export interface PromptHistoryItem {
  id: string
  prompt: string
  timestamp: number
}

export interface GenerateRequest {
  prompt: string
  boundary: Feature<Polygon>
}

export type GenerationStep =
  | 'idle'
  | 'analysing'
  | 'land-use'
  | 'transport'
  | 'finalising'
  | 'complete'

export interface PresetPrompt {
  id: string
  emoji: string
  label: string
  prompt: string
}

export const DEFAULT_LAYERS: LayerConfig[] = [
  { id: 'master-plan', label: 'Master Plan', color: '#00b8a0', visible: true, geometryType: 'polygon' },
  { id: 'roads', label: 'Roads', color: '#9ca3af', visible: true, geometryType: 'line' },
  { id: 'parks', label: 'Parks', color: '#22c55e', visible: true, geometryType: 'polygon' },
  { id: 'residential', label: 'Residential', color: '#facc15', visible: true, geometryType: 'polygon' },
  { id: 'commercial', label: 'Commercial', color: '#3b82f6', visible: true, geometryType: 'polygon' },
  { id: 'industrial', label: 'Industrial', color: '#6b7280', visible: true, geometryType: 'polygon' },
  { id: 'transit', label: 'Transit', color: '#ef4444', visible: true, geometryType: 'line' },
  { id: 'bike-network', label: 'Bike Network', color: '#f97316', visible: true, geometryType: 'line' },
  { id: 'green-space', label: 'Green Space', color: '#10b981', visible: true, geometryType: 'polygon', opacity: 0.35 },
  { id: 'schools', label: 'Schools', color: '#8b5cf6', visible: true, geometryType: 'polygon' },
  { id: 'hospitals', label: 'Hospitals', color: '#ec4899', visible: true, geometryType: 'polygon' },
]

export const BRISBANE_CENTER: [number, number] = [153.0251, -27.4698]
