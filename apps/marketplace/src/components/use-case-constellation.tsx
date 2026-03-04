'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

const USE_CASES = [
  'Summarize 50 emails',
  'Draft a pitch deck',
  'Monitor competitors',
  'Analyze spreadsheets',
  'Write blog posts',
  'Research any topic',
  'Automate reports',
  'Plan your week',
  'Generate invoices',
  'Proofread contracts',
  'Schedule meetings',
  'Transcribe calls',
  'Track expenses',
  'Design wireframes',
  'Write ad copy',
  'Audit your SEO',
  'Build a dashboard',
  'Create social posts',
  'Respond to reviews',
  'Prep for interviews',
  'File your taxes',
  'Translate documents',
  'Onboard new hires',
  'Debug your code',
  'Scrape market data',
  'Organize your files',
  'Draft legal briefs',
  'Manage inventory',
  'Forecast revenue',
  'Write newsletters',
  'Process refunds',
  'Update your CRM',
  'Create slide decks',
  'Summarize research',
  'Plan a product launch',
  'Write release notes',
  'Clean up datasets',
  'Generate test cases',
  'Moderate comments',
  'Track KPIs daily',
  'Compare vendors',
  'Draft proposals',
  'Review pull requests',
  'Extract PDF data',
  'Reply to support tickets',
  'Compile meeting notes',
  'Curate reading lists',
  'Score leads',
  'Create user personas',
  'Map customer journeys',
  'Benchmark performance',
  'Draft cold emails',
  'Write documentation',
  'Analyze sentiment',
  'Generate color palettes',
  'Outline a book',
  'Create meal plans',
  'Plan travel itineraries',
  'Write thank-you notes',
  'Prepare tax documents',
  'Set up automations',
  'Grade assignments',
  'Create workout plans',
  'Summarize podcasts',
  'Track habit streaks',
  'Write cover letters',
  'Optimize ad spend',
  'Build email sequences',
  'Analyze competitors',
  'Draft policy docs',
  'Create brand guidelines',
  'Map org structures',
]

interface Cell {
  text: string
  x: number
  y: number
  w: number
  h: number
  shimmerPhase: number
  shimmerSpeed: number
  row: number
}


function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

const CANVAS_H = 620
const LENS_RADIUS = 170
const DISPLACE_STRENGTH = 40
const BASE_FONT = 14
const MAX_FONT = 22
const CELL_H = 34
const CELL_PAD_X = 16
const GAP = 8

