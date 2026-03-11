"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, X } from "lucide-react"
import { AgentAvatar } from "@/lib/agents"
import { AgentProfileCard } from "@/components/agent-profile-card"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ChatAgent {
  instanceId: string
  name: string
  slug: string
  category: string
  status: string
  iconUrl: string | null
}

interface ChatMemberPanelProps {
  chatId: string
  agents: ChatAgent[]
  allAgents: {
    instanceId: string
    name: string
    slug: string
    category: string
    status: string
    iconUrl: string | null
  }[]
}

const STATUS_LABELS: Record<string, { label: string; dot: string }> = {
  running: { label: "Online", dot: "bg-emerald-400" },
  suspended: { label: "Idle", dot: "bg-amber-400" },
  provisioning: { label: "Starting", dot: "bg-blue-400 animate-pulse" },
}

export function ChatMemberPanel({ chatId, agents, allAgents }: ChatMemberPanelProps) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const online = agents.filter((a) => a.status === "running")
  const offline = agents.filter((a) => a.status !== "running")

  // Agents not yet in this chat
  const chatInstanceIds = new Set(agents.map((a) => a.instanceId))
  const available = allAgents.filter((a) => !chatInstanceIds.has(a.instanceId))

  async function handleAddAgent(instanceId: string) {
    try {
      await fetch(`/api/chats/${chatId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
      })
      setAddOpen(false)
      router.refresh()
    } catch {
      // silently fail
    }
  }

  async function handleRemoveAgent(instanceId: string) {
    try {
      await fetch(`/api/chats/${chatId}/agents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
      })
      router.refresh()
    } catch {
      // silently fail
    }
  }

  return (
    <div className="flex h-full w-[17rem] shrink-0 flex-col border-l border-border/40 bg-background/50">
      <div className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Members &mdash; {agents.length}
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-4">
        {/* Online section */}
        {online.length > 0 && (
          <div>
            <div className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Online &mdash; {online.length}
            </div>
            {online.map((agent) => (
              <AgentRow
                key={agent.instanceId}
                agent={agent}
                isHovered={hoveredId === agent.instanceId}
                onHover={setHoveredId}
                onRemove={handleRemoveAgent}
              />
            ))}
          </div>
        )}

        {/* Offline section */}
        {offline.length > 0 && (
          <div>
            <div className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Offline &mdash; {offline.length}
            </div>
            {offline.map((agent) => (
              <AgentRow
                key={agent.instanceId}
                agent={agent}
                isHovered={hoveredId === agent.instanceId}
                onHover={setHoveredId}
                onRemove={handleRemoveAgent}
                dimmed
              />
            ))}
          </div>
        )}

        {agents.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No agents in this chat yet
          </div>
        )}
      </div>

      {/* Add agent button */}
      <div className="p-2 border-t border-border/40">
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
              <Plus className="size-4" />
              Add Agent
            </Button>
          </PopoverTrigger>
          <PopoverContent side="left" align="end" className="w-64 p-2">
            <div className="text-xs font-semibold text-muted-foreground pb-2 px-1">
              Available Agents
            </div>
            {available.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-3">
                All agents are already in this chat
              </div>
            ) : (
              <div className="space-y-0.5">
                {available.map((agent) => (
                  <button
                    key={agent.instanceId}
                    onClick={() => handleAddAgent(agent.instanceId)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                  >
                    <span className="relative flex shrink-0">
                      <AgentAvatar name={agent.name} category={agent.category} iconUrl={agent.iconUrl} size="xs" />
                      <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${
                        STATUS_LABELS[agent.status]?.dot ?? "bg-zinc-400"
                      }`} />
                    </span>
                    <span className="truncate">{agent.name}</span>
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

function AgentRow({
  agent,
  isHovered,
  onHover,
  onRemove,
  dimmed,
}: {
  agent: ChatAgent
  isHovered: boolean
  onHover: (id: string | null) => void
  onRemove: (id: string) => void
  dimmed?: boolean
}) {
  const statusInfo = STATUS_LABELS[agent.status] ?? { label: "Offline", dot: "bg-zinc-400" }

  return (
    <div
      className={`group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors ${
        dimmed ? "opacity-50" : ""
      }`}
      onMouseEnter={() => onHover(agent.instanceId)}
      onMouseLeave={() => onHover(null)}
    >
      <AgentProfileCard
        instanceId={agent.instanceId}
        name={agent.name}
        category={agent.category}
        status={agent.status}
        iconUrl={agent.iconUrl}
        side="left"
      >
        <span className="relative flex shrink-0 cursor-pointer">
          <AgentAvatar name={agent.name} category={agent.category} iconUrl={agent.iconUrl} size="xs" />
          <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${statusInfo.dot}`} />
        </span>
      </AgentProfileCard>
      <span className="flex-1 truncate text-sm">{agent.name}</span>
      {isHovered && (
        <button
          onClick={() => onRemove(agent.instanceId)}
          className="text-muted-foreground hover:text-destructive transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
