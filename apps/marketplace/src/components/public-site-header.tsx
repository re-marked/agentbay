'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { SierpinskiLogo } from '@/components/sierpinski-logo'
import { Button } from '@/components/ui/button'

export function PublicSiteHeader() {
  const router = useRouter()
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
    if (q) router.push(`/discover?q=${encodeURIComponent(q)}`)
    else router.push('/discover')
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/20 backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-black/10">
      <nav className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-6">
        {/* Logo */}
        <Link href="/" className="flex w-[200px] shrink-0 items-center gap-2.5">
          <SierpinskiLogo className="size-5 text-foreground" />
          <span className="text-[15px] font-semibold tracking-tight">AgentBay</span>
        </Link>

        {/* Search bar - centered */}
        <div className="flex flex-1 justify-center">
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
        </div>

        {/* Nav links */}
        <div className="flex w-[200px] shrink-0 items-center justify-end gap-1">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <Link href="/discover">Discover</Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <Link href="/skills">Skills</Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <Link href="/workspace/home">Workspace</Link>
          </Button>
        </div>
      </nav>
    </header>
  )
}
