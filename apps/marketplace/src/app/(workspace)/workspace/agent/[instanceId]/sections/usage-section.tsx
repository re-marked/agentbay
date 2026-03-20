'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  DollarSign,
  Hash,
  Timer,
  MessageSquare,
} from 'lucide-react'
import { Area, AreaChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

// ── Types ────────────────────────────────────────────────────────────────

interface UsageEvent {
  date: string
  sessionId: string
  inputTokens: number
  outputTokens: number
  computeSeconds: number
  costUsd: number
}

interface DailyEntry {
  date: string
  cost: number
  tokens: number
  sessions: number
}

interface UsageData {
  summary: {
    totalCostUsd: number
    totalInputTokens: number
    totalOutputTokens: number
    totalComputeSeconds: number
    totalSessions: number
  }
  daily: DailyEntry[]
  events: UsageEvent[]
}

type Timeframe = '24h' | '7d' | '30d' | '90d'

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function formatDate(dateStr: string, isHourly: boolean = false): string {
  if (isHourly || dateStr.includes('T')) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Chart config ─────────────────────────────────────────────────────────

const costChartConfig = {
  cost: { label: 'Est. API Cost', color: 'oklch(var(--primary))' },
} satisfies ChartConfig

// ── Component ────────────────────────────────────────────────────────────

function buildDemoUsage(days: number): UsageData {
  const today = new Date()
  const daily: DailyEntry[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (days - 1 - i))
    const sessions = i < 5 ? 0 : [0, 1, 2, 1, 3, 2, 1, 0, 2, 3, 1, 2, 0, 1, 3, 2, 1, 4, 2, 1, 0, 2, 1, 3, 2][i % 25]
    const tokens = sessions * 4800
    return {
      date: d.toISOString().slice(0, 10),
      cost: parseFloat((sessions * 0.023).toFixed(4)),
      tokens,
      sessions,
    }
  })
  const events: UsageEvent[] = Array.from({ length: 18 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - Math.floor(i * 1.6))
    d.setHours(9 + (i % 10), i * 7 % 60, 0, 0)
    return {
      date: d.toISOString(),
      sessionId: `sess_demo_${i}`,
      inputTokens: 1800 + i * 340,
      outputTokens: 620 + i * 120,
      computeSeconds: 18 + i * 6,
      costUsd: parseFloat((0.012 + i * 0.004).toFixed(4)),
    }
  })
  const totalSessions = daily.reduce((s, d) => s + d.sessions, 0)
  const totalCostUsd = parseFloat(daily.reduce((s, d) => s + d.cost, 0).toFixed(4))
  return {
    summary: {
      totalCostUsd,
      totalInputTokens: events.reduce((s, e) => s + e.inputTokens, 0),
      totalOutputTokens: events.reduce((s, e) => s + e.outputTokens, 0),
      totalComputeSeconds: events.reduce((s, e) => s + e.computeSeconds, 0),
      totalSessions,
    },
    daily,
    events,
  }
}

