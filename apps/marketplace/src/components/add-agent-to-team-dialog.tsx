'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, UserPlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { AgentAvatar } from '@/lib/agents'
import { addAgentToTeam } from '@/lib/workspace/team-actions'

interface AgentOption {
  instanceId: string
  name: string
  category: string
  iconUrl: string | null
}

export function AddAgentToTeamDialog({
  teamId,
  teamName,
  agents,
  children,
}: {
  teamId: string
  teamName: string
  agents: AgentOption[]
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleAdd(instanceId: string) {
    startTransition(async () => {
      try {
        await addAgentToTeam(teamId, instanceId)
        setOpen(false)
        router.refresh()
      } catch (err) {
        console.error('Failed to add agent to team:', err)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <button
            className="text-sidebar-foreground/40 hover:text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-all focus-visible:ring-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4" />
            Add to {teamName}
          </DialogTitle>
          <DialogDescription>
            Select an agent to add to this team.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No agents available to add.
            </p>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.instanceId}
                onClick={() => handleAdd(agent.instanceId)}
                disabled={isPending}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                <AgentAvatar
                  name={agent.name}
                  category={agent.category}
                  iconUrl={agent.iconUrl}
                  size="xs"
                />
                <span className="truncate">{agent.name}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
