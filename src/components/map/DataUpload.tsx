import { useCallback, useState } from 'react'
import { Upload, FileJson, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = '.geojson,.json,.csv,.kml,.gpx,.zip'

interface DataUploadProps {
  onUpload: (files: File[]) => Promise<void>
  isUploading?: boolean
}

export function DataUpload({ onUpload, isUploading }: DataUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null)
      const fileArray = Array.from(files)
      if (fileArray.length === 0) return

      try {
        await onUpload(fileArray)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    },
    [onUpload],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      void handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Upload className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Drop geospatial files here</p>
          <p className="mt-1 text-xs text-muted-foreground">
            GeoJSON, CSV, KML, GPX, or ZIP Shapefiles
          </p>
        </div>
        <label>
          <Button variant="outline" size="sm" disabled={isUploading} asChild>
            <span>
              <FileJson className="mr-2 h-4 w-4" />
              {isUploading ? 'Uploading...' : 'Browse files'}
            </span>
          </Button>
          <input
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={(e) => e.target.files && void handleFiles(e.target.files)}
            disabled={isUploading}
          />
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
