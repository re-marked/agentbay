'use client'

import { useEffect, useRef } from 'react'

export function AuroraHero({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    window.addEventListener('resize', resize)
    resize()

    const render = () => {
      time += 0.005
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      const w = canvas.width
      const h = canvas.height
      
      // 1. Primary Blue (Left-Center)
      // Moving in a slow figure-8
      const x1 = w * 0.3 + Math.sin(time) * (w * 0.1)
      const y1 = h * 0.4 + Math.cos(time * 0.8) * (h * 0.1)
      const r1 = Math.min(w, h) * 0.6
      
      const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, r1)
      g1.addColorStop(0, 'rgba(56, 149, 255, 0.3)') // Blue - slightly increased
      g1.addColorStop(1, 'rgba(56, 149, 255, 0)')
      
      ctx.fillStyle = g1
      ctx.fillRect(0, 0, w, h)

      // 2. Warm Orange (Right-Center)
      // Counter-movement
      const x2 = w * 0.7 + Math.cos(time * 0.7) * (w * 0.1)
      const y2 = h * 0.6 + Math.sin(time * 0.9) * (h * 0.1)
      const r2 = Math.min(w, h) * 0.5
      
      const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, r2)
      g2.addColorStop(0, 'rgba(230, 140, 45, 0.25)') // Orange - slightly increased
      g2.addColorStop(1, 'rgba(230, 140, 45, 0)')
      
      ctx.fillStyle = g2
      ctx.fillRect(0, 0, w, h)

      // 3. Purple/Violet (Bottom-Middle)
      // Slow drift
      const x3 = w * 0.5 + Math.sin(time * 0.5) * (w * 0.2)
      const y3 = h * 0.8 + Math.cos(time * 0.4) * (h * 0.1)
      const r3 = Math.min(w, h) * 0.7
      
      const g3 = ctx.createRadialGradient(x3, y3, 0, x3, y3, r3)
      g3.addColorStop(0, 'rgba(160, 90, 220, 0.2)') // Purple - slightly increased
      g3.addColorStop(1, 'rgba(160, 90, 220, 0)')
      
      ctx.fillStyle = g3
      ctx.fillRect(0, 0, w, h)

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        className="h-full w-full opacity-70 blur-[60px] saturate-150"
      />
      {/* Vignette to blend into background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,oklch(var(--background))_100%)]" />
    </div>
  )
}
