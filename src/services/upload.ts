import type { FeatureCollection } from 'geojson'
import type { DatasetSummary, SupportedFileType } from '@/types/gis'
import { analyzeGeoJson } from '@/utils/dataset-summary'
import { parseGeoFile } from '@/utils/geo-parser'
import { supabase } from './supabase'

export interface UploadResult {
  geojson: FeatureCollection
  summary: DatasetSummary
  fileType: SupportedFileType
}

export async function processGeoFile(file: File): Promise<UploadResult> {
  const { geojson, fileType } = await parseGeoFile(file)
  const summary = analyzeGeoJson(geojson, file.name, fileType, file.size)
  return { geojson, summary, fileType }
}

export async function uploadLayerToStorage(
  userId: string,
  projectId: string,
  layerId: string,
  geojson: FeatureCollection,
): Promise<string> {
  const path = `${userId}/${projectId}/${layerId}.geojson`
  const blob = new Blob([JSON.stringify(geojson)], { type: 'application/geo+json' })

  const { error } = await supabase.storage.from('datasets').upload(path, blob, {
    contentType: 'application/geo+json',
    upsert: true,
  })

  if (error) throw error
  return path
}

export async function downloadLayerFromStorage(storagePath: string): Promise<FeatureCollection> {
  const { data, error } = await supabase.storage.from('datasets').download(storagePath)
  if (error) throw error
  const text = await data.text()
  return JSON.parse(text) as FeatureCollection
}
