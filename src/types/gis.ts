import type { FeatureCollection } from 'geojson'

export type SupportedFileType = 'geojson' | 'csv' | 'kml' | 'gpx' | 'shapefile'

export interface BoundingBox {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export interface AttributeStats {
  name: string
  type: string
  missingCount: number
  uniqueCount: number
  sampleValues: string[]
}

export interface DatasetSummary {
  featureCount: number
  geometryTypes: string[]
  boundingBox: BoundingBox | null
  attributes: AttributeStats[]
  missingValues: Record<string, number>
  crs: string
  fileSize: number
  fileName: string
  fileType: SupportedFileType
}

export interface MapLayer {
  id: string
  projectId: string
  name: string
  fileType: SupportedFileType
  storagePath: string
  color: string
  opacity: number
  visible: boolean
  summary: DatasetSummary | null
  featureCount: number
  fileSize: number
  geojson?: FeatureCollection
  createdAt: string
  updatedAt: string
}

export interface ProjectWithLayers {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  layers: MapLayer[]
}

export type BasemapStyle = 'streets' | 'satellite' | 'dark' | 'light'

export type ChartType = 'bar' | 'pie' | 'line' | 'histogram'

export interface ChartConfig {
  type: ChartType
  field: string
  title: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export interface MeasureResult {
  type: 'distance' | 'area'
  value: number
  unit: string
  coordinates: [number, number][]
}

export interface LocationSearchResult {
  id: string
  name: string
  lat: number
  lng: number
  bbox?: [number, number, number, number]
}
