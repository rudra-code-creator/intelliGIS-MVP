import { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import {
  Layers,
  Upload,
  BarChart3,
  Ruler,
  Search,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AppShell } from '@/components/layout/AppShell'
import { LoadingState } from '@/components/common/LoadingState'
import { MapViewer, type MeasureMode } from '@/components/map/MapViewer'
import { DataUpload } from '@/components/map/DataUpload'
import { DatasetSummaryPanel } from '@/components/map/DatasetSummaryPanel'
import { LayerManager } from '@/components/layers/LayerManager'
import { AiChatPanel } from '@/components/chat/AiChatPanel'
import { ChartPanel } from '@/components/charts/ChartPanel'
import { useAuth } from '@/hooks/useAuth'
import {
  fetchLayersWithGeojson,
  createLayer,
  updateLayer,
  deleteLayer,
  fetchChatMessages,
  saveChatMessage,
} from '@/services/projects'
import { processGeoFile, uploadLayerToStorage } from '@/services/upload'
import { sendAiMessage } from '@/api/ai'
import { searchLocations, formatDistance, formatArea } from '@/utils/map-utils'
import type { BasemapStyle, MapLayer, ChatMessage } from '@/types/gis'

const LAYER_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [basemap, setBasemap] = useState<BasemapStyle>('streets')
  const [measureMode, setMeasureMode] = useState<MeasureMode>('none')
  const [measureResult, setMeasureResult] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number; zoom?: number; bbox?: [number, number, number, number] } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [isChatLoading, setIsChatLoading] = useState(false)

  const { data: layers = [], isLoading } = useQuery({
    queryKey: ['layers', projectId],
    queryFn: () => fetchLayersWithGeojson(projectId!),
    enabled: !!projectId,
  })

  const { data: messages = [] } = useQuery({
    queryKey: ['chat', projectId],
    queryFn: () => fetchChatMessages(projectId!),
    enabled: !!projectId,
  })

  const invalidateLayers = () => void queryClient.invalidateQueries({ queryKey: ['layers', projectId] })

  const handleUpload = useCallback(async (files: File[]) => {
    if (!user || !projectId) return
    setIsUploading(true)

    try {
      for (const file of files) {
        const { geojson, summary, fileType } = await processGeoFile(file)
        const layerId = uuidv4()
        const storagePath = await uploadLayerToStorage(user.id, projectId, layerId, geojson)

        await createLayer(user.id, projectId, {
          id: layerId,
          projectId,
          name: file.name.replace(/\.[^.]+$/, ''),
          fileType,
          storagePath,
          color: LAYER_COLORS[layers.length % LAYER_COLORS.length],
          opacity: 0.8,
          visible: true,
          summary,
          featureCount: summary.featureCount,
          fileSize: summary.fileSize,
        })
      }
      invalidateLayers()
    } finally {
      setIsUploading(false)
    }
  }, [user, projectId, layers.length, queryClient])

  const handleLayerUpdate = async (id: string, updates: Partial<MapLayer>) => {
    await updateLayer(id, updates)
    invalidateLayers()
  }

  const handleLayerDelete = async (id: string) => {
    await deleteLayer(id)
    invalidateLayers()
  }

  const handleSendMessage = async (content: string) => {
    if (!user || !projectId) return
    setIsChatLoading(true)

    try {
      await saveChatMessage(user.id, projectId, 'user', content)
      void queryClient.invalidateQueries({ queryKey: ['chat', projectId] })

      const layerSummaries = layers
        .map((l) => l.summary)
        .filter((s): s is NonNullable<typeof s> => s !== null)

      const history: Pick<ChatMessage, 'role' | 'content'>[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const { reply } = await sendAiMessage({
        message: content,
        projectId,
        layerSummaries,
        conversationHistory: history,
      })

      await saveChatMessage(user.id, projectId, 'assistant', reply)
      void queryClient.invalidateQueries({ queryKey: ['chat', projectId] })
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    const results = await searchLocations(searchQuery)
    if (results.length > 0) {
      const first = results[0]
      setFlyTo({
        lng: first.lng,
        lat: first.lat,
        zoom: 12,
        bbox: first.bbox,
      })
    }
  }

  const activeSummary = layers.find((l) => l.visible && l.summary)?.summary ?? layers[0]?.summary ?? null

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading workspace..." />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {sidebarOpen && (
          <aside className="flex w-80 shrink-0 flex-col border-r bg-card/50">
            <Tabs defaultValue="layers" className="flex h-full flex-col">
              <TabsList className="mx-3 mt-3 grid w-auto grid-cols-4">
                <TabsTrigger value="layers" className="text-xs"><Layers className="h-3.5 w-3.5" /></TabsTrigger>
                <TabsTrigger value="upload" className="text-xs"><Upload className="h-3.5 w-3.5" /></TabsTrigger>
                <TabsTrigger value="summary" className="text-xs"><MapIcon className="h-3.5 w-3.5" /></TabsTrigger>
                <TabsTrigger value="charts" className="text-xs"><BarChart3 className="h-3.5 w-3.5" /></TabsTrigger>
              </TabsList>

              <TabsContent value="layers" className="mt-0 flex-1 overflow-hidden">
                <LayerManager
                  layers={layers}
                  onToggleVisibility={(id, visible) => void handleLayerUpdate(id, { visible })}
                  onRename={(id, name) => void handleLayerUpdate(id, { name })}
                  onDelete={(id) => void handleLayerDelete(id)}
                  onOpacityChange={(id, opacity) => void handleLayerUpdate(id, { opacity })}
                  onColorChange={(id, color) => void handleLayerUpdate(id, { color })}
                />
              </TabsContent>

              <TabsContent value="upload" className="mt-0 flex-1 overflow-auto p-3">
                <DataUpload onUpload={handleUpload} isUploading={isUploading} />
              </TabsContent>

              <TabsContent value="summary" className="mt-0 flex-1 overflow-auto">
                <DatasetSummaryPanel summary={activeSummary} />
              </TabsContent>

              <TabsContent value="charts" className="mt-0 flex-1 overflow-auto">
                <ChartPanel layers={layers} />
              </TabsContent>
            </Tabs>
          </aside>
        )}

        <div className="relative flex flex-1 flex-col">
          <div className="flex items-center gap-2 border-b bg-background/80 p-2 backdrop-blur">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </Button>

            <Select value={basemap} onValueChange={(v) => setBasemap(v as BasemapStyle)}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="streets">Streets</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="satellite">Satellite</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-1">
              <Button
                variant={measureMode === 'distance' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMeasureMode(measureMode === 'distance' ? 'none' : 'distance')}
              >
                <Ruler className="mr-1 h-3.5 w-3.5" />
                Distance
              </Button>
              <Button
                variant={measureMode === 'area' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMeasureMode(measureMode === 'area' ? 'none' : 'area')}
              >
                Area
              </Button>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                  placeholder="Search location..."
                  className="h-8 w-48 pl-8"
                />
              </div>
              <Button variant="ghost" size="sm" onClick={() => setChatOpen(!chatOpen)}>
                AI Chat
              </Button>
            </div>
          </div>

          {measureResult && (
            <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-lg bg-background/90 px-4 py-2 text-sm shadow-lg backdrop-blur">
              {measureResult}
              <Button variant="ghost" size="sm" className="ml-2 h-6" onClick={() => setMeasureResult(null)}>×</Button>
            </div>
          )}

          <div className="relative flex flex-1">
            <div className={chatOpen ? 'flex-1' : 'w-full'}>
              <MapViewer
                layers={layers}
                basemap={basemap}
                measureMode={measureMode}
                flyTo={flyTo}
                onMeasureComplete={(result) => {
                  setMeasureResult(
                    result.type === 'distance'
                      ? `Distance: ${formatDistance(result.value)}`
                      : `Area: ${formatArea(result.value)}`,
                  )
                  setMeasureMode('none')
                }}
              />
            </div>

            {chatOpen && (
              <aside className="w-96 shrink-0 border-l bg-card/50">
                <AiChatPanel
                  messages={messages}
                  onSend={handleSendMessage}
                  isLoading={isChatLoading}
                />
              </aside>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
