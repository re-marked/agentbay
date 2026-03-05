'use client'

import { useState, useRef, useEffect } from 'react'

interface LogEntry {
  id: number
  time: string
  type: 'request' | 'success' | 'error'
  data: unknown
}

const DEFAULTS = {
  url: 'http://localhost:8081',
  channel_id: '',
  sender_id: '',
  content: '',
  message_kind: 'text',
}

export default function TestRouterPage() {
  const [url, setUrl] = useState(DEFAULTS.url)
  const [channelId, setChannelId] = useState(DEFAULTS.channel_id)
  const [senderId, setSenderId] = useState(DEFAULTS.sender_id)
  const [content, setContent] = useState(DEFAULTS.content)
  const [messageKind, setMessageKind] = useState(DEFAULTS.message_kind)
  const [sending, setSending] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const logRef = useRef<HTMLDivElement>(null)
  let seq = useRef(0)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  function addLog(type: LogEntry['type'], data: unknown) {
    setLog((prev) => [
      ...prev,
      {
        id: ++seq.current,
        time: new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 }),
        type,
        data,
      },
    ])
  }

  async function handleSend() {
    if (!channelId || !senderId) return
    setSending(true)

    const payload = {
      channel_id: channelId,
      sender_id: senderId,
      content,
      message_kind: messageKind,
    }
    addLog('request', payload)

    try {
      const res = await fetch(`${url}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      addLog(res.ok ? 'success' : 'error', { status: res.status, ...json })
    } catch (err) {
      addLog('error', { error: err instanceof Error ? err.message : String(err) })
    } finally {
      setSending(false)
    }
  }

  async function handleHealthCheck() {
    addLog('request', { endpoint: 'GET /health' })
    try {
      const res = await fetch(`${url}/health`)
      const json = await res.json()
      addLog(res.ok ? 'success' : 'error', { status: res.status, ...json })
    } catch (err) {
      addLog('error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  const logColors: Record<LogEntry['type'], string> = {
    request: 'text-blue-400',
    success: 'text-emerald-400',
    error: 'text-red-400',
  }

  const logPrefixes: Record<LogEntry['type'], string> = {
    request: '→',
    success: '←',
    error: '✗',
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight font-mono">
          Router Test Console
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          POST /v1/messages → channel_messages
        </p>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: Form */}
        <div className="w-80 border-r border-zinc-800 p-5 flex flex-col gap-4 shrink-0">
          <Field label="Router URL" value={url} onChange={setUrl} mono />
          <Field label="channel_id" value={channelId} onChange={setChannelId} mono placeholder="uuid" />
          <Field label="sender_id" value={senderId} onChange={setSenderId} mono placeholder="uuid" />

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
              content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Hello from the test console"
              className="rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm font-mono
                         placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
              message_kind
            </label>
            <select
              value={messageKind}
              onChange={(e) => setMessageKind(e.target.value)}
              className="rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm font-mono
                         focus:outline-none focus:border-zinc-600 appearance-none"
            >
              {['text', 'tool_result', 'status', 'system', 'file'].map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSend}
              disabled={sending || !channelId || !senderId}
              className="flex-1 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800
                         disabled:text-zinc-600 px-4 py-2 text-sm font-medium transition-colors"
            >
              {sending ? 'Sending…' : 'Send Message'}
            </button>
            <button
              onClick={handleHealthCheck}
              className="rounded-md bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-sm
                         font-medium transition-colors text-zinc-400"
            >
              /health
            </button>
          </div>

          <button
            onClick={() => setLog([])}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors self-start"
          >
            Clear log
          </button>
        </div>

        {/* Right: Log */}
        <div
          ref={logRef}
          className="flex-1 p-5 overflow-y-auto font-mono text-xs leading-relaxed"
        >
          {log.length === 0 && (
            <p className="text-zinc-600 italic">
              Send a message or hit /health to see results here.
            </p>
          )}
          {log.map((entry) => (
            <div key={entry.id} className="mb-2">
              <span className="text-zinc-600">{entry.time}</span>
              {' '}
              <span className={logColors[entry.type]}>
                {logPrefixes[entry.type]}
              </span>
              {' '}
              <span className="text-zinc-300">
                {JSON.stringify(entry.data, null, 2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  mono,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  mono?: boolean
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm
                    placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600
                    ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}
