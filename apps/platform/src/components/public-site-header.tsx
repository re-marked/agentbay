'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { SierpinskiLogo } from '@/components/sierpinski-logo'
import { Button } from '@/components/ui/button'

const MARKETPLACE_URL = process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? 'https://agentbay.com'

export function PublicSiteHeader() {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = inputRef.current?.value.trim()
    if (q) window.location.href = `${MARKETPLACE_URL}/discover?q=${encodeURIComponent(q)}`
    else window.location.href = `${MARKETPLACE_URL}/discover`
  }

  return (
    <header className="sticky top-0 z-50 bg-sidebar/95 backdrop-blur-xl border-b border-border/40">
      <nav className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-6">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <SierpinskiLogo className="size-5 text-foreground" />
          <span className="text-[15px] font-semibold tracking-tight">AgentBay</span>
        </Link>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="w-full max-w-sm">
          <div className="flex h-8 items-center gap-2 rounded-lg bg-card px-3 transition-colors focus-within:bg-accent">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search assistants..."
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
              /
            </kbd>
          </div>
        </form>

        {/* Nav links */}
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <a href={`${MARKETPLACE_URL}/discover`}>Discover</a>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <a href={`${MARKETPLACE_URL}/workspace/home`}>Workspace</a>
          </Button>
          <Button variant="ghost" size="sm" className="text-foreground font-medium" asChild>
            <Link href="/">For Devs</Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </nav>
    </header>
  )
}
