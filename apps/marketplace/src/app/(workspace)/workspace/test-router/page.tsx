'use client'

import { useState, useRef, useEffect } from 'react'

interface LogEntry {
  id: number
  time: string
  type: 'request' | 'success' | 'error'
  data: unknown
}

interface ChannelMessage {
  id: string
  sender_id: string
  content: string
  message_kind: string
  created_at: string
}

export default function TestRouterPage() {
  const [url, setUrl] = useState('http://localhost:8081')
  const [channelId, setChannelId] = useState('')
  const [senderId, setSenderId] = useState('')
  const [content, setContent] = useState('')
  const [messageKind, setMessageKind] = useState('text')
  const [sending, setSending] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [tab, setTab] = useState<'log' | 'history'>('log')
  const [history, setHistory] = useState<ChannelMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (logRef.current && tab === 'log') {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log, tab])

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
    setTab('log')

    try {
      const res = await fetch(`${url}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      addLog(res.ok ? 'success' : 'error', { status: res.status, ...json })
      if (res.ok) setContent('')
    } catch (err) {
      addLog('error', { error: err instanceof Error ? err.message : String(err) })
    } finally {
      setSending(false)
    }
  }

  async function handleHealthCheck() {
    addLog('request', { endpoint: 'GET /health' })
    setTab('log')
    try {
      const res = await fetch(`${url}/health`)
      const json = await res.json()
      addLog(res.ok ? 'success' : 'error', { status: res.status, ...json })
    } catch (err) {
      addLog('error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleLoadHistory(older = false) {
    if (!channelId) return
    setLoadingHistory(true)
    setTab('history')

    let endpoint = `${url}/v1/messages/${channelId}?limit=30`
    if (older && history.length > 0) {
      endpoint += `&before=${history[0].created_at}`
    }

    try {
      const res = await fetch(endpoint)
      const json = await res.json()
      if (res.ok) {
        if (older) {
          setHistory((prev) => [...json.messages, ...prev])
        } else {
          setHistory(json.messages)
        }
        setHasMore(json.has_more)
      } else {
        addLog('error', json)
        setTab('log')
      }
    } catch (err) {
      addLog('error', { error: err instanceof Error ? err.message : String(err) })
      setTab('log')
    } finally {
      setLoadingHistory(false)
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
          POST /v1/messages + GET /v1/messages/:channelId
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
              rows={3}
              placeholder="Hello from the test console"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
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
              {sending ? 'Sending…' : 'Send'}
            </button>
            <button
              onClick={() => handleLoadHistory()}
              disabled={!channelId || loadingHistory}
              className="rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900
                         disabled:text-zinc-700 px-3 py-2 text-sm font-medium transition-colors text-zinc-300"
            >
              {loadingHistory ? '…' : 'History'}
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
            onClick={() => { setLog([]); setHistory([]) }}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors self-start"
          >
            Clear all
          </button>
        </div>

        {/* Right: Tabs */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tab bar */}
          <div className="flex border-b border-zinc-800 px-5">
            {(['log', 'history'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition-colors ${
                  tab === t
                    ? 'border-blue-500 text-zinc-200'
                    : 'border-transparent text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {t}
                {t === 'history' && history.length > 0 && (
                  <span className="ml-1.5 text-zinc-500">({history.length})</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'log' ? (
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
                  <span className={logColors[entry.type]}>{logPrefixes[entry.type]}</span>
                  {' '}
                  <span className="text-zinc-300 whitespace-pre-wrap">
                    {JSON.stringify(entry.data, null, 2)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-1">
              {hasMore && (
                <button
                  onClick={() => handleLoadHistory(true)}
                  disabled={loadingHistory}
                  className="self-center text-xs text-blue-400 hover:text-blue-300 mb-2"
                >
                  {loadingHistory ? 'Loading…' : 'Load older messages'}
                </button>
              )}
              {history.length === 0 && !loadingHistory && (
                <p className="text-zinc-600 italic text-xs font-mono">
                  No messages. Click History to fetch.
                </p>
              )}
              {history.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-md bg-zinc-900/60 border border-zinc-800/50 px-3 py-2 font-mono text-xs"
                >
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="text-zinc-500 text-[10px]">
                      {new Date(msg.created_at).toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                    <span className="text-amber-400/80 text-[10px] truncate max-w-[140px]" title={msg.sender_id}>
                      {msg.sender_id.slice(0, 8)}
                    </span>
                    {msg.message_kind !== 'text' && (
                      <span className="text-zinc-600 text-[10px]">[{msg.message_kind}]</span>
                    )}
                  </div>
                  <div className="text-zinc-200 whitespace-pre-wrap break-words">
                    {msg.content || <span className="text-zinc-600 italic">empty</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
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
