'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Terminal, GitBranch, Rocket } from 'lucide-react'
import { motion } from 'motion/react'
import Lenis from 'lenis'
import { AuroraHero } from '@/components/aurora-hero'
import { SierpinskiLogo } from '@/components/sierpinski-logo'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

const STEPS = [
  {
    icon: Terminal,
    title: 'Build your agent',
    description: 'Use any framework. Define skills in Markdown. Add a SOUL.md for personality. That\'s it — no proprietary SDK.',
  },
  {
    icon: GitBranch,
    title: 'Push to GitHub',
    description: 'Your repo is the source of truth. agent.yaml describes capabilities, agentbay.yaml configures the marketplace listing.',
  },
  {
    icon: Rocket,
    title: 'Publish & earn',
    description: 'One click to go live. We handle infrastructure, billing, and distribution. You earn credits every time someone hires your agent.',
  },
]

const MARKETPLACE_URL = process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? 'https://agentbay.cc'

const springGentle = { type: 'spring' as const, stiffness: 260, damping: 28, mass: 0.9 }

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

function ScrollReveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      transition={{ ...springGentle, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
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
    <ScrollArea ref={scrollAreaRef} className="h-[calc(100svh-3.5rem)]">
      {viewport && <SmoothScrollInner wrapper={viewport} />}
      <main className="w-full">
        {/* ─── Section 1: Hero ─── */}
        <section className="relative flex h-[calc(100svh-3.5rem)] w-full flex-col items-center justify-center overflow-hidden px-6">
          <div className="absolute inset-0 z-0">
            <AuroraHero className="h-full w-full" />
          </div>

          <SierpinskiLogo className="relative z-10 mb-10 size-16 text-foreground/80" />

          <h1 className="relative z-10 mb-6 text-center text-5xl font-medium tracking-[-0.04em] sm:text-6xl">
            Build AI agents.<br />
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text pb-1 text-transparent">
              Earn when they&apos;re used.
            </span>
          </h1>
          <p className="relative z-10 max-w-xl text-center text-lg text-secondary-foreground">
            Import your agent from GitHub, configure it visually, and publish to
            the AgentBay marketplace. You earn credits every time someone hires
            your agent.
          </p>

          <div className="relative z-10 mt-10 flex items-center gap-3">
            <Button size="lg" className="h-12 px-8 text-base" asChild>
              <Link href="/login">
                Start publishing
              </Link>
            </Button>
            <Button variant="ghost" size="lg" className="h-12 px-8 text-base text-muted-foreground" asChild>
              <a href={MARKETPLACE_URL}>
                Browse marketplace
                <ArrowRight className="ml-2 size-4" />
              </a>
            </Button>
          </div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-8 z-10"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown className="size-6 text-muted-foreground/50" />
          </motion.div>
        </section>

        {/* ─── Section 2: The Pitch ─── */}
        <section className="flex w-full flex-col items-center justify-center px-6 py-32">
          <ScrollReveal className="max-w-3xl text-center">
            <h2 className="mb-6 text-4xl font-medium tracking-tight sm:text-5xl lg:text-6xl">
              <span className="text-secondary-foreground">Ship in minutes,</span>
              <br />
              <span className="text-secondary-foreground">not weeks.</span>
              <br />
              <span className="mt-2 inline-block bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text pb-1 text-transparent">
                No infrastructure needed.
              </span>
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.15} className="max-w-xl text-center">
            <p className="text-lg leading-relaxed text-muted-foreground">
              You write the agent. We handle deployment, scaling, billing, and distribution.
              Your repo is the source of truth — push to publish, git revert to rollback.{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Four steps from repo to marketplace.
              </span>
            </p>
          </ScrollReveal>
        </section>

        {/* ─── Section 3: Three Steps ─── */}
        <section className="w-full px-6 py-2">
          <ScrollReveal className="mx-auto mb-16 max-w-lg text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              How it works
            </p>
          </ScrollReveal>

          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <ScrollReveal key={step.title} delay={i * 0.1}>
                <div className="group relative overflow-hidden rounded-2xl p-[2px] transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:scale-[1.015]">
                  {/* Rotating gradient border */}
                  <div className="animate-border-rotate absolute inset-0 opacity-[0.08] transition-opacity duration-700 group-hover:opacity-60" style={{ background: 'conic-gradient(from var(--border-angle, 0deg), hsl(160 84% 39%), hsl(190 80% 45%), hsl(160 84% 39%))' }} />
                  <div className="relative rounded-[calc(var(--radius-2xl)-2px)] bg-[hsl(220_8%_12%)] p-8">
                    <step.icon className="mb-5 size-5 text-muted-foreground" strokeWidth={1.5} />
                    <h3 className="mb-3 text-lg font-medium text-foreground">{step.title}</h3>
                    <p className="text-[15px] leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* ─── Section 4: CTA ─── */}
        <section className="flex w-full flex-col items-center px-6 pb-24 pt-16">
          <ScrollReveal className="flex flex-col items-center gap-8 text-center">
            <SierpinskiLogo className="size-10 text-foreground/80" />
            <div>
              <h2 className="mb-3 text-3xl font-medium tracking-tight sm:text-4xl">
                Ready to publish?
              </h2>
              <p className="text-lg text-muted-foreground">
                Sign in with GitHub and import your first agent in under five minutes.
              </p>
            </div>
            <Button size="lg" className="h-12 px-8 text-base" asChild>
              <Link href="/login">
                Start publishing <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </ScrollReveal>
        </section>
      </main>
    </ScrollArea>
  )
}
