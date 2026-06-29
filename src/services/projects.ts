import type { Json, Layer, Project } from '@/types/database'
import type { DatasetSummary, MapLayer } from '@/types/gis'
import { supabase } from './supabase'
import { downloadLayerFromStorage } from './upload'

function mapLayerRow(row: Layer): MapLayer {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    fileType: row.file_type as MapLayer['fileType'],
    storagePath: row.storage_path,
    color: row.color,
    opacity: row.opacity,
    visible: row.visible,
    summary: row.summary as DatasetSummary | null,
    featureCount: row.feature_count,
    fileSize: row.file_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchProjects(userId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createProject(userId: string, name: string, description?: string): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, name, description: description ?? null })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateProject(projectId: string, updates: { name?: string; description?: string }): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', projectId)
  if (error) throw error
}

export async function fetchLayers(projectId: string): Promise<MapLayer[]> {
  const { data, error } = await supabase
    .from('layers')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapLayerRow)
}

export async function fetchLayersWithGeojson(projectId: string): Promise<MapLayer[]> {
  const layers = await fetchLayers(projectId)
  return Promise.all(
    layers.map(async (layer) => {
      try {
        const geojson = await downloadLayerFromStorage(layer.storagePath)
        return { ...layer, geojson }
      } catch {
        return layer
      }
    }),
  )
}

export async function createLayer(
  userId: string,
  projectId: string,
  layer: Omit<MapLayer, 'createdAt' | 'updatedAt' | 'geojson'>,
): Promise<MapLayer> {
  const { data, error } = await supabase
    .from('layers')
    .insert({
      id: layer.id,
      user_id: userId,
      project_id: projectId,
      name: layer.name,
      file_type: layer.fileType,
      storage_path: layer.storagePath,
      color: layer.color,
      opacity: layer.opacity,
      visible: layer.visible,
      summary: layer.summary as Json | null,
      feature_count: layer.featureCount,
      file_size: layer.fileSize,
    })
    .select()
    .single()

  if (error) throw error
  return mapLayerRow(data)
}

export async function updateLayer(
  layerId: string,
  updates: Partial<Pick<MapLayer, 'name' | 'color' | 'opacity' | 'visible'>>,
): Promise<MapLayer> {
  const { data, error } = await supabase
    .from('layers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', layerId)
    .select()
    .single()

  if (error) throw error
  return mapLayerRow(data)
}

export async function deleteLayer(layerId: string): Promise<void> {
  const { error } = await supabase.from('layers').delete().eq('id', layerId)
  if (error) throw error
}

export async function fetchChatMessages(projectId: string) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
  }))
}

export async function saveChatMessage(
  userId: string,
  projectId: string,
  role: 'user' | 'assistant',
  content: string,
) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ user_id: userId, project_id: projectId, role, content })
    .select()
    .single()

  if (error) throw error
  return {
    id: data.id,
    role: data.role,
    content: data.content,
    createdAt: data.created_at,
  }
}
