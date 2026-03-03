'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

interface UseCase {
  label: string
  detail: string
  x: number
  y: number
  angle: number
  radius: number
  speed: number
  size: number
}

const USE_CASES: Omit<UseCase, 'x' | 'y'>[] = [
  { label: 'Summarize 50 emails', detail: 'Inbox zero in 30 seconds. Key action items extracted, grouped by priority.', angle: 0, radius: 0.32, speed: 0.15, size: 38 },
  { label: 'Draft a pitch deck', detail: 'From bullet points to polished slides. Narrative arc, data highlights, speaker notes.', angle: 0.9, radius: 0.28, speed: 0.12, size: 36 },
  { label: 'Monitor competitors', detail: 'Daily scans across news, pricing changes, job postings. Weekly digest, zero manual work.', angle: 1.7, radius: 0.35, speed: 0.1, size: 40 },
  { label: 'Analyze spreadsheets', detail: 'Upload a CSV, ask questions in plain English. Charts, trends, anomalies — instant.', angle: 2.5, radius: 0.26, speed: 0.18, size: 34 },
  { label: 'Write blog posts', detail: 'Your voice, your style. First draft in 2 minutes, SEO-optimized, ready to edit.', angle: 3.3, radius: 0.3, speed: 0.14, size: 37 },
  { label: 'Research any topic', detail: '50 sources cross-referenced in seconds. Cited summaries, not hallucinated guesses.', angle: 4.1, radius: 0.33, speed: 0.11, size: 39 },
  { label: 'Automate reports', detail: 'Pull data, format tables, generate insights. Scheduled or on-demand, always consistent.', angle: 4.9, radius: 0.27, speed: 0.16, size: 35 },
  { label: 'Plan your week', detail: 'Calendar analysis, priority sorting, time-blocking. A chief of staff that never sleeps.', angle: 5.7, radius: 0.31, speed: 0.13, size: 36 },
]

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function UseCaseConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 })
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [tooltipData, setTooltipData] = useState<{ x: number; y: number; idx: number } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const time = useRef(0)
  const animRaf = useRef(0)
  const nodePositions = useRef<{ x: number; y: number }[]>(USE_CASES.map(() => ({ x: 0, y: 0 })))
  const smoothHover = useRef<number[]>(USE_CASES.map(() => 0))
  const centerPulse = useRef(0)
  const smoothTooltip = useRef({ x: 0, y: 0 })
  const visible = useRef(false)
  const fadeIn = useRef(0)

  // Particles drifting in background
  const particles = useRef<{ x: number; y: number; vx: number; vy: number; size: number; alpha: number }[]>([])

  useEffect(() => {
    // Init particles
    const p: typeof particles.current = []
    for (let i = 0; i < 60; i++) {
      p.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0003,
        vy: (Math.random() - 0.5) * 0.0003,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.3 + 0.05,
      })
    }
    particles.current = p
  }, [])

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
        fadeIn.current = Math.min(1, fadeIn.current + 0.008)
      }

      time.current += 0.008
      centerPulse.current = Math.sin(time.current * 1.5) * 0.5 + 0.5

      const dpr = window.devicePixelRatio || 1
      const w = dimensions.w
      const h = 560

      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)

      const cx = w / 2
      const cy = h / 2
      const scale = Math.min(w, h)

      // Update particles
      for (const p of particles.current) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > 1) p.vx *= -1
        if (p.y < 0 || p.y > 1) p.vy *= -1
      }

      // Draw particles
      ctx.globalAlpha = fadeIn.current * 0.6
      for (const p of particles.current) {
        ctx.beginPath()
        ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // Compute node positions
      for (let i = 0; i < USE_CASES.length; i++) {
        const uc = USE_CASES[i]
        const a = uc.angle + time.current * uc.speed
        const r = uc.radius * scale
        // Slight wobble
        const wobbleX = Math.sin(time.current * 0.7 + i * 2) * 8
        const wobbleY = Math.cos(time.current * 0.5 + i * 3) * 6
        nodePositions.current[i] = {
          x: cx + Math.cos(a) * r + wobbleX,
          y: cy + Math.sin(a) * r + wobbleY,
        }
      }

      // Smooth hover transitions
      for (let i = 0; i < USE_CASES.length; i++) {
        const target = hoveredIdx === i ? 1 : 0
        smoothHover.current[i] = lerp(smoothHover.current[i], target, 0.06)
      }

      // Draw connections from center to nodes
      for (let i = 0; i < USE_CASES.length; i++) {
        const pos = nodePositions.current[i]
        const hover = smoothHover.current[i]
        const baseAlpha = 0.06 + hover * 0.2

        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(pos.x, pos.y)
        ctx.strokeStyle = `rgba(255, 255, 255, ${baseAlpha * fadeIn.current})`
        ctx.lineWidth = 1 + hover * 1.5
        ctx.stroke()

        // Pulse traveling along the line
        if (fadeIn.current > 0.5) {
          const pulseT = (time.current * 0.3 + i * 0.3) % 1
          const px = lerp(cx, pos.x, pulseT)
          const py = lerp(cy, pos.y, pulseT)
          ctx.beginPath()
          ctx.arc(px, py, 1.5 + hover * 2, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 255, 255, ${(0.15 + hover * 0.4) * fadeIn.current})`
          ctx.fill()
        }
      }

      // Draw inter-node connections (faint mesh)
      for (let i = 0; i < USE_CASES.length; i++) {
        for (let j = i + 1; j < USE_CASES.length; j++) {
          const a = nodePositions.current[i]
          const b = nodePositions.current[j]
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          if (dist < scale * 0.35) {
            const alpha = (1 - dist / (scale * 0.35)) * 0.04 * fadeIn.current
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      // Draw center node
      const centerGlow = 12 + centerPulse.current * 8
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, centerGlow * 3)
      grad.addColorStop(0, `rgba(56, 149, 255, ${0.15 * fadeIn.current})`)
      grad.addColorStop(1, 'rgba(56, 149, 255, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(cx - centerGlow * 3, cy - centerGlow * 3, centerGlow * 6, centerGlow * 6)

      ctx.beginPath()
      ctx.arc(cx, cy, centerGlow, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(56, 149, 255, ${(0.3 + centerPulse.current * 0.15) * fadeIn.current})`
      ctx.fill()

      ctx.beginPath()
      ctx.arc(cx, cy, 6, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * fadeIn.current})`
      ctx.fill()

      // Draw nodes
      for (let i = 0; i < USE_CASES.length; i++) {
        const pos = nodePositions.current[i]
        const uc = USE_CASES[i]
        const hover = smoothHover.current[i]
        const isAnyHovered = hoveredIdx !== null
        const dimFactor = isAnyHovered ? (hoveredIdx === i ? 1 : lerp(1, 0.25, smoothHover.current[hoveredIdx!] > 0.1 ? 1 : 0)) : 1
        const nodeAlpha = fadeIn.current * lerp(dimFactor, 1, hover)

        // Glow
        if (hover > 0.01) {
          const glowR = uc.size * (1 + hover * 0.8)
          const glowGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glowR)
          glowGrad.addColorStop(0, `rgba(56, 149, 255, ${hover * 0.2 * fadeIn.current})`)
          glowGrad.addColorStop(1, 'rgba(56, 149, 255, 0)')
          ctx.fillStyle = glowGrad
          ctx.fillRect(pos.x - glowR, pos.y - glowR, glowR * 2, glowR * 2)
        }

        // Node circle
        const r = (uc.size / 2) * (1 + hover * 0.15)
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(30, 27, 24, ${nodeAlpha * 0.85})`
        ctx.fill()
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.12 + hover * 0.3) * nodeAlpha})`
        ctx.lineWidth = 1
        ctx.stroke()

        // Label
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.7 + hover * 0.3) * nodeAlpha})`
        ctx.font = `500 ${11 + hover * 1}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Word-wrap inside node
        const words = uc.label.split(' ')
        if (words.length <= 2) {
          ctx.fillText(uc.label, pos.x, pos.y)
        } else {
          const mid = Math.ceil(words.length / 2)
          ctx.fillText(words.slice(0, mid).join(' '), pos.x, pos.y - 6)
          ctx.fillText(words.slice(mid).join(' '), pos.x, pos.y + 7)
        }
      }

      // Smooth tooltip position
      if (tooltipData) {
        smoothTooltip.current.x = lerp(smoothTooltip.current.x, tooltipData.x, 0.1)
        smoothTooltip.current.y = lerp(smoothTooltip.current.y, tooltipData.y, 0.1)
      }

      const tip = tooltipRef.current
      const container = containerRef.current
      if (tip && container) {
        const cr = container.getBoundingClientRect()
        tip.style.left = `${smoothTooltip.current.x - cr.left}px`
        tip.style.top = `${smoothTooltip.current.y - cr.top - 20}px`
      }

      animRaf.current = requestAnimationFrame(animate)
    }

    animRaf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRaf.current)
  }, [dimensions, hoveredIdx, tooltipData])

  const handleMouse = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    let closest = -1
    let closestDist = Infinity

    for (let i = 0; i < USE_CASES.length; i++) {
      const pos = nodePositions.current[i]
      const dist = Math.hypot(pos.x - mx, pos.y - my)
      if (dist < USE_CASES[i].size && dist < closestDist) {
        closest = i
        closestDist = dist
      }
    }

    if (closest >= 0) {
      setHoveredIdx(closest)
      setTooltipData({ x: e.clientX, y: e.clientY, idx: closest })
    } else {
      setHoveredIdx(null)
      setTooltipData(null)
    }
  }, [])

  const handleLeave = useCallback(() => {
    setHoveredIdx(null)
    setTooltipData(null)
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
        Hover a node to see what your agents can handle. Each one replaces hours of manual work.
      </p>

      <canvas
        ref={canvasRef}
        onMouseMove={handleMouse}
        onMouseLeave={handleLeave}
        className="w-full cursor-crosshair"
        style={{ height: 560 }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full"
        style={{ opacity: hoveredIdx !== null ? 1 : 0, transition: 'opacity 0.3s ease' }}
      >
        {hoveredIdx !== null && (
          <div className="max-w-xs rounded-xl border border-white/10 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-md">
            <p className="mb-1 text-sm font-medium text-foreground">
              {USE_CASES[hoveredIdx].label}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {USE_CASES[hoveredIdx].detail}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
