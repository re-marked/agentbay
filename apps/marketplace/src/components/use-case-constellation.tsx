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
  baseAlpha: number
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

const CANVAS_H = 560
const LENS_RADIUS = 140
const MAX_SCALE = 2.8
const CELL_H = 32
const CELL_PAD_X = 16
const CELL_PAD_Y = 6
const BASE_FONT = 10
const MAX_FONT = 18

export function UseCaseConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 })
  const animRaf = useRef(0)
  const visible = useRef(false)
  const fadeIn = useRef(0)
  const time = useRef(0)

  // Smooth cursor
  const mouseRaw = useRef({ x: -999, y: -999 })
  const mouseSmooth = useRef({ x: -999, y: -999 })
  const mouseActive = useRef(false)

  // Precomputed cell layout
  const cells = useRef<Cell[]>([])
  const layoutWidth = useRef(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Recompute cell layout when width changes
  useEffect(() => {
    if (dimensions.w === 0) return
    const w = dimensions.w

    // Measure text widths with a temp canvas
    const offscreen = document.createElement('canvas')
    const octx = offscreen.getContext('2d')!
    octx.font = `500 ${BASE_FONT}px system-ui, -apple-system, sans-serif`

    const measured = USE_CASES.map((text) => ({
      text,
      textW: octx.measureText(text).width,
    }))

    // Flow layout: place cells left-to-right, wrap
    const result: Cell[] = []
    let cx = 0
    let cy = 0
    const gap = 6

    for (const { text, textW } of measured) {
      const cellW = textW + CELL_PAD_X * 2
      if (cx + cellW > w && cx > 0) {
        cx = 0
        cy += CELL_H + gap
      }
      result.push({
        text,
        x: cx,
        y: cy,
        w: cellW,
        h: CELL_H,
        baseAlpha: 0.12 + Math.random() * 0.08,
      })
      cx += cellW + gap
    }

    // If we have leftover space vertically, center the grid
    const totalH = cy + CELL_H
    const offsetY = Math.max(0, (CANVAS_H - totalH) / 2)
    for (const cell of result) {
      cell.y += offsetY
    }

    cells.current = result
    layoutWidth.current = w
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
        fadeIn.current = Math.min(1, fadeIn.current + 0.01)
      }
      time.current += 0.008

      // Smooth cursor
      const lerpAmt = mouseActive.current ? 0.08 : 0.04
      mouseSmooth.current.x = lerp(mouseSmooth.current.x, mouseRaw.current.x, lerpAmt)
      mouseSmooth.current.y = lerp(mouseSmooth.current.y, mouseRaw.current.y, lerpAmt)

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
      const isHovering = mouseActive.current && mx > -500

      // Draw lens glow
      if (isHovering && fadeIn.current > 0.3) {
        const grad = ctx.createRadialGradient(mx, my, 0, mx, my, LENS_RADIUS * 1.2)
        grad.addColorStop(0, `rgba(56, 149, 255, ${0.06 * fadeIn.current})`)
        grad.addColorStop(0.5, `rgba(56, 149, 255, ${0.02 * fadeIn.current})`)
        grad.addColorStop(1, 'rgba(56, 149, 255, 0)')
        ctx.fillStyle = grad
        ctx.fillRect(mx - LENS_RADIUS * 1.5, my - LENS_RADIUS * 1.5, LENS_RADIUS * 3, LENS_RADIUS * 3)

        // Lens ring
        ctx.beginPath()
        ctx.arc(mx, my, LENS_RADIUS, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.06 * fadeIn.current})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Draw cells
      for (const cell of cells.current) {
        const cellCx = cell.x + cell.w / 2
        const cellCy = cell.y + cell.h / 2
        const dist = isHovering ? Math.hypot(cellCx - mx, cellCy - my) : Infinity

        // How much is this cell inside the lens (0 = outside, 1 = center)
        const lensT = isHovering ? Math.max(0, 1 - dist / LENS_RADIUS) : 0
        // Smooth falloff (ease-out cubic)
        const influence = lensT * lensT * (3 - 2 * lensT)

        const scale = 1 + influence * (MAX_SCALE - 1)
        const fontSize = BASE_FONT + influence * (MAX_FONT - BASE_FONT)
        const alpha = lerp(cell.baseAlpha, 1, influence) * fadeIn.current

        // Subtle drift animation for idle cells
        const driftX = Math.sin(time.current * 0.5 + cell.x * 0.01) * 1.5 * (1 - influence)
        const driftY = Math.cos(time.current * 0.3 + cell.y * 0.02) * 1 * (1 - influence)

        const drawX = cellCx + driftX
        const drawY = cellCy + driftY

        // Background pill (only when magnified)
        if (influence > 0.05) {
          const pillW = cell.w * scale * 0.5 + fontSize * cell.text.length * 0.32
          const pillH = fontSize * 1.8
          const pillR = pillH / 2

          ctx.beginPath()
          ctx.roundRect(drawX - pillW / 2, drawY - pillH / 2, pillW, pillH, pillR)
          ctx.fillStyle = `rgba(30, 27, 24, ${influence * 0.7 * fadeIn.current})`
          ctx.fill()
          ctx.strokeStyle = `rgba(255, 255, 255, ${influence * 0.15 * fadeIn.current})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }

        // Text
        ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.fillText(cell.text, drawX, drawY)
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
    mouseRaw.current = { x: -999, y: -999 }
  }, [])

  return (
    <div ref={containerRef} className="relative w-full max-w-5xl mx-auto">
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