export function UsageSection({ instanceId, testMode }: { instanceId: string; testMode?: boolean }) {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<Timeframe>('30d')

  useEffect(() => {
    if (testMode) {
      setData(buildDemoUsage(TIMEFRAME_DAYS[timeframe]))
      setLoading(false)
      return
    }
    async function fetch_() {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/agent/usage?instanceId=${instanceId}&days=${TIMEFRAME_DAYS[timeframe]}`
        )
        if (res.ok) setData(await res.json())
      } catch {
        // non-critical
      } finally {
        setLoading(false)
      }
    }
    fetch_()
  }, [instanceId, timeframe, testMode])

  const isHourly = timeframe === '24h'

  const dailySlice = useMemo(() => {
    if (!data) return []
    // For 24h the API returns 24 hourly entries; for others slice daily
    return isHourly ? data.daily : data.daily.slice(-TIMEFRAME_DAYS[timeframe])
  }, [data, timeframe, isHourly])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    )
  }

  if (!data) return <p className="text-sm text-muted-foreground">Failed to load usage data.</p>

  const s = data.summary

  return (
    <div className="space-y-6">
      {/* Header + timeframe */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Usage</h2>
        <TimeframeToggle value={timeframe} onChange={setTimeframe} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={DollarSign}
          label="Est. API Cost"
          value={`$${s.totalCostUsd.toFixed(2)}`}
          sub={`${s.totalSessions} sessions`}
        />
        <StatCard
          icon={Hash}
          label="Tokens"
          value={formatTokens(s.totalInputTokens + s.totalOutputTokens)}
          sub={`${formatTokens(s.totalInputTokens)} in · ${formatTokens(s.totalOutputTokens)} out`}
        />
        <StatCard
          icon={Timer}
          label="Compute"
          value={formatTime(s.totalComputeSeconds)}
        />
        <StatCard
          icon={MessageSquare}
          label="Sessions"
          value={String(s.totalSessions)}
        />
      </div>

      {/* Daily credits chart */}
      {dailySlice.length > 1 && (
        <div className="rounded-xl border border-border/40 bg-card/50 p-5">
          <p className="text-sm font-medium text-muted-foreground mb-3">{isHourly ? 'Hourly' : 'Daily'} Est. API Cost</p>
          <ChartContainer config={costChartConfig} className="h-40 w-full">
            <AreaChart data={dailySlice} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="oklch(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => formatDate(v, isHourly)}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis hide />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, payload) => {
                      const entry = payload?.[0]?.payload as DailyEntry | undefined
                      return entry ? formatDate(entry.date, isHourly) : ''
                    }}
                    formatter={(value) => `$${Number(value).toFixed(2)}`}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="oklch(var(--primary))"
                fill="url(#costGrad)"
                strokeWidth={2}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ChartContainer>
        </div>
      )}

      {/* Events table */}
      {data.events.length > 0 && (
        <EventsTable events={data.events} isHourly={isHourly} />
      )}
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────

function TimeframeToggle({
  value,
  onChange,
}: {
  value: Timeframe
  onChange: (tf: Timeframe) => void
}) {
  const options: Timeframe[] = ['24h', '7d', '30d', '90d']

  return (
    <div className="flex items-center rounded-lg bg-muted/50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            value === opt
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof DollarSign
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 px-5 py-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground/60" />
        <span className="text-2xl font-bold tracking-tight">{value}</span>
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground/60">{sub}</p>}
    </div>
  )
}

const EVENTS_PER_PAGE = 10

function EventsTable({ events, isHourly }: { events: UsageEvent[]; isHourly: boolean }) {
  const [page, setPage] = useState(1)
  const totalPages = Math.ceil(events.length / EVENTS_PER_PAGE)
  const paged = events.slice((page - 1) * EVENTS_PER_PAGE, page * EVENTS_PER_PAGE)

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 overflow-hidden flex flex-col">
      <div className="px-5 py-3 border-b border-border/40">
        <p className="text-sm font-medium text-muted-foreground">
          Recent Events
          <span className="ml-2 text-[11px] text-muted-foreground/50">{events.length} total</span>
        </p>
      </div>
      <ScrollArea className="h-[360px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
            <tr className="border-b border-border/30 text-muted-foreground">
              <th className="text-left px-5 py-2.5 font-medium">Date</th>
              <th className="text-right px-5 py-2.5 font-medium">Input</th>
              <th className="text-right px-5 py-2.5 font-medium">Output</th>
              <th className="text-right px-5 py-2.5 font-medium">Compute</th>
              <th className="text-right px-5 py-2.5 font-medium">Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((ev, i) => (
              <tr key={i} className="border-b border-border/20 last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-5 py-2.5 text-muted-foreground">{formatDate(ev.date, isHourly)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{formatTokens(ev.inputTokens)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{formatTokens(ev.outputTokens)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{formatTime(ev.computeSeconds)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">${ev.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
      {totalPages > 1 && (
        <div className="border-t border-border/40 px-5 py-2.5">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={page === 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={p === page}
                    onClick={() => setPage(p)}
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={page === totalPages ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}
