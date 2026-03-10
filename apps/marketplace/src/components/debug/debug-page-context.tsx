'use client'

import { useEffect } from 'react'
import { useDebug } from './debug-provider'

/**
 * Rendered by server pages to push debug context into the panel.
 * Accepts a flat string map of key/value pairs.
 */
export function DebugPageContext({ data }: { data: Record<string, string | null> }) {
  const { enabled, setPageCtx, log } = useDebug()

  useEffect(() => {
    if (!enabled) return
    setPageCtx(data)
    log('nav', `Page context: ${Object.entries(data).filter(([,v]) => v).map(([k,v]) => `${k}=${v}`).join(', ')}`)
  }, [enabled, data, setPageCtx, log])

  return null
}
