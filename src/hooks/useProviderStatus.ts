'use client'

import { useEffect } from 'react'
import { usePlannerStore } from '@/store/planner-store'
import type { ConfiguredProviderInfo } from '@/types/provider'

export function useProviderStatus() {
  const configuredProvider = usePlannerStore((s) => s.configuredProvider)
  const setConfiguredProvider = usePlannerStore((s) => s.setConfiguredProvider)

  useEffect(() => {
    void fetch('/api/provider')
      .then((r) => r.json())
      .then((data: ConfiguredProviderInfo) => setConfiguredProvider(data))
      .catch(() => {
        setConfiguredProvider({
          providerId: 'mock',
          providerLabel: 'Mock data',
          hasApiKey: false,
          geometryCapable: false,
        })
      })
  }, [setConfiguredProvider])

  return { configuredProvider }
}
