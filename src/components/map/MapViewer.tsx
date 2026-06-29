import { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import type { BasemapStyle, MapLayer } from '@/types/gis'
import { BASEMAP_STYLES } from '@/utils/map-utils'

export type MeasureMode = 'none' | 'distance' | 'area'

interface MapViewerProps {
  layers: MapLayer[]
  basemap: BasemapStyle
  measureMode: MeasureMode
  onMeasureComplete?: (result: { type: 'distance' | 'area'; value: number; coordinates: [number, number][] }) => void
  flyTo?: { lng: number; lat: number; zoom?: number; bbox?: [number, number, number, number] } | null
}

export function MapViewer({ layers, basemap, measureMode, onMeasureComplete, flyTo }: MapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const measureCoordsRef = useRef<[number, number][]>([])
  const measureModeRef = useRef(measureMode)

  useEffect(() => {
    measureModeRef.current = measureMode
    measureCoordsRef.current = []
  }, [measureMode])

  const syncLayers = useCallback((map: maplibregl.Map, layerList: MapLayer[]) => {
    const existingIds = new Set(
      map.getStyle().layers?.map((l) => l.id).filter((id) => id.startsWith('layer-')) ?? [],
    )
    const newIds = new Set(layerList.map((l) => `layer-${l.id}`))

    existingIds.forEach((id) => {
      if (!newIds.has(id)) {
        if (map.getLayer(id)) map.removeLayer(id)
        const sourceId = id.replace('layer-', 'source-')
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      }
    })

    layerList.forEach((layer) => {
      const sourceId = `source-${layer.id}`
      const layerId = `layer-${layer.id}`

      if (!layer.geojson || !layer.visible) {
        if (map.getLayer(layerId)) map.removeLayer(layerId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
        return
      }

      const geojson = layer.geojson as FeatureCollection

      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson)
      } else {
        map.addSource(sourceId, { type: 'geojson', data: geojson })
      }

      const paint = {
        'fill-color': layer.color,
        'fill-opacity': layer.opacity * 0.5,
        'line-color': layer.color,
        'line-width': 2,
        'line-opacity': layer.opacity,
        'circle-color': layer.color,
        'circle-radius': 6,
        'circle-opacity': layer.opacity,
      }

      if (!map.getLayer(layerId)) {
        const types = new Set(geojson.features.map((f) => f.geometry?.type))

        if (types.has('Polygon') || types.has('MultiPolygon')) {
          map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: { 'fill-color': paint['fill-color'], 'fill-opacity': paint['fill-opacity'] },
          })
          map.addLayer({
            id: `${layerId}-outline`,
            type: 'line',
            source: sourceId,
            paint: { 'line-color': paint['line-color'], 'line-width': paint['line-width'], 'line-opacity': paint['line-opacity'] },
          })
        } else if (types.has('LineString') || types.has('MultiLineString')) {
          map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: { 'line-color': paint['line-color'], 'line-width': paint['line-width'], 'line-opacity': paint['line-opacity'] },
          })
        } else {
          map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            paint: { 'circle-color': paint['circle-color'], 'circle-radius': paint['circle-radius'], 'circle-opacity': paint['circle-opacity'] },
          })
        }
      } else {
        const layerType = map.getLayer(layerId)?.type
        if (layerType === 'fill') {
          map.setPaintProperty(layerId, 'fill-color', layer.color)
          map.setPaintProperty(layerId, 'fill-opacity', layer.opacity * 0.5)
        } else if (layerType === 'line') {
          map.setPaintProperty(layerId, 'line-color', layer.color)
          map.setPaintProperty(layerId, 'line-opacity', layer.opacity)
        } else if (layerType === 'circle') {
          map.setPaintProperty(layerId, 'circle-color', layer.color)
          map.setPaintProperty(layerId, 'circle-opacity', layer.opacity)
        }
      }
    })
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLES.streets.url,
      center: [151.2093, -33.8688],
      zoom: 10,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    map.on('click', (e) => {
      const mode = measureModeRef.current
      if (mode === 'none') return

      const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      measureCoordsRef.current.push(coord)

      if (mode === 'distance' && measureCoordsRef.current.length >= 2) {
        const coords = [...measureCoordsRef.current]
        let total = 0
        for (let i = 1; i < coords.length; i++) {
          const [lng1, lat1] = coords[i - 1]
          const [lng2, lat2] = coords[i]
          const R = 6371
          const dLat = ((lat2 - lat1) * Math.PI) / 180
          const dLng = ((lng2 - lng1) * Math.PI) / 180
          const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
          total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        }
        onMeasureComplete?.({ type: 'distance', value: total, coordinates: coords })
        measureCoordsRef.current = []
      }

      if (mode === 'area' && measureCoordsRef.current.length >= 3) {
        const coords = [...measureCoordsRef.current, measureCoordsRef.current[0]]
        let area = 0
        const R = 6371
        for (let i = 0; i < coords.length - 1; i++) {
          const [lng1, lat1] = coords[i]
          const [lng2, lat2] = coords[i + 1]
          area += ((lng2 - lng1) * Math.PI) / 180 * (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180))
        }
        onMeasureComplete?.({ type: 'area', value: Math.abs((area * R * R) / 2), coordinates: measureCoordsRef.current })
        measureCoordsRef.current = []
      }
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [onMeasureComplete])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(BASEMAP_STYLES[basemap].url)
    map.once('style.load', () => syncLayers(map, layers))
  }, [basemap, layers, syncLayers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    syncLayers(map, layers)
  }, [layers, syncLayers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return

    if (flyTo.bbox) {
      map.fitBounds(
        [[flyTo.bbox[0], flyTo.bbox[1]], [flyTo.bbox[2], flyTo.bbox[3]]],
        { padding: 50, duration: 1500 },
      )
    } else {
      map.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom ?? 12, duration: 1500 })
    }
  }, [flyTo])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const visibleLayers = layers.filter((l) => l.visible && l.summary?.boundingBox)
    if (visibleLayers.length === 0) return

    const bounds = new maplibregl.LngLatBounds()
    visibleLayers.forEach((layer) => {
      const bbox = layer.summary?.boundingBox
      if (bbox) {
        bounds.extend([bbox.minLng, bbox.minLat])
        bounds.extend([bbox.maxLng, bbox.maxLat])
      }
    })

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 1000 })
    }
  }, [layers.length])

  return <div ref={containerRef} className="h-full w-full" />
}
