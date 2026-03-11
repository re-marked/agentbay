"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Rocket, Users, Zap, X, Loader2, CircleAlert } from "lucide-react"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { AgentAvatar, CATEGORY_COLORS, SYSTEM_AGENT_SLUGS, type AgentListItem } from "@/lib/agents"
import { RatingStars } from "@/components/agent-card"
import { hireAgent, checkInstanceStatus } from "@/lib/hire/actions"
import type { User } from "@supabase/supabase-js"

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}

interface AgentDetailSheetProps {
  agent: AgentListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
}

export function AgentDetailSheet({ agent, open, onOpenChange, user }: AgentDetailSheetProps) {
  const router = useRouter()
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!agent) return null

  async function handleDeploy() {
    if (!agent) return

    if (!user) {
      router.push("/login")
      return
    }

    setDeploying(true)
    setError(null)

    const result = await hireAgent({ agentSlug: agent.slug })

    if ('error' in result && result.error) {
      setError(result.error as string)
      setDeploying(false)
      return
    }

    if (result.alreadyHired && result.status === "running") {
      router.push("/workspace/home")
      return
    }

    const poll = async () => {
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        const status = await checkInstanceStatus(result.instanceId)
        if (!status) continue
        if (status.status === "running" || status.status === "suspended") {
          router.push("/workspace/home")
          return
        }
        if (status.status === "error") {
          setError("Provisioning failed. Please try again.")
          setDeploying(false)
          return
        }
      }
      setError("Provisioning timed out. Check your workspace.")
      setDeploying(false)
    }

    if (result.status === "provisioning") {
      router.push("/workspace/home")
    } else {
      await poll()
    }
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
            <AgentAvatar name={agent.name} category={agent.category} iconUrl={agent.icon_url} size="lg" />
            <div className="flex-1 min-w-0 pt-0.5">
              <DrawerTitle className="text-2xl font-bold leading-tight">
                {agent.name}
              </DrawerTitle>
              <DrawerDescription className="mt-1.5 text-[15px]">
                {agent.tagline}
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        {/* Stats */}
        <div className="px-8 py-6">
          <Card className="border-0 py-4">
            <CardContent className="flex gap-8 px-4">
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-2xl font-bold">{formatCount(agent.total_hires)}</span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Hires</span>
              </div>
              <div className="w-px bg-border/40" />
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-2xl font-bold">{agent.avg_rating?.toFixed(1) ?? "—"}</span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Rating</span>
              </div>
              <div className="w-px bg-border/40" />
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-2xl font-bold">{formatCount(agent.total_reviews)}</span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Reviews</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="px-8 pb-5">
          <RatingStars rating={agent.avg_rating} count={agent.total_reviews} size="md" />
        </div>

        <div className="flex gap-2 px-8 pb-6 flex-wrap">
          <Badge variant="secondary" className={CATEGORY_COLORS[agent.category] ?? "bg-secondary text-secondary-foreground"}>
            {agent.category}
          </Badge>
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-0">
            Free
          </Badge>
        </div>

        <div className="mx-8 border-t border-border/40" />

        <div className="px-8 py-6">
          <h3 className="text-sm font-semibold mb-3 text-foreground">About</h3>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            {agent.description}
          </p>
        </div>

        <div className="mx-8 border-t border-border/40" />

        <div className="px-8 py-6">
          <h3 className="text-sm font-semibold mb-4 text-foreground">Capabilities</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 text-[14px] text-muted-foreground">
              <Zap className="size-4 text-amber-400 shrink-0" />
              Fast responses
            </div>
            <div className="flex items-center gap-3 text-[14px] text-muted-foreground">
              <Users className="size-4 text-primary shrink-0" />
              Team compatible
            </div>
            <div className="flex items-center gap-3 text-[14px] text-muted-foreground">
              <Rocket className="size-4 text-emerald-400 shrink-0" />
              Always available
            </div>
          </div>
        </div>

        {/* Deploy CTA */}
        <DrawerFooter className="sticky bottom-0 bg-sidebar/95 backdrop-blur-sm border-t border-border/40 p-8">
          {(SYSTEM_AGENT_SLUGS as readonly string[]).includes(agent.slug) ? (
            <p className="text-center text-sm text-muted-foreground">
              {agent.slug === 'personal-ai'
                ? 'Your Co-Founder is created automatically when you set up your corporation.'
                : 'Team Leaders are created automatically when you create a team.'}
            </p>
          ) : (
            <Button
              size="lg"
              disabled={deploying}
              onClick={handleDeploy}
              className="w-full rounded-xl font-semibold text-base h-13"
            >
              {deploying ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="size-4 mr-2" />
                  Deploy this Assistant
                </>
              )}
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>

      {/* Error dialog */}
      <AlertDialog open={!!error} onOpenChange={(open) => { if (!open) setError(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-red-500/15">
              <CircleAlert className="text-red-400" />
            </AlertDialogMedia>
            <AlertDialogTitle>Couldn&apos;t deploy</AlertDialogTitle>
            <AlertDialogDescription>{error}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Drawer>
  )
}
