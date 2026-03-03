'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'

interface ScrollSpotlightTextProps {
  text: string
  className?: string
  accentIndices?: number[]
  immediate?: boolean
  initialDelay?: number
  as?: 'p' | 'h1' | 'h2' | 'h3'
}

/**
 * Visibility check that works inside Radix ScrollArea.
 * Uses requestAnimationFrame polling since Radix uses overflow:hidden + translateY
 * which breaks IntersectionObserver.
 */
function useVisibleInViewport(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false)

  const check = useCallback(() => {
    const el = ref.current
    if (!el) return false
    const rect = el.getBoundingClientRect()
    return rect.top < window.innerHeight * 0.85 && rect.bottom > 0
  }, [ref])

  useEffect(() => {
    if (visible) return // already triggered, stop

    let raf: number
    const poll = () => {
      if (check()) {
        setVisible(true)
      } else {
        raf = requestAnimationFrame(poll)
      }
    }
    raf = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(raf)
  }, [check, visible])

  return visible
}

export function ScrollSpotlightText({
  text,
  className,
  accentIndices = [],
  immediate = false,
  initialDelay = 0,
  as: Tag = 'p',
}: ScrollSpotlightTextProps) {
  const ref = useRef<HTMLElement>(null)
  const visible = useVisibleInViewport(ref)

  const shouldAnimate = immediate || visible
  const words = text.split(' ')

  return (
    <Tag ref={ref as any} className={className}>
      {words.map((word, i) => {
        const isAccent = accentIndices.includes(i)
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0.12 }}
            animate={shouldAnimate ? { opacity: 1 } : { opacity: 0.12 }}
            transition={{
              duration: 0.5,
              delay: initialDelay + i * 0.06,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className={
              isAccent
                ? 'inline-block bg-gradient-to-r from-gradient-from to-gradient-to bg-clip-text text-transparent'
                : 'inline-block'
            }
          >
            {word}&nbsp;
          </motion.span>
        )
      })}
    </Tag>
  )
}
