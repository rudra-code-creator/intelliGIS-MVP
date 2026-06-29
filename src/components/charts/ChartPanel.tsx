import { useState } from 'react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { BarChart3 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ChartType, MapLayer } from '@/types/gis'

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']

interface ChartPanelProps {
  layers: MapLayer[]
}

export function ChartPanel({ layers }: ChartPanelProps) {
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [selectedField, setSelectedField] = useState<string>('')

  const numericFields = layers.flatMap((layer) =>
    (layer.summary?.attributes ?? [])
      .filter((a) => a.type === 'number')
      .map((a) => ({ layerId: layer.id, layerName: layer.name, field: a.name })),
  )

  const activeField = selectedField || numericFields[0]?.field || ''
  const activeLayer = layers.find((l) =>
    l.geojson?.features.some((f) => f.properties && activeField in (f.properties ?? {})),
  )

  const chartData = (() => {
    if (!activeLayer?.geojson || !activeField) return []

    const values = activeLayer.geojson.features
      .map((f) => Number(f.properties?.[activeField]))
      .filter((v) => !Number.isNaN(v))

    if (chartType === 'histogram') {
      const min = Math.min(...values)
      const max = Math.max(...values)
      const bins = 8
      const step = (max - min) / bins || 1
      const counts = Array.from({ length: bins }, (_, i) => ({
        name: `${(min + i * step).toFixed(1)}`,
        value: 0,
      }))
      values.forEach((v) => {
        const idx = Math.min(Math.floor((v - min) / step), bins - 1)
        counts[idx].value += 1
      })
      return counts
    }

    if (chartType === 'pie') {
      const grouped = new Map<string, number>()
      values.forEach((v) => {
        const key = String(v)
        grouped.set(key, (grouped.get(key) ?? 0) + 1)
      })
      return [...grouped.entries()].slice(0, 8).map(([name, value]) => ({ name, value }))
    }

    return values.slice(0, 20).map((v, i) => ({ name: `#${i + 1}`, value: v }))
  })()

  if (numericFields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Upload data with numeric attributes to generate charts.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap gap-2">
        <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bar">Bar</SelectItem>
            <SelectItem value="pie">Pie</SelectItem>
            <SelectItem value="line">Line</SelectItem>
            <SelectItem value="histogram">Histogram</SelectItem>
          </SelectContent>
        </Select>

        <Select value={activeField} onValueChange={setSelectedField}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Select field" />
          </SelectTrigger>
          <SelectContent>
            {numericFields.map((f) => (
              <SelectItem key={`${f.layerId}-${f.field}`} value={f.field}>
                {f.field}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'pie' ? (
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          ) : chartType === 'line' ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
