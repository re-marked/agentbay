"use client"

import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, Puzzle } from "lucide-react"
import { SKILL_CATEGORIES, SKILL_CATEGORY_ICONS } from "@/lib/skills"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"

export function SkillsSidebar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentCategory = searchParams.get("category") ?? "all"

  const setCategory = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id === "all") {
        params.delete("category")
      } else {
        params.set("category", id)
      }
      const qs = params.toString()
      router.push(`/skills${qs ? `?${qs}` : ""}`)
    },
    [router, searchParams]
  )

  const handleSearch = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const form = e.currentTarget
      const input = form.elements.namedItem("q") as HTMLInputElement
      const q = input.value.trim()
      const params = new URLSearchParams(searchParams.toString())
      if (q) {
        params.set("q", q)
      } else {
        params.delete("q")
      }
      const qs = params.toString()
      router.push(`/skills${qs ? `?${qs}` : ""}`)
    },
    [router, searchParams]
  )

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/skills">
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Puzzle className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-medium">Skills</span>
                  <span className="text-xs text-sidebar-foreground/50">
                    Browse catalog
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <form onSubmit={handleSearch}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="q"
                  type="text"
                  placeholder="Search skills..."
                  defaultValue={searchParams.get("q") ?? ""}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </form>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Categories</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SKILL_CATEGORIES.map((cat) => {
                const Icon = SKILL_CATEGORY_ICONS[cat.id]
                const active = currentCategory === cat.id
                return (
                  <SidebarMenuItem key={cat.id}>
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => setCategory(cat.id)}
                    >
                      {Icon && <Icon className="size-4" />}
                      <span>{cat.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
