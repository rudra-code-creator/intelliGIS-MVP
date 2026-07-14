export type RoadClass = 'arterial' | 'collector' | 'local' | 'cul-de-sac'

const STREET_NAMES = [
  'Albert', 'George', 'Victoria', 'Brisbane', 'Kingsford', 'Riverside', 'Harbour',
  'Creek', 'Park', 'Station', 'Market', 'Garden', 'College', 'Mill', 'Bridge',
  'Summit', 'Valley', 'Bay', 'Meadow', 'Orchard', 'Wattle', 'Banksia', 'Fig',
  'Mangrove', 'Corso', 'Promenade', 'Terrace', 'Grove', 'Heights', 'Quay',
]

const TYPE_BY_CLASS: Record<RoadClass, string[]> = {
  arterial: ['Avenue', 'Boulevard', 'Highway', 'Parade'],
  collector: ['Road', 'Drive', 'Way', 'Street'],
  local: ['Street', 'Lane', 'Circuit', 'Row'],
  'cul-de-sac': ['Close', 'Court', 'Crescent', 'Place', 'Grove'],
}

export function generateRoadName(roadClass: RoadClass, index: number, used: Set<string>): string {
  const base = STREET_NAMES[index % STREET_NAMES.length]
  const types = TYPE_BY_CLASS[roadClass]
  const type = types[index % types.length]

  let candidate = `${base} ${type}`
  let suffix = 1
  while (used.has(candidate.toLowerCase())) {
    suffix += 1
    candidate = `${base} ${type} ${suffix}`
  }
  used.add(candidate.toLowerCase())
  return candidate
}

export function roadWidthMeters(roadClass: RoadClass): number {
  switch (roadClass) {
    case 'arterial':
      return 28
    case 'collector':
      return 18
    case 'local':
      return 11
    case 'cul-de-sac':
      return 7
    default: {
      const _exhaustive: never = roadClass
      return _exhaustive
    }
  }
}