export function UseCaseConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 })
  const animRaf = useRef(0)
  const visible = useRef(false)
  const fadeIn = useRef(0)
  const time = useRef(0)

  const mouseRaw = useRef({ x: -9999, y: -9999 })
  const mouseSmooth = useRef({ x: -9999, y: -9999 })
  const mouseActive = useRef(false)
  const hoverStrength = useRef(0)

  const cells = useRef<Cell[]>([])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Recompute cell layout
  useEffect(() => {
    if (dimensions.w === 0) return
    const w = dimensions.w

    const offscreen = document.createElement('canvas')
    const octx = offscreen.getContext('2d')!
    octx.font = `500 ${BASE_FONT}px system-ui, -apple-system, sans-serif`

    const result: Cell[] = []
    let cx = 0
    let cy = 0
    let row = 0

    for (const text of USE_CASES) {
      const textW = octx.measureText(text).width
      const cellW = textW + CELL_PAD_X * 2

      if (cx + cellW > w && cx > 0) {
        cx = 0
        cy += CELL_H + GAP
        row++
      }

      result.push({
        text,
        x: cx,
        y: cy,
        w: cellW,
        h: CELL_H,
        shimmerPhase: Math.random() * Math.PI * 2,
        shimmerSpeed: 0.3 + Math.random() * 0.4,
        row,
      })
      cx += cellW + GAP
    }

    // Center each row horizontally
    const maxRow = row
    for (let r = 0; r <= maxRow; r++) {
      const rowCells = result.filter(c => c.row === r)
      if (rowCells.length === 0) continue
      const last = rowCells[rowCells.length - 1]
      const rowWidth = last.x + last.w - rowCells[0].x
      const offsetX = (w - rowWidth) / 2
      for (const cell of rowCells) {
        cell.x += offsetX
      }
    }

    // Center vertically
    const totalH = cy + CELL_H
    const offsetY = Math.max(0, (CANVAS_H - totalH) / 2)
    for (const cell of result) {
      cell.y += offsetY
    }

    cells.current = result
  }, [dimensions.w])

  // Visibility check
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

  // Animation loop
  useEffect(() => {
    const animate = () => {
      const canvas = canvasRef.current
      if (!canvas || dimensions.w === 0) {
        animRaf.current = requestAnimationFrame(animate)
        return
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        animRaf.current = requestAnimationFrame(animate)
        return
      }

      if (visible.current && fadeIn.current < 1) {
        fadeIn.current = Math.min(1, fadeIn.current + 0.012)
      }
      time.current += 0.01

      // Smooth hover
      hoverStrength.current = lerp(hoverStrength.current, mouseActive.current ? 1 : 0, 0.06)

      // Smooth cursor
      const cLerp = mouseActive.current ? 0.1 : 0.03
      mouseSmooth.current.x = lerp(mouseSmooth.current.x, mouseRaw.current.x, cLerp)
      mouseSmooth.current.y = lerp(mouseSmooth.current.y, mouseRaw.current.y, cLerp)

      const dpr = window.devicePixelRatio || 1
      const w = dimensions.w
      const h = CANVAS_H

      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)

      const mx = mouseSmooth.current.x
      const my = mouseSmooth.current.y
      const hs = hoverStrength.current


      // Draw cells
      for (let i = 0; i < cells.current.length; i++) {
        const cell = cells.current[i]
        const cellCx = cell.x + cell.w / 2
        const cellCy = cell.y + cell.h / 2

        const dx = cellCx - mx
        const dy = cellCy - my
        const dist = Math.hypot(dx, dy)

        const rawT = hs > 0.01 ? Math.max(0, 1 - dist / LENS_RADIUS) : 0
        const influence = smoothstep(rawT) * hs

        const fontSize = lerp(BASE_FONT, MAX_FONT, influence)

        // Fisheye displacement
        let drawX = cellCx
        let drawY = cellCy
        if (influence > 0.01 && dist > 1) {
          const pushDist = influence * DISPLACE_STRENGTH * (1 - rawT * 0.5)
          drawX += (dx / dist) * pushDist
          drawY += (dy / dist) * pushDist
        }

        // Idle drift
        const driftX = Math.sin(time.current * 0.4 + cell.shimmerPhase) * 1.2 * (1 - influence)
        const driftY = Math.cos(time.current * 0.3 + cell.shimmerPhase * 1.3) * 0.8 * (1 - influence)
        drawX += driftX
        drawY += driftY

        // Shimmer
        const shimmer = Math.sin(time.current * cell.shimmerSpeed + cell.shimmerPhase) * 0.04 + 0.04
        const baseAlpha = 0.13 + shimmer
        const alpha = lerp(baseAlpha, 0.95, influence) * fadeIn.current

        // Pill background
        if (influence > 0.08) {
          ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`
          const tw = ctx.measureText(cell.text).width
          const pillW = tw + fontSize * 1.2
          const pillH = fontSize * 2
          const pillR = pillH * 0.4

          ctx.beginPath()
          ctx.roundRect(drawX - pillW / 2, drawY - pillH / 2, pillW, pillH, pillR)
          ctx.fillStyle = `rgba(22, 20, 18, ${influence * 0.85 * fadeIn.current})`
          ctx.fill()
        }

        // Text
        ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`

        ctx.fillText(cell.text, drawX, drawY)
      }


      // Cursor dot
      if (hs > 0.01 && fadeIn.current > 0.2) {
        ctx.beginPath()
        ctx.arc(mx, my, 5, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * hs * fadeIn.current})`
        ctx.lineWidth = 1.5
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(mx, my, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * hs * fadeIn.current})`
        ctx.fill()
      }

      animRaf.current = requestAnimationFrame(animate)
    }

    animRaf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRaf.current)
  }, [dimensions])

  const handleMouse = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    mouseRaw.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
    mouseActive.current = true
  }, [])

  const handleLeave = useCallback(() => {
    mouseActive.current = false
  }, [])

  return (
    <div ref={containerRef} className="relative w-full max-w-7xl mx-auto">
      <h2 className="mb-2 text-center text-4xl font-medium tracking-tight sm:text-5xl lg:text-6xl">
        What can they{' '}
        <span className="bg-gradient-to-r from-gradient-from to-gradient-to bg-clip-text text-transparent">
          actually do?
        </span>
      </h2>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        Move your cursor to explore. Each phrase is a task your agents handle in seconds.
      </p>

      <canvas
        ref={canvasRef}
        onMouseMove={handleMouse}
        onMouseLeave={handleLeave}
        className="w-full cursor-none"
        style={{ height: CANVAS_H }}
      />
    </div>
  )
}
