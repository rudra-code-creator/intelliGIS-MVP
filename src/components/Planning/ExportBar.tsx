'use client'

import { usePlannerStore } from '@/store/planner-store'
import { Button } from '@/components/ui/button'
import { Download, FileJson, FileImage, Printer, FileText } from 'lucide-react'
import html2canvas from 'html2canvas'

export function ExportBar() {
  const masterPlan = usePlannerStore((s) => s.masterPlan)
  const boundary = usePlannerStore((s) => s.boundary)

  const exportJson = () => {
    if (!masterPlan) return
    const data = JSON.stringify({ boundary, masterPlan }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'intelligis-master-plan.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPng = async () => {
    const mapEl = document.getElementById('planner-map-container')
    if (!mapEl) return
    const canvas = await html2canvas(mapEl, { useCORS: true, backgroundColor: '#050b18' })
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = 'intelligis-master-plan.png'
    a.click()
  }

  const exportPdf = () => {
    alert('PDF export coming soon — use Export PNG or JSON for now.')
  }

  const printPlan = () => {
    window.print()
  }

  return (
    <div className="flex items-center gap-2 border-b border-brand-teal-500/10 px-4 py-2">
      <Button variant="outline" size="sm" disabled={!masterPlan} onClick={() => void exportPng()}>
        <FileImage className="h-3.5 w-3.5" />
        Export PNG
      </Button>
      <Button variant="outline" size="sm" disabled={!masterPlan} onClick={exportJson}>
        <FileJson className="h-3.5 w-3.5" />
        Export JSON
      </Button>
      <Button variant="outline" size="sm" disabled={!masterPlan} onClick={exportPdf}>
        <FileText className="h-3.5 w-3.5" />
        Export PDF
      </Button>
      <Button variant="outline" size="sm" disabled={!masterPlan} onClick={printPlan}>
        <Printer className="h-3.5 w-3.5" />
        Print
      </Button>
      <div className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500">
        <Download className="h-3 w-3" />
        Export tools
      </div>
    </div>
  )
}
