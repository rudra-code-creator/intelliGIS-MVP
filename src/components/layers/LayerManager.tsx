import { useState } from 'react'
import {
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  GripVertical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { MapLayer } from '@/types/gis'
import { formatBytes } from '@/lib/utils'

interface LayerManagerProps {
  layers: MapLayer[]
  onToggleVisibility: (id: string, visible: boolean) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onOpacityChange: (id: string, opacity: number) => void
  onColorChange: (id: string, color: string) => void
}

export function LayerManager({
  layers,
  onToggleVisibility,
  onRename,
  onDelete,
  onOpacityChange,
  onColorChange,
}: LayerManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const startEdit = (layer: MapLayer) => {
    setEditingId(layer.id)
    setEditName(layer.name)
  }

  const saveEdit = (id: string) => {
    if (editName.trim()) onRename(id, editName.trim())
    setEditingId(null)
  }

  if (layers.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No layers yet. Upload a dataset to get started.
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-3">
        {layers.map((layer) => (
          <div key={layer.id} className="glass-panel space-y-3 p-3">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
              {editingId === layer.id ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => saveEdit(layer.id)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit(layer.id)}
                  className="h-7 text-sm"
                  autoFocus
                />
              ) : (
                <span className="flex-1 truncate text-sm font-medium">{layer.name}</span>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onToggleVisibility(layer.id, !layer.visible)}>
                {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(layer)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(layer.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="color"
                value={layer.color}
                onChange={(e) => onColorChange(layer.id, e.target.value)}
                className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent"
                title="Layer color"
              />
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Opacity</span>
                  <span>{Math.round(layer.opacity * 100)}%</span>
                </div>
                <Slider
                  value={[layer.opacity * 100]}
                  onValueChange={([v]) => onOpacityChange(layer.id, v / 100)}
                  max={100}
                  step={1}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{layer.featureCount} features</span>
              <span>·</span>
              <span>{formatBytes(layer.fileSize)}</span>
              <span>·</span>
              <span className="uppercase">{layer.fileType}</span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
