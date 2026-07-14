import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'
import type { ConfiguredProviderInfo, GenerationMeta } from '@/types/provider'
import type { SiteContext } from '@/utils/osm-context'
import { LAYER_ID_TO_SOURCE } from '@/utils/layer-map'
import { applyOsmGeometryToPlan } from '@/utils/plan-finalize'
import { parsePlanIntent } from '@/utils/osm-master-plan'
import {
  DEFAULT_LAYERS,
  type GenerationStep,
  type LayerConfig,
  type LayerId,
  type MasterPlanLayers,
  type MasterPlanResult,
  type PromptHistoryItem,
} from '@/types/master-plan'

export type MapTool =
  | 'select'
  | 'pan'
  | 'draw-boundary'
  | 'draw-line'
  | 'draw-arterial'
  | 'draw-polygon'
  | 'draw-point'
  | 'erase'

interface PlannerState {
  boundary: Feature<Polygon> | null
  layers: LayerConfig[]
  masterPlan: MasterPlanResult | null
  prompt: string
  fullPlanPrompt: string
  history: PromptHistoryItem[]
  generationStep: GenerationStep
  isGenerating: boolean
  animatedLayerIds: Set<string>
  configuredProvider: ConfiguredProviderInfo | null
  lastGenerationMeta: GenerationMeta | null

  mapTool: MapTool
  activeLayerId: LayerId
  drawColor: string
  drawOpacity: number
  strokeWidth: number
  layerLocks: Partial<Record<LayerId, boolean>>
  siteContext: SiteContext | null
  showOsmStreets: boolean
  showOsmBuildings: boolean
  editHistory: MasterPlanResult[]
  editHistoryIndex: number
  isLoadingOsm: boolean

  setBoundary: (boundary: Feature<Polygon> | null) => void
  setPrompt: (prompt: string) => void
  toggleLayer: (id: LayerId) => void
  setLayerColor: (id: LayerId, color: string) => void
  setLayerOpacity: (id: LayerId, opacity: number) => void
  toggleLayerLock: (id: LayerId) => void
  clearLayer: (id: LayerId) => void
  setMapTool: (tool: MapTool) => void
  setActiveLayer: (id: LayerId) => void
  setDrawColor: (color: string) => void
  setDrawOpacity: (opacity: number) => void
  setStrokeWidth: (width: number) => void
  setSiteContext: (ctx: SiteContext | null) => void
  toggleOsmStreets: () => void
  toggleOsmBuildings: () => void
  setIsLoadingOsm: (loading: boolean) => void
  startGeneration: () => void
  startRefinement: () => void
  setGenerationStep: (step: GenerationStep) => void
  setMasterPlan: (plan: MasterPlanResult) => void
  updateMasterPlan: (plan: MasterPlanResult, pushHistory?: boolean) => void
  addAnimatedLayer: (id: string) => void
  finishGeneration: (plan: MasterPlanResult, prompt: string, meta: GenerationMeta, siteContext?: SiteContext | null) => void
  finishRefinement: (plan: MasterPlanResult, followUp: string) => void
  finishArterialAdaptation: (plan: MasterPlanResult, roadName: string) => void
  setConfiguredProvider: (info: ConfiguredProviderInfo) => void
  resetPlan: () => void
  undo: () => void
  redo: () => void
  addManualFeature: (layerId: LayerId, feature: Feature) => void
  eraseNearestFeature: (lng: number, lat: number) => void
}

function layerSourceKey(id: LayerId): keyof MasterPlanLayers | null {
  const key = LAYER_ID_TO_SOURCE[id]
  return (key as keyof MasterPlanLayers) ?? null
}

function clonePlan(plan: MasterPlanResult): MasterPlanResult {
  return JSON.parse(JSON.stringify(plan)) as MasterPlanResult
}

