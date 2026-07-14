'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'
import type { MapTool } from '@/store/planner-store'
import { usePlannerStore } from '@/store/planner-store'
import { BRISBANE_CENTER } from '@/types/master-plan'
import { isLayerSourceVisible, LAYER_ID_TO_SOURCE } from '@/utils/layer-map'
import { streetsToFeatureCollection } from '@/utils/osm-context'
import { buildTransportLayers } from '@/utils/osm-master-plan'
import { applyOsmGeometryToPlan } from '@/utils/plan-finalize'
import { MapToolbar } from '@/components/Map/MapToolbar'
import { useAdaptAroundArterial } from '@/hooks/useAdaptAroundArterial'
import { BRAND } from '@/lib/brand'
import { IMPRESSION } from '@/lib/impression-styles'

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
}

const PLAN_LAYER_KEYS = [
  'green_space', 'parks', 'residential', 'commercial', 'industrial',
  'roads', 'bike_paths', 'transit', 'schools', 'hospitals',
] as const

const DRAW_TOOLS = ['draw-boundary', 'draw-line', 'draw-arterial', 'draw-polygon', 'draw-point', 'erase'] as const

function updateDrawPreview(map: maplibregl.Map, points: [number, number][]) {
  const { mapTool, drawColor, strokeWidth } = usePlannerStore.getState()
  const sourceId = 'draw-preview'

  let features: Feature[] = []
  if (points.length === 1) features = [turf.point(points[0])]
  else if ((mapTool === 'draw-line' || mapTool === 'draw-arterial') && points.length >= 2) features = [turf.lineString(points)]
  else if (points.length >= 3) features = [turf.lineString([...points, points[0]])]
  else if (points.length >= 2) features = [turf.lineString(points)]

  const pointFeatures = points.map((p) => turf.point(p))
  const previewData: FeatureCollection = {
    type: 'FeatureCollection',
    features: [...features, ...pointFeatures],
  }

  const color = mapTool === 'draw-boundary'
    ? BRAND.teal[500]
    : mapTool === 'draw-arterial'
      ? IMPRESSION.roadArterial
      : drawColor
  const width = mapTool === 'draw-boundary' ? 2 : mapTool === 'draw-arterial' ? 6 : strokeWidth

  if (map.getSource(sourceId)) {
    (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(previewData)
    if (map.getLayer('draw-preview-layer')) {
      map.setPaintProperty('draw-preview-layer', 'line-color', color)
      map.setPaintProperty('draw-preview-layer', 'line-width', width)
    }
    if (map.getLayer('draw-preview-points')) {
      map.setPaintProperty('draw-preview-points', 'circle-color', color)
    }
  } else {
    map.addSource(sourceId, { type: 'geojson', data: previewData })
    map.addLayer({
      id: 'draw-preview-layer',
      type: 'line',
      source: sourceId,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': color, 'line-width': width, 'line-dasharray': [2, 2] },
    })
    map.addLayer({
      id: 'draw-preview-points',
      type: 'circle',
      source: sourceId,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': color,
        'circle-radius': 4,
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 1.5,
      },
    })
  }
}

function clearDrawPreview(map: maplibregl.Map) {
  if (map.getLayer('draw-preview-layer')) map.removeLayer('draw-preview-layer')
  if (map.getLayer('draw-preview-points')) map.removeLayer('draw-preview-points')
  if (map.getSource('draw-preview')) map.removeSource('draw-preview')
}

