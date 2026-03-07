"use client"

import { useState, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronsUpDown, Plus, Check, FolderKanban, Loader2, Settings, LogOut } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { createProject } from "@/lib/projects/actions"
import { signOut } from "@/lib/auth/actions"

export interface ProjectInfo {
  id: string
  name: string
  description: string | null
}

interface WorkspaceSwitcherProps {
  corporationName?: string
  projects: ProjectInfo[]
  activeProjectId: string | null
  userEmail?: string
}

const PROJECT_COLORS = [
  "bg-indigo-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-cyan-600",
  "bg-purple-600",
  "bg-rose-600",
]

function getProjectColor(index: number) {
  return PROJECT_COLORS[index % PROJECT_COLORS.length]
}

export function WorkspaceSwitcher({ corporationName, projects, activeProjectId, userEmail }: WorkspaceSwitcherProps) {
  const router = useRouter()
  const active = projects.find((p) => p.id === activeProjectId) ?? projects[0]
  const [creating, setCreating] = useState(false)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function switchProject(projectId: string) {
    document.cookie = `active_project=${projectId};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`
    router.refresh()
  }

  function handleCreate() {
    const name = inputRef.current?.value.trim()
    if (!name) return

    startTransition(async () => {
      const result = await createProject(name)
      if (result.id) {
        document.cookie = `active_project=${result.id};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`
        setCreating(false)
        router.refresh()
      }
    })
  }

  if (!active) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="text-muted-foreground">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-zinc-700">
              <FolderKanban className="size-4" />
            </div>
            <span className="text-sm">No projects yet</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  const activeIndex = projects.findIndex((p) => p.id === active.id)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={(open) => { if (!open) setCreating(false) }}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="transition-colors data-[state=open]:bg-sidebar-accent">
              <div className={`flex aspect-square size-8 items-center justify-center rounded-lg text-white shadow-sm ${getProjectColor(activeIndex)}`}>
                <FolderKanban className="size-4" />
              </div>
              <div className="flex flex-1 flex-col gap-0.5 leading-none">
                <span className="font-medium truncate">{corporationName ?? active.name}</span>
                {corporationName && (
                  <span className="text-[11px] text-sidebar-foreground/40 truncate">{active.name}</span>
                )}
                {!corporationName && active.description && (
                  <span className="text-[11px] text-sidebar-foreground/40 truncate">{active.description}</span>
                )}
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/30" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-[300px] rounded-xl border-white/[0.08] bg-popover p-0 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-200"
            align="start"
            sideOffset={8}
          >
            {/* ─── Active project hero card ─── */}
            <div className="p-3">
              <div className="flex items-start gap-3">
                <div className={`flex aspect-square size-10 shrink-0 items-center justify-center rounded-lg text-white ${getProjectColor(activeIndex)}`}>
                  <FolderKanban className="size-5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{corporationName ?? active.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {corporationName ? active.name : (active.description ?? 'Personal project')}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => router.push('/workspace/settings/general')}
                  className="flex items-center gap-1.5 rounded-md border border-white/[0.08] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
                >
                  <Settings className="size-3" />
                  Settings
                </button>
              </div>
            </div>

            <DropdownMenuSeparator className="m-0 bg-white/[0.06]" />

            {/* ─── Email + project list ─── */}
            <div className="p-1.5">
              {userEmail && (
                <div className="flex items-center px-2.5 py-1.5">
                  <span className="text-xs text-muted-foreground/60">{userEmail}</span>
                </div>
              )}

              {projects.map((project, i) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => switchProject(project.id)}
                  className="gap-3 rounded-lg px-2.5 py-2"
                >
                  <div className={`flex aspect-square size-6 items-center justify-center rounded text-white ${getProjectColor(i)}`}>
                    <FolderKanban className="size-3" />
                  </div>
                  <span className="flex-1 truncate text-sm">{project.name}</span>
                  {project.id === active.id && (
                    <Check className="size-4 text-foreground" />
                  )}
                </DropdownMenuItem>
              ))}

              {/* ─── New project ─── */}
              {creating ? (
                <div className="flex items-center gap-2 px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    ref={inputRef}
                    autoFocus
                    placeholder="Project name..."
                    className="h-7 flex-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:bg-white/[0.06]"
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') handleCreate()
                      if (e.key === 'Escape') setCreating(false)
                    }}
                    disabled={pending}
                  />
                  <button
                    onClick={handleCreate}
                    disabled={pending}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  </button>
                </div>
              ) : (
                <DropdownMenuItem
                  className="gap-3 rounded-lg px-2.5 py-2 text-primary"
                  onSelect={(e) => {
                    e.preventDefault()
                    setCreating(true)
                  }}
                >
                  <Plus className="size-4" />
                  <span className="text-sm">New project</span>
                </DropdownMenuItem>
              )}
            </div>

            <DropdownMenuSeparator className="m-0 bg-white/[0.06]" />

            {/* ─── Footer actions ─── */}
            <div className="p-1.5">
              <DropdownMenuItem
                className="gap-3 rounded-lg px-2.5 py-2 text-muted-foreground"
                onSelect={() => signOut()}
              >
                <LogOut className="size-4" />
                <span className="text-sm">Log out</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
