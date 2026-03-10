'use client'

import { useState, useRef, useEffect } from 'react'
import { useDebug, type DebugEvent } from './debug-provider'
import { Bug, X, Trash2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'

const CAT_COLORS: Record<string, string> = {
  realtime: 'text-emerald-400',
  stream: 'text-sky-400',
  ws: 'text-violet-400',
  api: 'text-amber-400',
  message: 'text-blue-400',
  error: 'text-red-400',
  info: 'text-zinc-400',
  nav: 'text-pink-400',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="p-0.5 hover:bg-white/10 rounded transition-colors"
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-zinc-500" />}
    </button>
  )
}

function EventRow({ event }: { event: DebugEvent }) {
  const [expanded, setExpanded] = useState(false)
  const time = new Date(event.ts)
  const ts = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="font-mono text-[11px] leading-relaxed border-b border-white/5 py-0.5 px-2 hover:bg-white/5">
      <div className="flex items-start gap-2">
        <span className="text-zinc-600 shrink-0 tabular-nums">{ts}</span>
        <span className={`shrink-0 font-bold uppercase w-16 ${CAT_COLORS[event.cat] ?? 'text-zinc-400'}`}>
          {event.cat}
        </span>
        <span className="text-zinc-300 flex-1 break-all">{event.msg}</span>
        {event.data !== undefined && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 p-0.5 hover:bg-white/10 rounded"
          >
            {expanded ? <ChevronUp className="h-3 w-3 text-zinc-500" /> : <ChevronDown className="h-3 w-3 text-zinc-500" />}
          </button>
        )}
      </div>
      {expanded && event.data !== undefined && (
        <pre className="mt-1 ml-[6.5rem] text-[10px] text-zinc-500 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
          {typeof event.data === 'string' ? event.data : JSON.stringify(event.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function DebugPanel() {
  const { enabled, events, clearEvents, pageCtx } = useDebug()
  const [collapsed, setCollapsed] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll when new events arrive and panel is open
  useEffect(() => {
    if (!collapsed && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [events.length, collapsed])

  if (!enabled) return null

  const filteredEvents = filter ? events.filter(e => e.cat === filter) : events
  const ctxEntries = Object.entries(pageCtx).filter(([, v]) => v != null)

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono shadow-lg hover:bg-zinc-800 transition-colors"
      >
        <Bug className="h-3.5 w-3.5 text-amber-400" />
        <span>DEBUG</span>
        <span className="bg-zinc-700 text-zinc-400 rounded-full px-1.5 text-[10px]">{events.length}</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] flex flex-col bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-700 shadow-2xl max-h-[45vh]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <Bug className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs font-mono font-bold text-zinc-300">DEBUG</span>

        {/* Category filters */}
        <div className="flex gap-1 ml-3">
          {['realtime', 'stream', 'ws', 'api', 'message', 'error', 'info'].map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(filter === cat ? null : cat)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                filter === cat
                  ? 'bg-zinc-700 text-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <button type="button" onClick={clearEvents} className="p-1 hover:bg-zinc-800 rounded transition-colors" title="Clear">
          <Trash2 className="h-3.5 w-3.5 text-zinc-500" />
        </button>
        <button type="button" onClick={() => setCollapsed(true)} className="p-1 hover:bg-zinc-800 rounded transition-colors" title="Minimize">
          <X className="h-3.5 w-3.5 text-zinc-500" />
        </button>
      </div>

      {/* Page context bar */}
      {ctxEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-1.5 border-b border-zinc-800 shrink-0">
          {ctxEntries.map(([key, val]) => (
            <div
              key={key}
              className="flex items-center gap-1 bg-zinc-800 rounded px-1.5 py-0.5 text-[10px] font-mono"
            >
              <span className="text-zinc-500">{key}:</span>
              <span className="text-zinc-300 max-w-48 truncate">{val}</span>
              <CopyButton text={val!} />
            </div>
          ))}
        </div>
      )}

      {/* Event log */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredEvents.length === 0 ? (
          <div className="text-zinc-600 text-xs font-mono p-3">No events yet. Interact with the app to see debug output.</div>
        ) : (
          filteredEvents.map(e => <EventRow key={e.id} event={e} />)
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}
