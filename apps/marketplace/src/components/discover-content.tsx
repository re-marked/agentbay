"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Search, Shield } from "lucide-react"
import { AgentCardLarge } from "@/components/agent-card"
import { AgentDetailSheet } from "@/components/agent-detail-sheet"
import type { AgentListItem } from "@/lib/agents"
import type { User } from "@supabase/supabase-js"

export function DiscoverContent({
  systemAgents = [],
  agents,
  user,
}: {
  systemAgents?: AgentListItem[]
  agents: AgentListItem[]
  user: User | null
}) {
  const searchParams = useSearchParams()
  const query = searchParams.get("q")
  const category = searchParams.get("category")

  const [selectedAgent, setSelectedAgent] = useState<AgentListItem | null>(null)

  const heading = query
    ? `Results for \u201c${query}\u201d`
    : category && category !== "all"
      ? category.charAt(0).toUpperCase() + category.slice(1)
      : "Discover"

  const showSystem = systemAgents.length > 0 && !query && (!category || category === "all" || category === "system")
  const isEmpty = agents.length === 0 && !showSystem

  return (
    <main className="px-8 py-8 lg:px-12">
      <h1 className="text-[28px] font-bold tracking-tight mb-8">{heading}</h1>

      {/* System agents — always at top */}
      {showSystem && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="size-4 text-indigo-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-400">System</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {systemAgents.map((agent) => (
              <AgentCardLarge
                key={agent.id}
                agent={agent}
                onSelect={setSelectedAgent}
              />
            ))}
          </div>
        </section>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary mb-5">
            <Search className="h-9 w-9 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No assistants found</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Try a different search term or browse another category.
          </p>
        </div>
      ) : agents.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {agents.map((agent) => (
            <AgentCardLarge
              key={agent.id}
              agent={agent}
              onSelect={setSelectedAgent}
            />
          ))}
        </div>
      ) : null}

      <AgentDetailSheet
        agent={selectedAgent}
        open={!!selectedAgent}
        onOpenChange={(open) => { if (!open) setSelectedAgent(null) }}
        user={user}
      />
    </main>
  )
}
