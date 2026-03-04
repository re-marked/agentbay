"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Download,
  ExternalLink,
  Loader2,
  Plus,
  Wrench,
  Terminal,
  KeyRound,
  X,
  Check,
} from "lucide-react"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  SkillEmoji,
  SKILL_CATEGORY_COLORS,
  SKILL_SOURCE_COLORS,
  type SkillListItem,
  type SkillDetail,
} from "@/lib/skills"
import { installSkill, getUserInstances } from "@/lib/skills/actions"
import type { User } from "@supabase/supabase-js"

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}

interface SkillDetailSheetProps {
  skill: SkillListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
}

export function SkillDetailSheet({
  skill,
  open,
  onOpenChange,
  user,
}: SkillDetailSheetProps) {
  const router = useRouter()
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [instances, setInstances] = useState<
    { id: string; display_name: string | null; status: string }[]
  >([])
  const [selectedInstance, setSelectedInstance] = useState<string>("")
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch full detail + user instances when a skill is selected
  useEffect(() => {
    if (!skill || !open) {
      setDetail(null)
      setInstalled(false)
      setError(null)
      setSelectedInstance("")
      return
    }

    setLoadingDetail(true)
    fetch(`/api/skills/${skill.slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return
        setDetail(data as SkillDetail)
      })
      .finally(() => setLoadingDetail(false))

    if (user) {
      getUserInstances().then((data) => {
        setInstances(data)
        if (data.length === 1) setSelectedInstance(data[0].id)
      })
    }
  }, [skill, open, user])

  if (!skill) return null

  const requires = detail?.requires ?? {}
  const hasRequirements =
    (requires.tools && requires.tools.length > 0) ||
    (requires.binaries && requires.binaries.length > 0) ||
    (requires.env && requires.env.length > 0)

  async function handleInstall() {
    if (!skill || !selectedInstance) return

    if (!user) {
      router.push("/login")
      return
    }

    setInstalling(true)
    setError(null)

    const result = await installSkill({
      skillSlug: skill.slug,
      instanceId: selectedInstance,
    })

    if ("error" in result && result.error) {
      setError(result.error)
      setInstalling(false)
      return
    }

    setInstalled(true)
    setInstalling(false)
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="!w-[540px] !max-w-[90vw] !sm:max-w-none bg-sidebar border-l border-border/40 overflow-x-hidden overflow-y-auto">
        <DrawerClose className="absolute top-5 right-5 z-10 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
          <X className="size-5" />
          <span className="sr-only">Close</span>
        </DrawerClose>

        <DrawerHeader className="p-8 pb-0">
          <div className="flex items-start gap-5">
            <SkillEmoji emoji={skill.emoji} name={skill.name} size="lg" />
            <div className="flex-1 min-w-0 pt-0.5">
              <DrawerTitle className="text-2xl font-bold leading-tight">
                {skill.name}
              </DrawerTitle>
              <DrawerDescription className="mt-1.5 text-[15px]">
                {skill.description}
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        {/* Stats */}
        <div className="px-8 py-6">
          <Card className="border-0 py-4">
            <CardContent className="flex gap-8 px-4">
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-2xl font-bold">
                  {formatCount(skill.total_installs)}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Installs
                </span>
              </div>
              <div className="w-px bg-border/40" />
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-2xl font-bold">{skill.version}</span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Version
                </span>
              </div>
              <div className="w-px bg-border/40" />
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-2xl font-bold capitalize">
                  {skill.source}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Source
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Badges */}
        <div className="flex gap-2 px-8 pb-6 flex-wrap">
          <Badge
            variant="secondary"
            className={
              SKILL_CATEGORY_COLORS[skill.category] ??
              "bg-secondary text-secondary-foreground"
            }
          >
            {skill.category}
          </Badge>
          <Badge
            variant="secondary"
            className={
              SKILL_SOURCE_COLORS[skill.source] ??
              "bg-secondary text-secondary-foreground"
            }
          >
            {skill.source}
          </Badge>
          {skill.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="mx-8 border-t border-border/40" />

        {/* Requirements */}
        {hasRequirements && (
          <>
            <div className="px-8 py-6">
              <h3 className="text-sm font-semibold mb-4 text-foreground">
                Requirements
              </h3>
              <div className="space-y-3">
                {requires.tools && requires.tools.length > 0 && (
                  <div className="flex items-center gap-3 text-[14px] text-muted-foreground">
                    <Wrench className="size-4 text-amber-400 shrink-0" />
                    <span>
                      Tools: {requires.tools.join(", ")}
                    </span>
                  </div>
                )}
                {requires.binaries && requires.binaries.length > 0 && (
                  <div className="flex items-center gap-3 text-[14px] text-muted-foreground">
                    <Terminal className="size-4 text-emerald-400 shrink-0" />
                    <span>
                      Binaries: {requires.binaries.join(", ")}
                    </span>
                  </div>
                )}
                {requires.env && requires.env.length > 0 && (
                  <div className="flex items-center gap-3 text-[14px] text-muted-foreground">
                    <KeyRound className="size-4 text-primary shrink-0" />
                    <span>
                      Env vars: {requires.env.join(", ")}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="mx-8 border-t border-border/40" />
          </>
        )}

        {/* SKILL.md preview */}
        <div className="px-8 py-6">
          <h3 className="text-sm font-semibold mb-3 text-foreground">
            Skill Definition
          </h3>
          {loadingDetail ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          ) : detail?.skill_content ? (
            <pre className="text-[13px] text-muted-foreground bg-card rounded-lg p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {detail.skill_content}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              No skill content available.
            </p>
          )}
        </div>

        {/* Homepage link */}
        {detail?.homepage && (
          <div className="px-8 pb-6">
            <a
              href={detail.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" />
              View on {skill.source === "openclaw" ? "ClawHub" : skill.source}
            </a>
          </div>
        )}

        {/* Install CTA */}
        <DrawerFooter className="sticky bottom-0 bg-sidebar/95 backdrop-blur-sm border-t border-border/40 p-8">
          {error && (
            <Alert variant="destructive" className="mb-3 border-0 bg-red-500/10">
              <AlertDescription className="text-red-400">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {user && instances.length > 0 && (
            <div className="mb-3">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Add to Agent
              </label>
              <Select
                value={selectedInstance}
                onValueChange={setSelectedInstance}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.display_name ?? "Unnamed Agent"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            size="lg"
            disabled={
              installing ||
              installed ||
              (!!user && instances.length > 0 && !selectedInstance)
            }
            onClick={handleInstall}
            className="w-full rounded-xl font-semibold text-base h-13"
          >
            {installed ? (
              <>
                <Check className="size-4 mr-2" />
                Installed
              </>
            ) : installing ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Installing...
              </>
            ) : !user ? (
              <>
                <Plus className="size-4 mr-2" />
                Sign in to Install
              </>
            ) : instances.length === 0 ? (
              <>
                <Download className="size-4 mr-2" />
                Hire an Agent First
              </>
            ) : (
              <>
                <Plus className="size-4 mr-2" />
                Add to Agent
              </>
            )}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
