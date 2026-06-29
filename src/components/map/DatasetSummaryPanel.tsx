import type { DatasetSummary } from '@/types/gis'
import { formatBytes } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DatasetSummaryPanelProps {
  summary: DatasetSummary | null
}

export function DatasetSummaryPanel({ summary }: DatasetSummaryPanelProps) {
  if (!summary) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Upload a dataset to see its summary.
      </div>
    )
  }

  return (
    <div className="space-y-3 p-3">
      <Card className="border-0 bg-muted/50 shadow-none">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">{summary.fileName}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Features" value={String(summary.featureCount)} />
          <Stat label="Size" value={formatBytes(summary.fileSize)} />
          <Stat label="CRS" value={summary.crs} className="col-span-2" />
          <Stat label="Geometry" value={summary.geometryTypes.join(', ')} className="col-span-2" />
          {summary.boundingBox && (
            <Stat
              label="Bounds"
              value={`${summary.boundingBox.minLat.toFixed(4)}, ${summary.boundingBox.minLng.toFixed(4)} → ${summary.boundingBox.maxLat.toFixed(4)}, ${summary.boundingBox.maxLng.toFixed(4)}`}
              className="col-span-2"
            />
          )}
        </CardContent>
      </Card>

      {summary.attributes.length > 0 && (
        <Card className="border-0 bg-muted/50 shadow-none">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm">Attributes ({summary.attributes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.attributes.slice(0, 10).map((attr) => (
              <div key={attr.name} className="flex items-center justify-between text-xs">
                <span className="font-medium">{attr.name}</span>
                <span className="text-muted-foreground">
                  {attr.type} · {attr.uniqueCount} unique
                  {attr.missingCount > 0 && ` · ${attr.missingCount} missing`}
                </span>
              </div>
            ))}
            {summary.attributes.length > 10 && (
              <p className="text-xs text-muted-foreground">+{summary.attributes.length - 10} more attributes</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
