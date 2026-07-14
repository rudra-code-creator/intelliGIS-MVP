import { v4 as uuid } from 'uuid'
import type { TimelinePhase } from '@/types/master-plan'

export function buildSummary(areaSqM: number, prompt: string) {
  const areaHa = areaSqM / 10000
  const densityFactor = prompt.toLowerCase().includes('cbd') ? 1.4 : prompt.toLowerCase().includes('affordable') ? 0.9 : 1.1
  const greenFactor = prompt.toLowerCase().includes('green') || prompt.toLowerCase().includes('net zero') ? 1.35 : 1.0
  const transitFactor = prompt.toLowerCase().includes('transit') ? 1.3 : 1.0

  const population = Math.round(areaHa * 420 * densityFactor)
  const jobs = Math.round(population * 0.45)
  const greenPct = Math.min(45, Math.round(22 * greenFactor))
  const walkability = Math.min(98, Math.round(72 + greenPct * 0.3))
  const transitScore = Math.min(95, Math.round(65 * transitFactor))
  const cost = areaHa * 12_500_000 * densityFactor

  return {
    populationCapacity: population,
    estimatedJobs: jobs,
    greenSpacePercent: greenPct,
    walkabilityScore: walkability,
    transitAccessibility: transitScore,
    carbonImpact: prompt.toLowerCase().includes('net zero') ? '-42% vs baseline' : '-18% vs baseline',
    developmentCost: `$${(cost / 1_000_000_000).toFixed(1)}B AUD`,
    constructionPhases: ['Infrastructure', 'Transit', 'Housing', 'Commercial'],
    narrative: `This conceptual master plan responds to "${prompt}" across ${areaHa.toFixed(0)} hectares, balancing density, mobility, and public realm quality for Brisbane's urban context.`,
  }
}

export function buildTimeline(prompt: string): TimelinePhase[] {
  const isWaterfront = prompt.toLowerCase().includes('waterfront')
  return [
    { id: uuid(), phase: 1, title: 'Infrastructure', description: 'Utilities, drainage, and foundational road network', duration: isWaterfront ? '18 months' : '12 months' },
    { id: uuid(), phase: 2, title: 'Transit', description: 'Bus rapid transit corridors and cycle superhighways', duration: '24 months' },
    { id: uuid(), phase: 3, title: 'Housing', description: 'Medium-density residential and affordable dwellings', duration: '36 months' },
    { id: uuid(), phase: 4, title: 'Commercial', description: 'Mixed-use activation and community facilities', duration: '48 months' },
  ]
}
