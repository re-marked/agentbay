'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Search, ArrowRight, ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuroraHero } from '@/components/aurora-hero'
import { RotatingText } from '@/components/rotating-text'
import { ScrollReveal } from '@/components/scroll-reveal'
import Lenis from 'lenis'
import { SierpinskiLogo } from '@/components/sierpinski-logo'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ScrollSpotlightText } from '@/components/scroll-spotlight-text'
import { AiAdoptionGrid } from '@/components/ai-adoption-grid'
import { UseCaseConstellation } from '@/components/use-case-constellation'

const MISSION = 'AgentBay is on a mission to make high-quality AI agents simple, fast, and accessible for everyone.'
const MISSION_ACCENT = [7, 8, 9, 15]


/** Lenis smooth scroll bound to a specific wrapper element */
function SmoothScrollInner({ wrapper }: { wrapper: HTMLElement }) {
  useEffect(() => {
    const lenis = new Lenis({
      wrapper,
      content: wrapper.children[0] as HTMLElement,
      duration: 1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    })

    function raf(time: number) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)

    return () => { lenis.destroy() }
  }, [wrapper])

  return null
}

export default function LandingPage() {
  const [viewport, setViewport] = useState<HTMLElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollAreaRef.current) {
      const el = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]')
      if (el) setViewport(el as HTMLElement)
    }
  }, [])

  return (
    <ScrollArea ref={scrollAreaRef} className="h-svh -mt-14">
      {viewport && <SmoothScrollInner wrapper={viewport} />}
      <main className="w-full">
        {/* ─── Hero ─── */}
        <section className="relative flex h-svh w-full flex-col items-center justify-center overflow-hidden px-6">
          <div className="absolute inset-0 z-0">
            <AuroraHero className="h-full w-full" />
          </div>

          <h1 className="relative z-10 mb-6 flex flex-wrap justify-center text-center text-5xl font-medium tracking-[-0.04em] sm:text-6xl">
            <span>Personal Agents for</span>
            <span className="ml-[0.25em] w-[220px] text-left">
              <RotatingText />
            </span>
          </h1>
          <ScrollSpotlightText
            text="Every person is a corporation. You are the boss and dozens of AI agents work for you. The real skill now becomes systems thinking, execution speed, and creativity."
            immediate
            initialDelay={0.3}
            className="relative z-10 mb-10 max-w-xl text-center text-lg text-secondary-foreground"
          />

          <div className="relative w-full max-w-2xl">
            <form action="/discover" className="relative z-10">
              <div className="flex h-14 items-center gap-4 rounded-2xl border border-white/5 bg-card/50 px-6 shadow-2xl backdrop-blur-md transition-colors focus-within:bg-accent/50">
                <input
                  name="q"
                  type="text"
                  placeholder="Describe what you need help with..."
                  className="w-full bg-transparent text-lg text-foreground outline-none placeholder:text-muted-foreground"
                />
                <Search className="size-6 shrink-0 text-muted-foreground" />
              </div>
            </form>
          </div>

          <div className="relative z-10 mt-8 flex justify-center">
            <Button size="lg" variant="ghost" className="h-12 px-8 text-base" asChild>
              <Link href="/workspace/home">
                Create your corporation <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>

          <motion.div
            className="absolute bottom-8 z-10"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown className="size-6 text-muted-foreground/50" />
          </motion.div>
        </section>

        {/* ─── Mission ─── */}
        <section className="flex w-full items-center justify-center px-6 py-16">
          <ScrollSpotlightText
            text={MISSION}
            accentIndices={MISSION_ACCENT}
            className="max-w-4xl text-center text-4xl font-medium leading-snug tracking-tight sm:text-5xl lg:text-6xl"
          />
        </section>

        {/* ─── AI Adoption Grid ─── */}
        <section className="w-full px-6 py-32">
          <AiAdoptionGrid />
        </section>

        {/* ─── Use Cases ─── */}
        <section className="w-full px-6 py-32">
          <UseCaseConstellation />
        </section>

        {/* ─── The Shift ─── */}
        <section className="flex w-full flex-col items-center justify-center px-6 py-32">
          <ScrollSpotlightText
            text="You used to need a company to have a team. Not anymore."
            accentIndices={[10, 11]}
            as="h2"
            className="mb-6 max-w-3xl text-center text-4xl font-medium tracking-tight sm:text-5xl lg:text-6xl"
          />
          <ScrollReveal delay={0.15} className="max-w-xl text-center">
            <p className="text-lg leading-relaxed text-muted-foreground">
              AI agents that research, write, analyze, and build — working alongside you, around the clock. What used to take ten people now takes one person and <span className="bg-gradient-to-r from-gradient-from to-gradient-to bg-clip-text text-transparent">the right agents.</span>
            </p>
          </ScrollReveal>
        </section>

        {/* ─── CTA ─── */}
        <section className="flex w-full flex-col items-center px-6 pb-24 pt-16">
          <ScrollReveal className="flex flex-col items-center gap-8 text-center">
            <SierpinskiLogo className="size-10 text-foreground/80" />
            <div>
              <ScrollSpotlightText
                text="Your team is waiting."
                as="h2"
                className="mb-3 text-3xl font-medium tracking-tight sm:text-4xl"
              />
              <p className="text-lg text-muted-foreground">
                Hire your first agent and start building.
              </p>
            </div>
            <Button size="lg" className="h-12 px-8 text-base" asChild>
              <Link href="/discover">
                Browse Agents <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </ScrollReveal>
        </section>
      </main>
    </ScrollArea>
  )
}
