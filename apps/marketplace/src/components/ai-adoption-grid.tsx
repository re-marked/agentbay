'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

const TOTAL = 2500
const COLS = 50
const ROWS = TOTAL / COLS

const CODING = 1
const PAYING = 6
const FREE_CHAT = 401

const COLOR_NEVER = 'hsl(30 3% 22%)'
const COLOR_FREE = 'hsl(160 50% 42%)'
const COLOR_PAYING = 'hsl(45 80% 55%)'
const COLOR_CODING = 'hsl(0 65% 52%)'

type Category = 'never' | 'free' | 'paying' | 'coding'

function getCategory(index: number): Category {
  const fromEnd = TOTAL - 1 - index
  if (fromEnd < CODING) return 'coding'
  if (fromEnd < CODING + PAYING) return 'paying'
  if (fromEnd < CODING + PAYING + FREE_CHAT) return 'free'
  return 'never'
}

function getColor(cat: Category): string {
  switch (cat) {
    case 'coding': return COLOR_CODING
    case 'paying': return COLOR_PAYING
    case 'free': return COLOR_FREE
    case 'never': return COLOR_NEVER
  }
}

const CAT_INFO: Record<Category, { label: string; count: string; pct: string }> = {
  never: { label: 'Never used AI', count: '~6.8B', pct: '84%' },
  free: { label: 'Free chatbot user', count: '~1.3B', pct: '16%' },
  paying: { label: 'Pays $20/mo for AI', count: '~15-25M', pct: '~0.3%' },
  coding: { label: 'Uses coding scaffold', count: '~2-5M', pct: '~0.04%' },
}

const LEGEND_ORDER: Category[] = ['never', 'free', 'paying', 'coding']