function pushHistoryState(
  state: PlannerState,
  plan: MasterPlanResult,
): Pick<PlannerState, 'editHistory' | 'editHistoryIndex'> {
  const trimmed = state.editHistory.slice(0, state.editHistoryIndex + 1)
  const next = [...trimmed, clonePlan(plan)].slice(-30)
  return {
    editHistory: next,
    editHistoryIndex: next.length - 1,
  }
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  boundary: null,
  layers: DEFAULT_LAYERS,
  masterPlan: null,
  prompt: '',
  fullPlanPrompt: '',
  history: [],
  generationStep: 'idle',
  isGenerating: false,
  animatedLayerIds: new Set(),
  configuredProvider: null,
  lastGenerationMeta: null,

  mapTool: 'select',
  activeLayerId: 'roads',
  drawColor: '#00b8a0',
  drawOpacity: 0.5,
  strokeWidth: 4,
  layerLocks: {},
  siteContext: null,
  showOsmStreets: true,
  showOsmBuildings: true,
  editHistory: [],
  editHistoryIndex: -1,
  isLoadingOsm: false,

  setBoundary: (boundary) => set({ boundary }),
  setPrompt: (prompt) => set({ prompt }),
  toggleLayer: (id) =>
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    })),
  setLayerColor: (id, color) =>
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, color } : l)),
    })),
  setLayerOpacity: (id, opacity) =>
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
    })),
  toggleLayerLock: (id) =>
    set((state) => ({
      layerLocks: { ...state.layerLocks, [id]: !state.layerLocks[id] },
    })),
  clearLayer: (id) => {
    const state = get()
    if (!state.masterPlan || state.layerLocks[id]) return
    const key = layerSourceKey(id)
    if (!key) return

    const next = clonePlan(state.masterPlan)
    const empty = turf.featureCollection([])
    if (key === 'roads') next.layers.roads = empty as MasterPlanLayers['roads']
    else if (key === 'bike_paths') next.layers.bike_paths = empty as MasterPlanLayers['bike_paths']
    else if (key === 'transit') next.layers.transit = empty as MasterPlanLayers['transit']
    else if (key === 'residential') next.layers.residential = empty as MasterPlanLayers['residential']
    else if (key === 'commercial') next.layers.commercial = empty as MasterPlanLayers['commercial']
    else if (key === 'industrial') next.layers.industrial = empty as MasterPlanLayers['industrial']
    else if (key === 'parks') next.layers.parks = empty as MasterPlanLayers['parks']
    else if (key === 'green_space') next.layers.green_space = empty as MasterPlanLayers['green_space']
    else if (key === 'schools') next.layers.schools = empty as MasterPlanLayers['schools']
    else if (key === 'hospitals') next.layers.hospitals = empty as MasterPlanLayers['hospitals']
    const historyUpdate = pushHistoryState(state, next)
    set({ masterPlan: next, ...historyUpdate })
  },
  setMapTool: (tool) => set({ mapTool: tool }),
  setActiveLayer: (id) => set({ activeLayerId: id }),
  setDrawColor: (color) => set({ drawColor: color }),
  setDrawOpacity: (opacity) => set({ drawOpacity: opacity }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setSiteContext: (ctx) => set({ siteContext: ctx }),
  toggleOsmStreets: () => set((s) => ({ showOsmStreets: !s.showOsmStreets })),
  toggleOsmBuildings: () => set((s) => ({ showOsmBuildings: !s.showOsmBuildings })),
  setIsLoadingOsm: (loading) => set({ isLoadingOsm: loading }),
  startGeneration: () =>
    set({
      isGenerating: true,
      generationStep: 'analysing',
      animatedLayerIds: new Set(),
      masterPlan: null,
      lastGenerationMeta: null,
      fullPlanPrompt: '',
      editHistory: [],
      editHistoryIndex: -1,
    }),
  startRefinement: () =>
    set({
      isGenerating: true,
      generationStep: 'analysing',
      animatedLayerIds: new Set(),
    }),
  setGenerationStep: (step) => set({ generationStep: step }),
  setMasterPlan: (plan) => set({ masterPlan: plan }),
  updateMasterPlan: (plan, pushHistory = true) =>
    set((state) => ({
      masterPlan: plan,
      ...(pushHistory ? pushHistoryState(state, plan) : {}),
    })),
  addAnimatedLayer: (id) =>
    set((state) => {
      const next = new Set(state.animatedLayerIds)
      next.add(id)
      return { animatedLayerIds: next }
    }),
  finishGeneration: (plan, prompt, meta, siteContext) =>
    set((state) => {
      let finalPlan = plan
      const ctx = siteContext ?? state.siteContext
      if (ctx && state.boundary) {
        finalPlan = applyOsmGeometryToPlan(finalPlan, state.boundary, prompt, ctx)
      }
      return {
        masterPlan: finalPlan,
        fullPlanPrompt: prompt,
        isGenerating: false,
        generationStep: 'complete',
        lastGenerationMeta: meta,
        siteContext: ctx ?? state.siteContext,
        layers: state.layers.map((l) => ({ ...l, visible: true })),
        editHistory: [clonePlan(finalPlan)],
        editHistoryIndex: 0,
        history: [{ id: uuid(), prompt, timestamp: Date.now() }, ...state.history].slice(0, 20),
      }
    }),
  finishRefinement: (plan, followUp) =>
    set((state) => {
      const cumulative = state.fullPlanPrompt
        ? `${state.fullPlanPrompt}\n${followUp}`
        : followUp
      let finalPlan = plan
      const ctx = state.siteContext
      if (ctx && state.boundary) {
        finalPlan = applyOsmGeometryToPlan(finalPlan, state.boundary, cumulative, ctx)
      }
      const intent = parsePlanIntent(cumulative)
      finalPlan = {
        ...finalPlan,
        summary: {
          ...finalPlan.summary,
          narrative: `${finalPlan.summary.narrative} Refined with: "${followUp}".`,
          greenSpacePercent: intent.moreParks || intent.greenCity
            ? Math.min(finalPlan.summary.greenSpacePercent + 6, 58)
            : finalPlan.summary.greenSpacePercent,
          transitAccessibility: intent.longerTransit || intent.transit
            ? Math.min(finalPlan.summary.transitAccessibility + 8, 98)
            : finalPlan.summary.transitAccessibility,
        },
      }
      const historyUpdate = pushHistoryState(state, finalPlan)
      return {
        masterPlan: finalPlan,
        fullPlanPrompt: cumulative,
        prompt: '',
        isGenerating: false,
        generationStep: 'complete',
        animatedLayerIds: new Set(Object.values(LAYER_ID_TO_SOURCE)),
        history: [{ id: uuid(), prompt: followUp, timestamp: Date.now() }, ...state.history].slice(0, 20),
        ...historyUpdate,
      }
    }),
  finishArterialAdaptation: (plan, roadName) =>
    set((state) => {
      const followUp = `Major arterial corridor added: ${roadName}`
      const cumulative = state.fullPlanPrompt
        ? `${state.fullPlanPrompt}\n${followUp}`
        : followUp
      const historyUpdate = pushHistoryState(state, plan)
      return {
        masterPlan: plan,
        fullPlanPrompt: cumulative,
        prompt: '',
        isGenerating: false,
        generationStep: 'complete',
        animatedLayerIds: new Set(['roads', 'transit', 'bike_paths', 'commercial', 'residential', 'industrial']),
        history: [{ id: uuid(), prompt: followUp, timestamp: Date.now() }, ...state.history].slice(0, 20),
        ...historyUpdate,
      }
    }),
  setConfiguredProvider: (info) => set({ configuredProvider: info }),
  resetPlan: () =>
    set({
      masterPlan: null,
      generationStep: 'idle',
      isGenerating: false,
      animatedLayerIds: new Set(),
      lastGenerationMeta: null,
      editHistory: [],
      editHistoryIndex: -1,
    }),
  undo: () =>
    set((state) => {
      if (state.editHistoryIndex <= 0 || !state.masterPlan) return state
      const nextIndex = state.editHistoryIndex - 1
      return { masterPlan: clonePlan(state.editHistory[nextIndex]), editHistoryIndex: nextIndex }
    }),
  redo: () =>
    set((state) => {
      if (state.editHistoryIndex >= state.editHistory.length - 1) return state
      const nextIndex = state.editHistoryIndex + 1
      return { masterPlan: clonePlan(state.editHistory[nextIndex]), editHistoryIndex: nextIndex }
    }),
  addManualFeature: (layerId, feature) => {
    const state = get()
    if (!state.masterPlan || state.layerLocks[layerId]) return
    const key = layerSourceKey(layerId)
    if (!key) return

    const next = clonePlan(state.masterPlan)
    if (key === 'annotations') {
      const pt = feature.geometry.type === 'Point' ? feature.geometry.coordinates : null
      if (!pt) return
      next.layers.annotations.push({
        id: uuid(),
        text: 'Manual note',
        coordinates: pt,
      })
    } else {
      const fc = next.layers[key] as FeatureCollection
      fc.features.push(feature as never)
    }
    const historyUpdate = pushHistoryState(state, next)
    set({ masterPlan: next, ...historyUpdate })
  },
  eraseNearestFeature: (lng, lat) => {
    const state = get()
    if (!state.masterPlan) return
    const click = turf.point([lng, lat])
    let bestKey: keyof MasterPlanLayers | null = null
    let bestIdx = -1
    let bestDist = 0.05

    const tryLayer = (key: keyof MasterPlanLayers) => {
      if (key === 'annotations') {
        state.masterPlan!.layers.annotations.forEach((a, i) => {
          const d = turf.distance(click, turf.point(a.coordinates), { units: 'kilometers' })
          if (d < bestDist) {
            bestDist = d
            bestKey = key
            bestIdx = i
          }
        })
        return
      }
      const fc = state.masterPlan!.layers[key] as FeatureCollection
      fc.features.forEach((f, i) => {
        try {
          const nearest = turf.nearestPointOnLine(f as Feature<LineString>, click)
          const d = turf.distance(click, nearest, { units: 'kilometers' })
          if (d < bestDist) {
            bestDist = d
            bestKey = key
            bestIdx = i
          }
        } catch {
          if (f.geometry.type === 'Point') {
            const d = turf.distance(click, f as Feature<Point>, { units: 'kilometers' })
            if (d < bestDist) {
              bestDist = d
              bestKey = key
              bestIdx = i
            }
          } else if (f.geometry.type === 'Polygon') {
            if (turf.booleanPointInPolygon(click, f as Feature<Polygon>)) {
              bestDist = 0
              bestKey = key
              bestIdx = i
            }
          }
        }
      })
    }

    ;(['roads', 'bike_paths', 'transit', 'residential', 'commercial', 'industrial', 'parks', 'green_space', 'schools', 'hospitals'] as const).forEach(tryLayer)
    tryLayer('annotations')

    if (bestKey === null || bestIdx < 0) return
    const layerId = Object.entries(LAYER_ID_TO_SOURCE).find(([, v]) => v === bestKey)?.[0] as LayerId | undefined
    if (layerId && state.layerLocks[layerId]) return

    const next = clonePlan(state.masterPlan)
    if (bestKey === 'annotations') {
      next.layers.annotations.splice(bestIdx, 1)
    } else {
      const fc = next.layers[bestKey] as FeatureCollection
      fc.features.splice(bestIdx, 1)
    }
    const historyUpdate = pushHistoryState(state, next)
    set({ masterPlan: next, ...historyUpdate })
  },
}))
