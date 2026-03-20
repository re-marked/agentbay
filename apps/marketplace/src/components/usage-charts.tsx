"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  DailyCost,
  AgentBreakdown,
  TokenSplit,
  DailyCompute,
} from "@/lib/usage/actions"

// ─── API cost area chart ────────────────────────────────────────────────────

const costConfig = {
  cost: {
    label: "Est. API Cost",
    color: "oklch(var(--primary))",
  },
} satisfies ChartConfig

function CostAreaChart({ data }: { data: DailyCost[] }) {
  const hasData = data.some((d) => d.cost > 0)

  return (
    <Card className="border-0 col-span-full">
      <CardHeader>
        <CardTitle>Estimated API Cost</CardTitle>
        <CardDescription>Daily estimated cost based on token usage (30d)</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            No usage data yet. Start chatting with an agent!
          </div>
        ) : (
          <ChartContainer config={costConfig} className="h-[300px] w-full">
            <AreaChart
              data={data}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-cost)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-cost)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v: string) => {
                  const d = new Date(v + "T00:00:00")
                  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v: number) => `$${v}`}
                allowDecimals
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(v: string) => {
                      const d = new Date(v + "T00:00:00")
                      return d.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    }}
                    formatter={(value) => `$${Number(value).toFixed(4)}`}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="var(--color-cost)"
                fill="url(#costFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Token split pie chart ───────────────────────────────────────────────────

const tokenPieConfig = {
  "input-tokens": {
    label: "Input",
    color: "oklch(var(--primary))",
  },
  "output-tokens": {
    label: "Output",
    color: "oklch(var(--chart-2))",
  },
} satisfies ChartConfig

const PIE_COLORS = ["oklch(var(--primary))", "oklch(var(--chart-2))"]

function TokenPieChart({ data }: { data: TokenSplit[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <Card className="border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tokens</CardTitle>
        <CardDescription>Input vs output (30d)</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No token data
          </div>
        ) : (
          <ChartContainer config={tokenPieConfig} className="mx-auto h-[200px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                strokeWidth={2}
                stroke="oklch(var(--card))"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Per-agent bar chart ─────────────────────────────────────────────────────

const agentBarConfig = {
  cost: {
    label: "Est. Cost",
    color: "oklch(57.95% 0.2236 312.00)",
  },
} satisfies ChartConfig

function AgentBarChart({ data }: { data: AgentBreakdown[] }) {
  return (
    <Card className="border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">By Agent</CardTitle>
        <CardDescription>Est. API cost per agent (30d)</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No agent data
          </div>
        ) : (
          <ChartContainer config={agentBarConfig} className="h-[200px] w-full">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="agent"
                type="category"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={80}
                tick={{ fontSize: 12 }}
              />
              <XAxis type="number" hide />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => `$${Number(value).toFixed(4)}`}
                  />
                }
              />
              <Bar
                dataKey="cost"
                fill="var(--color-cost)"
                radius={[0, 4, 4, 0]}
                barSize={20}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Daily compute small area chart ──────────────────────────────────────────

const computeConfig = {
  seconds: {
    label: "Seconds",
    color: "oklch(76.67% 0.1581 68.45)",
  },
} satisfies ChartConfig

function ComputeAreaChart({ data }: { data: DailyCompute[] }) {
  const hasData = data.some((d) => d.seconds > 0)

  return (
    <Card className="border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Compute</CardTitle>
        <CardDescription>Daily compute time (30d)</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No compute data
          </div>
        ) : (
          <ChartContainer config={computeConfig} className="h-[200px] w-full">
            <AreaChart
              data={data}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="computeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-seconds)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-seconds)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v: string) => {
                  const d = new Date(v + "T00:00:00")
                  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(v: string) => {
                      const d = new Date(v + "T00:00:00")
                      return d.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                      })
                    }}
                    formatter={(value) => {
                      const s = Number(value)
                      if (s < 60) return `${Math.round(s)}s`
                      return `${(s / 60).toFixed(1)}m`
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="seconds"
                stroke="var(--color-seconds)"
                fill="url(#computeFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Composed export ────────────────────────────────────────────────────────

interface UsageChartsProps {
  dailyCost: DailyCost[]
  tokenSplit: TokenSplit[]
  agentBreakdown: AgentBreakdown[]
  dailyCompute: DailyCompute[]
}

export function UsageCharts({ dailyCost, tokenSplit, agentBreakdown, dailyCompute }: UsageChartsProps) {
  return (
    <>
      <div className="mb-8">
        <CostAreaChart data={dailyCost} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TokenPieChart data={tokenSplit} />
        <AgentBarChart data={agentBreakdown} />
        <ComputeAreaChart data={dailyCompute} />
      </div>
    </>
  )
}