// Lerp for smooth number transitions
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function AiAdoptionGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [hoveredCat, setHoveredCat] = useState<Category | null>(null)
  const [tooltipCat, setTooltipCat] = useState<Category | null>(null)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 })
  const animProgress = useRef(0)
  const animRaf = useRef(0)
  const visible = useRef(false)

  // Smooth cursor tracking
  const mousePos = useRef({ x: 0, y: 0 })
  const smoothPos = useRef({ x: 0, y: 0 })
  const rawCat = useRef<Category | null>(null)

  // Smooth opacity per category (0-1, lerped each frame)
  const catOpacity = useRef<Record<Category, number>>({
    never: 1, free: 1, paying: 1, coding: 1,
  })

  const gap = 2
  const maxWidth = Math.min(dimensions.w, 900)
  const dotSize = maxWidth > 0 ? Math.max(2, (maxWidth - (COLS - 1) * gap) / COLS) : 0
  const gridH = ROWS * (dotSize + gap) - gap
  const gridW = COLS * (dotSize + gap) - gap

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf: number
    const check = () => {
      const rect = el.getBoundingClientRect()
      if (rect.top < window.innerHeight * 0.9 && rect.bottom > 0) {
        visible.current = true
      } else {
        raf = requestAnimationFrame(check)
      }
    }
    raf = requestAnimationFrame(check)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Main render loop — handles fill animation, smooth opacity transitions, smooth cursor
  useEffect(() => {
    const animate = () => {
      const canvas = canvasRef.current
      if (!canvas || dotSize === 0) {
        animRaf.current = requestAnimationFrame(animate)
        return
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        animRaf.current = requestAnimationFrame(animate)
        return
      }

      // Fill animation
      if (visible.current && animProgress.current < 1) {
        animProgress.current = Math.min(1, animProgress.current + 0.015)
      }

      // Smooth cursor position (heavy lerp = very smooth)
      smoothPos.current.x = lerp(smoothPos.current.x, mousePos.current.x, 0.08)
      smoothPos.current.y = lerp(smoothPos.current.y, mousePos.current.y, 0.08)

      // Smooth opacity transitions per category
      const hovered = rawCat.current
      const lerpSpeed = 0.04 // very slow blend
      for (const cat of LEGEND_ORDER) {
        const target = hovered === null ? 1 : (cat === hovered ? 1 : 0.12)
        catOpacity.current[cat] = lerp(catOpacity.current[cat], target, lerpSpeed)
      }

      // Update React state for tooltip (throttled via rAF)
      if (hovered !== tooltipCat) {
        setTooltipCat(hovered)
      }

      // Draw
      const dpr = window.devicePixelRatio || 1
      canvas.width = gridW * dpr
      canvas.height = gridH * dpr
      canvas.style.width = `${gridW}px`
      canvas.style.height = `${gridH}px`
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, gridW, gridH)

      const dotsToShow = Math.floor(animProgress.current * TOTAL)
      const radius = Math.max(1, dotSize * 0.15)

      for (let i = 0; i < TOTAL; i++) {
        const row = Math.floor(i / COLS)
        const col = i % COLS
        const x = col * (dotSize + gap)
        const y = row * (dotSize + gap)
        const cat = getCategory(i)
        const show = i < dotsToShow

        ctx.beginPath()
        ctx.roundRect(x, y, dotSize, dotSize, radius)

        if (!show) {
          ctx.fillStyle = 'hsl(30 3% 13%)'
          ctx.globalAlpha = 1
        } else {
          ctx.fillStyle = getColor(cat)
          ctx.globalAlpha = catOpacity.current[cat]
        }

        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Position tooltip element directly (bypass React for smoothness)
      const tip = tooltipRef.current
      const container = containerRef.current
      if (tip && container) {
        const cr = container.getBoundingClientRect()
        const tx = smoothPos.current.x - cr.left
        const ty = smoothPos.current.y - cr.top - 16
        tip.style.left = `${tx}px`
        tip.style.top = `${ty}px`
      }

      animRaf.current = requestAnimationFrame(animate)
    }

    animRaf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRaf.current)
  }, [dotSize, gridH, gridW, tooltipCat])

  const handleMouse = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    mousePos.current = { x: e.clientX, y: e.clientY }

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const col = Math.floor(x / (dotSize + gap))
    const row = Math.floor(y / (dotSize + gap))

    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
      const idx = row * COLS + col
      rawCat.current = getCategory(idx)
      setTooltipVisible(true)
    } else {
      rawCat.current = null
      setTooltipVisible(false)
    }
  }, [dotSize])

  const handleLeave = useCallback(() => {
    rawCat.current = null
    setTooltipVisible(false)
    setHoveredCat(null)
  }, [])

  // Sync hoveredCat for legend (from tooltipCat)
  useEffect(() => {
    setHoveredCat(tooltipCat)
  }, [tooltipCat])

  return (
    <div ref={containerRef} className="relative w-full max-w-5xl mx-auto">
      <h2 className="mb-2 text-4xl font-medium tracking-tight sm:text-5xl">
        Each dot is <span className="bg-gradient-to-r from-gradient-from to-gradient-to bg-clip-text text-transparent">~3.2 million</span> people
      </h2>

      <p className="mb-8 text-sm text-muted-foreground">
        2,500 dots = 8.1 billion humans. Color = most advanced AI interaction, Feb 2026.
      </p>

      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouse}
          onMouseLeave={handleLeave}
          className="cursor-crosshair"
          style={{ width: gridW || 'auto', height: gridH || 'auto' }}
        />
      </div>

      {/* Tooltip — positioned via rAF, not React state */}
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full"
        style={{ opacity: tooltipVisible && tooltipCat ? 1 : 0, transition: 'opacity 0.3s ease' }}
      >
        {tooltipCat && (
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-card/95 px-3 py-2 shadow-xl backdrop-blur-md">
            <div
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: getColor(tooltipCat) }}
            />
            <span className="whitespace-nowrap text-xs font-medium text-foreground">
              {CAT_INFO[tooltipCat].label}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {CAT_INFO[tooltipCat].count} ({CAT_INFO[tooltipCat].pct})
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-3">
        {LEGEND_ORDER.map((cat) => {
          const info = CAT_INFO[cat]
          return (
            <div
              key={cat}
              className="flex items-center gap-2.5 text-sm"
              style={{
                opacity: hoveredCat && hoveredCat !== cat ? 0.3 : 1,
                transition: 'opacity 0.6s ease',
              }}
              onMouseEnter={() => { rawCat.current = cat; setHoveredCat(cat) }}
              onMouseLeave={() => { rawCat.current = null; setHoveredCat(null) }}
            >
              <div
                className="size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: getColor(cat) }}
              />
              <span className="text-muted-foreground">{info.label}</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium text-foreground">{info.count}</span>
              <span className="text-muted-foreground/60">({info.pct})</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