export function PlannerMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const drawPointsRef = useRef<[number, number][]>([])
  const prevMapToolRef = useRef<MapTool | null>(null)
  const [drawPointCount, setDrawPointCount] = useState(0)
  const [mapReady, setMapReady] = useState(false)

  const boundary = usePlannerStore((s) => s.boundary)
  const setBoundary = usePlannerStore((s) => s.setBoundary)
  const masterPlan = usePlannerStore((s) => s.masterPlan)
  const layers = usePlannerStore((s) => s.layers)
  const animatedLayerIds = usePlannerStore((s) => s.animatedLayerIds)
  const generationStep = usePlannerStore((s) => s.generationStep)
  const mapTool = usePlannerStore((s) => s.mapTool)
  const activeLayerId = usePlannerStore((s) => s.activeLayerId)
  const strokeWidth = usePlannerStore((s) => s.strokeWidth)
  const siteContext = usePlannerStore((s) => s.siteContext)
  const showOsmStreets = usePlannerStore((s) => s.showOsmStreets)
  const showOsmBuildings = usePlannerStore((s) => s.showOsmBuildings)
  const setSiteContext = usePlannerStore((s) => s.setSiteContext)
  const setIsLoadingOsm = usePlannerStore((s) => s.setIsLoadingOsm)
  const updateMasterPlan = usePlannerStore((s) => s.updateMasterPlan)
  const prompt = usePlannerStore((s) => s.prompt)
  const { adaptFromDrawnLine } = useAdaptAroundArterial()

  const showAllLayers = generationStep === 'complete'

  const resetDrawing = useCallback(() => {
    drawPointsRef.current = []
    setDrawPointCount(0)
    const map = mapRef.current
    if (map) clearDrawPreview(map)
  }, [])

  const completeBoundaryDrawing = useCallback(() => {
    const points = drawPointsRef.current
    if (points.length < 3) return
    const polygon = turf.polygon([[...points, points[0]]]) as Feature<Polygon>
    setBoundary(polygon)
    resetDrawing()
    usePlannerStore.getState().setMapTool('select')
    mapRef.current?.fitBounds(turf.bbox(polygon) as [number, number, number, number], { padding: 60 })
  }, [setBoundary, resetDrawing])

  const completeManualFeature = useCallback(() => {
    const { mapTool: tool, activeLayerId: layerId, addManualFeature } = usePlannerStore.getState()
    const points = drawPointsRef.current

    if (tool === 'draw-line' && points.length >= 2) {
      addManualFeature(layerId, turf.lineString(points, { class: 'local', manual: true }) as Feature<LineString>)
    } else if (tool === 'draw-polygon' && points.length >= 3) {
      addManualFeature(layerId, turf.polygon([[...points, points[0]]], { landUse: layerId, manual: true }) as Feature<Polygon>)
    } else {
      return
    }
    resetDrawing()
  }, [resetDrawing])

  const completeArterialDrawing = useCallback(async () => {
    const points = drawPointsRef.current
    if (points.length < 2) return
    const coords = [...points]
    resetDrawing()
    await adaptFromDrawnLine(coords)
  }, [adaptFromDrawnLine, resetDrawing])

  // Keep latest completion callbacks accessible to the map's stable event handlers
  const actionsRef = useRef({
    completeBoundaryDrawing,
    completeManualFeature,
    completeArterialDrawing,
  })
  actionsRef.current = { completeBoundaryDrawing, completeManualFeature, completeArterialDrawing }

  // Map is created exactly once — handlers read live state from the store
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: BRISBANE_CENTER,
      zoom: 13,
    })

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    map.on('click', (e) => {
      const state = usePlannerStore.getState()
      const tool = state.mapTool
      const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat]

      if (tool === 'erase') {
        state.eraseNearestFeature(coord[0], coord[1])
        return
      }

      if (tool === 'draw-point') {
        if (!state.masterPlan) return
        state.addManualFeature(state.activeLayerId, turf.point(coord, { manual: true }) as Feature<Point>)
        return
      }

      if (tool === 'draw-line' || tool === 'draw-polygon' || tool === 'draw-arterial') {
        if (!state.masterPlan) return
        drawPointsRef.current.push(coord)
        setDrawPointCount(drawPointsRef.current.length)
        updateDrawPreview(map, drawPointsRef.current)
        return
      }

      if (tool === 'draw-boundary') {
        if (drawPointsRef.current.length === 0 && state.boundary) {
          state.setBoundary(null)
        }
        drawPointsRef.current.push(coord)
        setDrawPointCount(drawPointsRef.current.length)
        updateDrawPreview(map, drawPointsRef.current)
      }
    })

    map.on('dblclick', (e) => {
      const tool = usePlannerStore.getState().mapTool
      if (tool === 'draw-boundary') {
        e.preventDefault()
        actionsRef.current.completeBoundaryDrawing()
      } else if (tool === 'draw-line' || tool === 'draw-polygon') {
        e.preventDefault()
        actionsRef.current.completeManualFeature()
      } else if (tool === 'draw-arterial') {
        e.preventDefault()
        void actionsRef.current.completeArterialDrawing()
      }
    })

    map.on('load', () => setMapReady(true))

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  // Tool switching: cursor, pan/zoom behaviour, and clearing stale draw points
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const isDrawTool = (DRAW_TOOLS as readonly string[]).includes(mapTool)
    const canvas = map.getCanvas()
    canvas.style.cursor =
      mapTool === 'erase' ? 'not-allowed'
      : isDrawTool ? 'crosshair'
      : mapTool === 'pan' ? 'grab'
      : ''

    if (mapTool === 'pan') {
      map.dragPan.enable()
      map.doubleClickZoom.disable()
    } else if (isDrawTool) {
      map.dragPan.disable()
      map.doubleClickZoom.disable()
    } else {
      map.dragPan.enable()
      map.doubleClickZoom.enable()
    }

    if (prevMapToolRef.current !== null && prevMapToolRef.current !== mapTool) {
      resetDrawing()
    }
    prevMapToolRef.current = mapTool
  }, [mapTool, mapReady, resetDrawing])

  // Fly-to events from the toolbar search box
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        center: [number, number]
        bbox?: [number, number, number, number]
      }
      const map = mapRef.current
      if (!map) return
      if (detail.bbox) {
        // Nominatim bbox order: [south, north, west, east]
        map.fitBounds(
          [detail.bbox[2], detail.bbox[0], detail.bbox[3], detail.bbox[1]] as [number, number, number, number],
          { padding: 40 },
        )
      } else {
        map.flyTo({ center: detail.center, zoom: 14 })
      }
    }
    window.addEventListener('planner-fly-to', handler)
    return () => window.removeEventListener('planner-fly-to', handler)
  }, [])

  // Fetch OSM context when boundary changes
  useEffect(() => {
    if (!boundary) {
      setSiteContext(null)
      return
    }

    let cancelled = false
    setIsLoadingOsm(true)
    fetch('/api/osm-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boundary }),
    })
      .then((r) => r.json())
      .then((ctx) => { if (!cancelled) setSiteContext(ctx) })
      .catch(() => { if (!cancelled) setSiteContext(null) })
      .finally(() => { if (!cancelled) setIsLoadingOsm(false) })

    return () => { cancelled = true }
  }, [boundary, setSiteContext, setIsLoadingOsm])

  const updateBoundaryLayer = useCallback((map: maplibregl.Map, poly: Feature<Polygon> | null) => {
    ;['boundary-fill', 'boundary-line'].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id) })
    if (map.getSource('boundary')) map.removeSource('boundary')
    if (!poly) return

    map.addSource('boundary', { type: 'geojson', data: poly })
    map.addLayer({
      id: 'boundary-fill',
      type: 'fill',
      source: 'boundary',
      paint: { 'fill-color': BRAND.teal[500], 'fill-opacity': 0.08 },
    })
    map.addLayer({
      id: 'boundary-line',
      type: 'line',
      source: 'boundary',
      paint: { 'line-color': BRAND.teal[500], 'line-width': 2, 'line-dasharray': [2, 2] },
    })
  }, [])

  const updateOsmContextLayers = useCallback((map: maplibregl.Map) => {
    ;['osm-streets-layer', 'osm-buildings-layer', 'osm-preserve-layer'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id)
    })
    ;['osm-streets', 'osm-buildings', 'osm-preserve'].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id)
    })

    if (!siteContext) return

    if (showOsmBuildings && siteContext.buildings.features.length > 0) {
      map.addSource('osm-buildings', { type: 'geojson', data: siteContext.buildings })
      map.addLayer({
        id: 'osm-buildings-layer',
        type: 'fill',
        source: 'osm-buildings',
        paint: {
          'fill-color': IMPRESSION.existingBuilding,
          'fill-opacity': masterPlan ? 0.45 : 0.25,
        },
      })
    }

    if (siteContext.preserveAreas?.features.length > 0) {
      map.addSource('osm-preserve', { type: 'geojson', data: siteContext.preserveAreas })
      map.addLayer({
        id: 'osm-preserve-layer',
        type: 'fill',
        source: 'osm-preserve',
        paint: { 'fill-color': IMPRESSION.preserve, 'fill-opacity': 0.35 },
      })
    }

    if (showOsmStreets && siteContext.streets.length > 0 && !masterPlan) {
      map.addSource('osm-streets', {
        type: 'geojson',
        data: streetsToFeatureCollection(siteContext.streets),
      })
      map.addLayer({
        id: 'osm-streets-layer',
        type: 'line',
        source: 'osm-streets',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#64748b',
          'line-width': 1.5,
          'line-opacity': 0.55,
          'line-dasharray': [2, 2],
        },
      })
    }
  }, [siteContext, showOsmStreets, showOsmBuildings, masterPlan])

  const removePlanLayerArtifacts = (map: maplibregl.Map, key: string) => {
    ;[
      `${key}-layer`,
      `${key}-layer-outline`,
      `${key}-layer-casing`,
      `${key}-trees`,
      `${key}-layer-label`,
      `${key}-labels-layer`,
    ].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id)
    })
    ;[key, `${key}-trees-src`, `${key}-labels`].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id)
    })
  }

  const updatePlanLayers = useCallback((map: maplibregl.Map) => {
    PLAN_LAYER_KEYS.forEach((key) => removePlanLayerArtifacts(map, key))
    if (map.getSource('annotations')) {
      if (map.getLayer('annotations-layer')) map.removeLayer('annotations-layer')
      map.removeSource('annotations')
    }

    if (!masterPlan) return

    const layerVisibility = Object.fromEntries(layers.map((l) => [l.id, l.visible]))
    const layerColors = Object.fromEntries(layers.map((l) => [l.id, l.color]))
    const roadColor = layerColors.roads ?? IMPRESSION.road
    const bikeColor = layerColors['bike-network'] ?? IMPRESSION.bike
    const transitColor = layerColors.transit ?? IMPRESSION.transit

    const planLayers = { ...masterPlan.layers }
    if (
      siteContext?.streets?.length &&
      (planLayers.roads.features.length === 0 ||
        planLayers.bike_paths.features.length === 0 ||
        planLayers.transit.features.length === 0)
    ) {
      Object.assign(planLayers, buildTransportLayers(siteContext.streets))
    }

    const addBuildingLayer = (key: 'commercial' | 'residential' | 'industrial', fill: string) => {
      if (!isLayerSourceVisible(key, layerVisibility)) return
      if (!showAllLayers && !animatedLayerIds.has(key)) return

      const fc = planLayers[key] as FeatureCollection<Polygon>
      if (!fc?.features?.length) return

      map.addSource(key, { type: 'geojson', data: fc })
      map.addLayer({
        id: `${key}-layer`,
        type: 'fill',
        source: key,
        paint: {
          'fill-color': fill,
          'fill-opacity': key === 'industrial' ? 0.88 : 0.92,
          'fill-outline-color': key === 'industrial' ? '#4b5563' : IMPRESSION.buildingOutline,
        },
      })
      map.addLayer({
        id: `${key}-layer-outline`,
        type: 'line',
        source: key,
        paint: {
          'line-color': key === 'industrial' ? '#374151' : IMPRESSION.buildingOutline,
          'line-width': key === 'industrial' ? 1.4 : 1.2,
          'line-opacity': 0.9,
        },
      })
    }

    addBuildingLayer('commercial', layerColors.commercial ?? '#3b82f6')
    addBuildingLayer('residential', layerColors.residential ?? '#facc15')
    addBuildingLayer('industrial', layerColors.industrial ?? '#6b7280')

    const addGreenLayer = (key: 'parks' | 'green_space', color: string, withTrees: boolean) => {
      if (!isLayerSourceVisible(key, layerVisibility)) return
      if (!showAllLayers && !animatedLayerIds.has(key)) return

      const fc = planLayers[key] as FeatureCollection
      if (!fc?.features?.length) return

      const polygons = {
        type: 'FeatureCollection' as const,
        features: fc.features.filter((f) => f.geometry.type === 'Polygon'),
      }
      const trees = {
        type: 'FeatureCollection' as const,
        features: fc.features.filter((f) => f.geometry.type === 'Point'),
      }

      if (polygons.features.length > 0) {
        map.addSource(key, { type: 'geojson', data: polygons })
        map.addLayer({
          id: `${key}-layer`,
          type: 'fill',
          source: key,
          paint: { 'fill-color': color, 'fill-opacity': 0.72 },
        })
      }

      if (withTrees && trees.features.length > 0) {
        const treeSource = `${key}-trees-src`
        map.addSource(treeSource, { type: 'geojson', data: trees })
        map.addLayer({
          id: `${key}-trees`,
          type: 'circle',
          source: treeSource,
          paint: {
            'circle-color': IMPRESSION.parkTree,
            'circle-radius': 3.5,
            'circle-stroke-color': '#dcfce7',
            'circle-stroke-width': 1,
          },
        })
      }
    }

    addGreenLayer('parks', IMPRESSION.park, true)
    addGreenLayer('green_space', IMPRESSION.preserve, false)

    ;(['schools', 'hospitals'] as const).forEach((key) => {
      if (!isLayerSourceVisible(key, layerVisibility)) return
      if (!showAllLayers && !animatedLayerIds.has(key)) return
      const fc = planLayers[key] as FeatureCollection<Polygon>
      if (!fc?.features?.length) return

      const fillColor = key === 'hospitals'
        ? (layerColors.hospitals ?? '#ec4899')
        : (layerColors.schools ?? '#8b5cf6')

      map.addSource(key, { type: 'geojson', data: fc })
      map.addLayer({
        id: `${key}-layer`,
        type: 'fill',
        source: key,
        paint: {
          'fill-color': fillColor,
          'fill-opacity': 0.55,
          'fill-outline-color': fillColor,
        },
      })
      map.addLayer({
        id: `${key}-layer-outline`,
        type: 'line',
        source: key,
        paint: {
          'line-color': fillColor,
          'line-width': 2.5,
          'line-opacity': 0.95,
        },
      })

      const labels = turf.featureCollection(
        fc.features.map((feature) => {
          const footprintM2 = typeof feature.properties?.footprintM2 === 'number'
            ? feature.properties.footprintM2
            : Math.round(turf.area(feature))
          const name = typeof feature.properties?.name === 'string'
            ? feature.properties.name
            : key === 'schools' ? 'School' : 'Hospital'
          const label = turf.centroid(feature)
          label.properties = {
            label: `${name}\n${footprintM2.toLocaleString()} m²`,
          }
          return label
        }),
      )
      map.addSource(`${key}-labels`, { type: 'geojson', data: labels })
      map.addLayer({
        id: `${key}-labels-layer`,
        type: 'symbol',
        source: `${key}-labels`,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-anchor': 'center',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#f8fafc',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.5,
        },
      })
    })

    if (isLayerSourceVisible('roads', layerVisibility) && (showAllLayers || animatedLayerIds.has('roads'))) {
      const roads = planLayers.roads as FeatureCollection<LineString>
      if (roads.features.length > 0) {
        map.addSource('roads', { type: 'geojson', data: roads })
        map.addLayer({
          id: 'roads-layer-casing',
          type: 'line',
          source: 'roads',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': [
              'match', ['get', 'class'],
              'arterial', 18,
              'collector', 12,
              'local', 8,
              'cul-de-sac', 5.5,
              8,
            ],
            'line-opacity': 0.95,
          },
        })
        map.addLayer({
          id: 'roads-layer',
          type: 'line',
          source: 'roads',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': [
              'match', ['get', 'class'],
              'arterial', IMPRESSION.roadArterial,
              'collector', '#78716c',
              'cul-de-sac', '#a8a29e',
              roadColor,
            ],
            'line-width': [
              'match', ['get', 'class'],
              'arterial', 11,
              'collector', 7,
              'local', 4.2,
              'cul-de-sac', 2.6,
              4.2,
            ],
            'line-opacity': 1,
          },
        })
        map.addLayer({
          id: 'roads-labels-layer',
          type: 'symbol',
          source: 'roads',
          minzoom: 13.5,
          layout: {
            'symbol-placement': 'line',
            'text-field': ['get', 'name'],
            'text-size': 11,
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-rotation-alignment': 'map',
            'text-pitch-alignment': 'viewport',
          },
          paint: {
            'text-color': '#1e293b',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.8,
          },
        })
      }
    }

    if (isLayerSourceVisible('bike_paths', layerVisibility) && (showAllLayers || animatedLayerIds.has('bike_paths'))) {
      const bike = planLayers.bike_paths as FeatureCollection<LineString>
      if (bike.features.length > 0) {
        map.addSource('bike_paths', { type: 'geojson', data: bike })
        map.addLayer({
          id: 'bike_paths-layer-casing',
          type: 'line',
          source: 'bike_paths',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 8,
            'line-opacity': 0.9,
          },
        })
        map.addLayer({
          id: 'bike_paths-layer',
          type: 'line',
          source: 'bike_paths',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': bikeColor,
            'line-width': 5.5,
            'line-opacity': 1,
            'line-dasharray': [2, 1.5],
          },
        })
      }
    }

    if (isLayerSourceVisible('transit', layerVisibility) && (showAllLayers || animatedLayerIds.has('transit'))) {
      const transit = planLayers.transit as FeatureCollection<LineString>
      if (transit.features.length > 0) {
        map.addSource('transit', { type: 'geojson', data: transit })
        map.addLayer({
          id: 'transit-layer-casing',
          type: 'line',
          source: 'transit',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 10,
            'line-opacity': 0.9,
          },
        })
        map.addLayer({
          id: 'transit-layer',
          type: 'line',
          source: 'transit',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': transitColor,
            'line-width': 6.5,
            'line-opacity': 1,
            'line-dasharray': [3, 2],
          },
        })
      }
    }

    if (masterPlan.layers.annotations.length > 0 && (showAllLayers || animatedLayerIds.has('annotations'))) {
      const annotationFc = {
        type: 'FeatureCollection' as const,
        features: masterPlan.layers.annotations.map((a) => ({
          type: 'Feature' as const,
          properties: { text: a.text },
          geometry: { type: 'Point' as const, coordinates: a.coordinates },
        })),
      }
      map.addSource('annotations', { type: 'geojson', data: annotationFc })
      map.addLayer({
        id: 'annotations-layer',
        type: 'circle',
        source: 'annotations',
        paint: {
          'circle-color': BRAND.teal[500],
          'circle-radius': 6,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      })
    }
  }, [masterPlan, layers, animatedLayerIds, showAllLayers, siteContext])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    updateBoundaryLayer(map, boundary)
  }, [boundary, mapReady, updateBoundaryLayer])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    updateOsmContextLayers(map)
    updatePlanLayers(map)
  }, [mapReady, masterPlan, siteContext, updatePlanLayers, updateOsmContextLayers])

  useEffect(() => {
    if (!masterPlan || !boundary || !siteContext) return
    const hasUserArterial = masterPlan.layers.roads.features.some((f) => f.properties?.userDrawn)
    if (hasUserArterial) return
    const hasBuildings =
      masterPlan.layers.residential.features.length > 0 ||
      masterPlan.layers.commercial.features.length > 0
    if (hasBuildings) return

    const repaired = applyOsmGeometryToPlan(masterPlan, boundary, prompt, siteContext)
    updateMasterPlan(repaired, false)
  }, [masterPlan, boundary, prompt, siteContext, updateMasterPlan])

  const cancelBoundaryDrawing = () => {
    resetDrawing()
    usePlannerStore.getState().setMapTool('select')
  }

  const useSampleBoundary = () => {
    const center = turf.point(BRISBANE_CENTER)
    const buffered = turf.buffer(center, 0.8, { units: 'kilometers', steps: 6 })
    if (buffered) {
      setBoundary(buffered as Feature<Polygon>)
      usePlannerStore.getState().setMapTool('select')
      mapRef.current?.fitBounds(turf.bbox(buffered) as [number, number, number, number], { padding: 60 })
    }
  }

  const isManualDrawTool = mapTool === 'draw-line' || mapTool === 'draw-polygon' || mapTool === 'draw-arterial'
  const isDrawingArterial = mapTool === 'draw-arterial' && drawPointCount > 0

  return (
    <div id="planner-map-container" className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <MapToolbar
        isDrawingBoundary={mapTool === 'draw-boundary' && drawPointCount > 0}
        isDrawingArterial={isDrawingArterial}
        onCompleteBoundary={completeBoundaryDrawing}
        onCompleteArterial={() => void completeArterialDrawing()}
        onCancelBoundary={cancelBoundaryDrawing}
        onCancelArterial={() => {
          resetDrawing()
          usePlannerStore.getState().setMapTool('select')
        }}
        onSampleArea={useSampleBoundary}
      />

      {!boundary && mapTool !== 'draw-boundary' && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-brand-teal-500/30 bg-brand-navy-800/90 px-4 py-2 text-xs text-slate-300 backdrop-blur-xl">
          <span>
            Select the <span className="text-brand-teal-400">pencil tool</span> to draw a planning boundary
          </span>
          <button
            type="button"
            onClick={useSampleBoundary}
            className="pointer-events-auto rounded-lg bg-brand-teal-600 px-2.5 py-1 font-medium text-white transition-colors hover:bg-brand-teal-500"
          >
            Use Sample Area
          </button>
        </div>
      )}

      {mapTool === 'draw-boundary' && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-brand-teal-500/30 bg-brand-navy-800/90 px-4 py-2 text-xs text-slate-300 backdrop-blur-xl">
          {drawPointCount === 0
            ? 'Click on the map to place boundary points (min. 3)'
            : `${drawPointCount} point${drawPointCount !== 1 ? 's' : ''} · double-click or press Done to close boundary`}
        </div>
      )}

      {mapTool === 'draw-arterial' && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-stone-500/40 bg-brand-navy-800/90 px-4 py-2 text-xs text-slate-300 backdrop-blur-xl">
          {drawPointCount === 0
            ? 'Click to trace a major arterial — AI will adapt the plan around it'
            : `${drawPointCount} point${drawPointCount !== 1 ? 's' : ''} · double-click or press Done to adapt plan`}
        </div>
      )}

      {isManualDrawTool && mapTool !== 'draw-arterial' && (
        <div className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-brand-teal-500/15 bg-brand-navy-800/90 px-4 py-2 text-xs text-slate-300 backdrop-blur-xl">
          {masterPlan
            ? <>Click to add points · double-click to finish · drawing to <span className="text-brand-teal-400">{activeLayerId}</span></>
            : 'Generate a master plan first, then draw features onto its layers'}
        </div>
      )}

      {mapTool === 'erase' && masterPlan && (
        <div className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-red-500/30 bg-brand-navy-800/90 px-4 py-2 text-xs text-slate-300 backdrop-blur-xl">
          Click a feature to erase it
        </div>
      )}
    </div>
  )
}
