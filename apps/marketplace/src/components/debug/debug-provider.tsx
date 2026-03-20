'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

export interface DebugEvent {
  id: string
  ts: number
  cat: 'realtime' | 'stream' | 'ws' | 'api' | 'message' | 'error' | 'info' | 'nav'
  msg: string
  data?: unknown
}

interface DebugContextValue {
  enabled: boolean
  toggle: () => void
  log: (cat: DebugEvent['cat'], msg: string, data?: unknown) => void
  events: DebugEvent[]
  clearEvents: () => void
  /** Page-level context set by each page (channelId, instanceId, etc.) */
  pageCtx: Record<string, string | null>
  setPageCtx: (ctx: Record<string, string | null>) => void
}

const DebugContext = createContext<DebugContextValue>({
  enabled: false,
  toggle: () => {},
  log: () => {},
  events: [],
  clearEvents: () => {},
  pageCtx: {},
  setPageCtx: () => {},
})

export function useDebug() {
  return useContext(DebugContext)
}

const MAX_EVENTS = 500

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  const [events, setEvents] = useState<DebugEvent[]>([])
  const [pageCtx, setPageCtx] = useState<Record<string, string | null>>({})
  const counterRef = useRef(0)

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('agentbay_debug')
    if (stored === '1') setEnabled(true)

    // Also check URL param
    const url = new URL(window.location.href)
    if (url.searchParams.get('debug') === '1') {
      setEnabled(true)
      localStorage.setItem('agentbay_debug', '1')
    }
  }, [])

  // Keyboard shortcut: Ctrl+Shift+D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        setEnabled(prev => {
          const next = !prev
          localStorage.setItem('agentbay_debug', next ? '1' : '0')
          return next
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev
      localStorage.setItem('agentbay_debug', next ? '1' : '0')
      return next
    })
  }, [])

  const log = useCallback(
    (cat: DebugEvent['cat'], msg: string, data?: unknown) => {
      // Always console.log when enabled
      if (typeof window !== 'undefined' && localStorage.getItem('agentbay_debug') === '1') {
        const prefix = `[debug:${cat}]`
        if (data !== undefined) {
          console.log(prefix, msg, data)
        } else {
          console.log(prefix, msg)
        }
      }

      const id = `d${++counterRef.current}`
      setEvents(prev => {
        const next = [...prev, { id, ts: Date.now(), cat, msg, data }]
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
      })
    },
    [],
  )

  const clearEvents = useCallback(() => setEvents([]), [])

  return (
    <DebugContext.Provider value={{ enabled, toggle, log, events, clearEvents, pageCtx, setPageCtx }}>
      {children}
    </DebugContext.Provider>
  )
}
