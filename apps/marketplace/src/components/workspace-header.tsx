"use client"

import * as React from "react"
import { createContext, useContext, useState, useCallback, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import {
  Building2,
  ChevronRight,
  Check,
  Hash,
  ListTodo,
  Home,
  Settings,
  Key,
  BarChart3,
  ChevronsUpDown,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import type { ProjectInfo } from "@/components/workspace-switcher"

// ── Breadcrumb context ──────────────────────────────────────────────

interface PageSegment {
  icon?: React.ReactNode
  label: string
  href?: string
}

interface WorkspaceHeaderContextValue {
  segment: PageSegment | null
  setSegment: (s: PageSegment | null) => void
}

const WorkspaceHeaderContext = createContext<WorkspaceHeaderContextValue>({
  segment: null,
  setSegment: () => {},
})

export function WorkspaceHeaderProvider({ children }: { children: React.ReactNode }) {
  const [segment, setSegment] = useState<PageSegment | null>(null)
  return (
    <WorkspaceHeaderContext.Provider value={{ segment, setSegment }}>
      {children}
    </WorkspaceHeaderContext.Provider>
  )
}

/**
 * Call from any page component to set the rightmost breadcrumb segment.
 * Clears automatically on unmount.
 */
export function usePageSegment(seg: PageSegment | null, deps: unknown[] = []) {
  const { setSegment } = useContext(WorkspaceHeaderContext)
  useEffect(() => {
    setSegment(seg)
    return () => setSegment(null)
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Server-component-friendly wrapper — just renders a client component
 * that calls usePageSegment.
 */
export function SetPageSegment({ icon, label, href }: PageSegment) {
  return <SetPageSegmentInner icon={icon} label={label} href={href} />
}

function SetPageSegmentInner({ icon, label, href }: PageSegment) {
  usePageSegment({ icon, label, href }, [label, href])
  return null
}

// ── Channel / page navigation items ────────────────────────────────

interface BroadcastChannel {
  id: string
  name: string
  description: string | null
}

// ── Header component ────────────────────────────────────────────────

interface WorkspaceHeaderProps {
  corporationName?: string
  projects: ProjectInfo[]
  activeProjectId: string | null
  broadcastChannels?: BroadcastChannel[]
}

const PROJECT_COLORS = [
  "bg-indigo-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-cyan-600",
  "bg-purple-600",
  "bg-rose-600",
]

export function WorkspaceHeader({
  corporationName,
  projects,
  activeProjectId,
  broadcastChannels = [],
}: WorkspaceHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { segment } = useContext(WorkspaceHeaderContext)

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? projects[0]
  const activeProjectIndex = projects.findIndex((p) => p.id === activeProject?.id)

  const switchProject = useCallback((projectId: string) => {
    document.cookie = `active_project=${projectId};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`
    router.refresh()
  }, [router])

  // Navigation items for the page-level dropdown
  const navItems = [
    { icon: <Home className="size-3.5" />, label: "Home", href: "/workspace/home" },
    { icon: <ListTodo className="size-3.5" />, label: "Tasks", href: "/workspace/tasks" },
    ...broadcastChannels.map(ch => ({
      icon: <Hash className="size-3.5" />,
      label: ch.name,
      href: `/workspace/c/${ch.id}`,
    })),
    { type: "separator" as const },
    { icon: <BarChart3 className="size-3.5" />, label: "Usage", href: "/workspace/usage" },
    { icon: <Key className="size-3.5" />, label: "API Keys", href: "/workspace/settings" },
    { icon: <Settings className="size-3.5" />, label: "Settings", href: "/workspace/settings/general" },
  ]

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center border-b border-border/40 bg-background px-3">
      <SidebarTrigger className="-ml-0.5 mr-2" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />

      {/* ── Breadcrumb chain ── */}
      <nav className="flex items-center gap-0.5 text-sm min-w-0">

        {/* Corporation */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Building2 className="size-3.5 shrink-0" />
              <span className="truncate max-w-[140px]">{corporationName ?? "Corporation"}</span>
              <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className="min-w-[200px]">
            <DropdownMenuItem className="gap-2.5">
              <Building2 className="size-3.5" />
              <span className="flex-1">{corporationName ?? "Corporation"}</span>
              <Check className="size-3.5 text-primary" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />

        {/* Project */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <div className={`size-3.5 rounded shrink-0 ${PROJECT_COLORS[activeProjectIndex] ?? "bg-primary"}`} />
              <span className="truncate max-w-[140px]">{activeProject?.name ?? "Project"}</span>
              <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className="min-w-[220px]">
            {projects.map((project, i) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => switchProject(project.id)}
                className="gap-2.5"
              >
                <div className={`size-3.5 rounded ${PROJECT_COLORS[i % PROJECT_COLORS.length]}`} />
                <span className="flex-1 truncate">{project.name}</span>
                {project.id === activeProject?.id && (
                  <Check className="size-3.5 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />

        {/* Page segment — either from context or a dropdown of all navigable pages */}
        {segment ? (
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-foreground font-medium">
            {segment.icon}
            <span className="truncate max-w-[200px]">{segment.label}</span>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <span className="truncate">Navigate...</span>
                <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6} className="min-w-[200px]">
              {navItems.map((item, i) =>
                'type' in item && item.type === 'separator' ? (
                  <div key={`sep-${i}`} className="my-1 h-px bg-border" />
                ) : (
                  <DropdownMenuItem
                    key={'href' in item ? item.href : i}
                    asChild
                    className="gap-2.5"
                  >
                    <Link href={'href' in item ? item.href! : '#'}>
                      {'icon' in item && item.icon}
                      <span className="flex-1">{'label' in item && item.label}</span>
                      {'href' in item && pathname.startsWith(item.href!) && (
                        <Check className="size-3.5 text-primary" />
                      )}
                    </Link>
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    </header>
  )
}
