'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { AgentAvatar } from '@/lib/agents'
import { Users, ChevronRight, UserPlus } from 'lucide-react'
import { AddAgentToTeamDialog } from '@/components/add-agent-to-team-dialog'

export interface MemberInfo {
  id: string
  displayName: string
  type: 'user' | 'agent'
  iconUrl?: string | null
  category?: string
  role?: string
}

interface ChannelMemberListProps {
  members: MemberInfo[]
  teamId?: string
  teamName?: string
  availableAgents?: { instanceId: string; name: string; category: string; iconUrl: string | null }[]
}

export function ChannelMemberList({ members, teamId, teamName, availableAgents = [] }: ChannelMemberListProps) {
  const [collapsed, setCollapsed] = useState(false)

  const users = members.filter(m => m.type === 'user')
  const agents = members.filter(m => m.type === 'agent')

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex h-full w-10 shrink-0 flex-col items-center gap-2 border-l border-border/40 bg-background/50 pt-4 hover:bg-muted/30 transition-colors"
      >
        <Users className="size-4 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground font-medium">{members.length}</span>
      </button>
    )
  }

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-l border-border/40 bg-background/50">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Members — {members.length}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded p-0.5 hover:bg-muted transition-colors"
        >
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-4">
        {agents.length > 0 && (
          <MemberSection label="Agents" members={agents} />
        )}
        {users.length > 0 && (
          <MemberSection label="Users" members={users} />
        )}

        {/* Add Agent button for team channels */}
        {teamId && teamName && (
          <div className="mt-2 px-1">
            <AddAgentToTeamDialog
              teamId={teamId}
              teamName={teamName}
              agents={availableAgents}
            >
              <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
                <UserPlus className="size-4 shrink-0" />
                <span>Add Agent</span>
              </button>
            </AddAgentToTeamDialog>
          </div>
        )}
      </div>
    </div>
  )
}

function MemberSection({ label, members }: { label: string; members: MemberInfo[] }) {
  return (
    <div className="mb-3">
      <div className="px-2 py-1.5">
        <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
          {label} — {members.length}
        </span>
      </div>
      {members.map(m => (
        <div
          key={m.id}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors cursor-default"
        >
          {m.type === 'agent' ? (
            <AgentAvatar
              name={m.displayName}
              category={m.category ?? ''}
              iconUrl={m.iconUrl}
              size="xs"
            />
          ) : (
            <Avatar className="h-5 w-5 rounded-md">
              <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-medium rounded-md">
                {m.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          <span className="text-sm text-foreground/80 truncate leading-none">
            {m.type === 'user' ? 'You' : m.displayName}
          </span>
        </div>
      ))}
    </div>
  )
}
