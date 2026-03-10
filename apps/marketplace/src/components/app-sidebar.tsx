"use client"

import * as React from "react"
import { useState } from "react"
import { Home, Settings, Plus, BarChart3, Key, Sparkles, CompassIcon, Hash, ListTodo, ChevronRight, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { WorkspaceSwitcher, type ProjectInfo } from "@/components/workspace-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { AgentAvatar } from "@/lib/agents"
import { AgentProfileCard } from "@/components/agent-profile-card"
import { useUnreadNotifications } from "@/hooks/use-unread-notifications"
import { CreateTeamDialog } from "@/components/create-team-dialog"
import { AddAgentToTeamDialog } from "@/components/add-agent-to-team-dialog"

interface AgentInfo {
  instanceId: string
  name: string
  slug: string
  category: string
  tagline: string
  status: string
  iconUrl: string | null
}

interface BroadcastChannelInfo {
  id: string
  name: string
  description: string | null
}

export interface TeamInfo {
  id: string
  name: string
  description: string | null
  channels: BroadcastChannelInfo[]
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userEmail?: string
  userMemberId?: string | null
  corporationName?: string
  coFounder?: AgentInfo | null
  agents?: AgentInfo[]
  broadcastChannels?: BroadcastChannelInfo[]
  teams?: TeamInfo[]
  projects?: ProjectInfo[]
  activeProjectId?: string | null
}

const STATUS_DOT: Record<string, string> = {
  running: "bg-status-running",
  suspended: "bg-status-suspended",
  provisioning: "bg-status-provisioning animate-pulse",
  error: "bg-status-error",
}

export function AppSidebar({
  userEmail,
  userMemberId = null,
  corporationName,
  coFounder = null,
  agents = [],
  broadcastChannels = [],
  teams = [],
  projects = [],
  activeProjectId = null,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname()

  // Collect all channels for unread tracking (broadcast + team)
  const allChannels = React.useMemo(() => {
    const teamChannels = teams.flatMap(t => t.channels)
    return [...broadcastChannels, ...teamChannels]
  }, [broadcastChannels, teams])

  const { unreadCounts } = useUnreadNotifications(allChannels, userMemberId)

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <WorkspaceSwitcher corporationName={corporationName} projects={projects} activeProjectId={activeProjectId} userEmail={userEmail} />
      </SidebarHeader>

      <SidebarContent>
        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/workspace/home"}>
                  <Link href="/workspace/home">
                    <Home className="size-4" />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/workspace/tasks"}>
                  <Link href="/workspace/tasks">
                    <ListTodo className="size-4" />
                    <span>Tasks</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/discover"}>
                  <Link href="/discover">
                    <CompassIcon className="size-4" />
                    <span>Discover</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/skills"}>
                  <Link href="/skills">
                    <Sparkles className="size-4" />
                    <span>Skills</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Co-Founder */}
        {coFounder && (
          <SidebarGroup>
            <SidebarGroupLabel>Co-Founder</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(`/workspace/dm/${coFounder.instanceId}`)}
                    className="gap-2.5 border-l-2 border-primary bg-primary/[0.04]"
                  >
                    <Link href={`/workspace/dm/${coFounder.instanceId}`}>
                      <AgentProfileCard
                        instanceId={coFounder.instanceId}
                        name={coFounder.name}
                        category={coFounder.category}
                        status={coFounder.status}
                        iconUrl={coFounder.iconUrl}
                        tagline={coFounder.tagline}
                      >
                        <span className="relative flex shrink-0">
                          <AgentAvatar name={coFounder.name} category={coFounder.category} iconUrl={coFounder.iconUrl} size="xs" />
                          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-sidebar bg-status-running" />
                        </span>
                      </AgentProfileCard>
                      <span className="truncate">{coFounder.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Your Agents */}
        <SidebarGroup>
          <SidebarGroupLabel>Your Agents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {agents.map((agent) => {
                const agentBase = `/workspace/agent/${agent.instanceId}`
                const isActive = pathname.startsWith(agentBase)
                return (
                  <SidebarMenuItem key={agent.instanceId}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="gap-2.5"
                    >
                      <Link href={agentBase}>
                        <AgentProfileCard
                          instanceId={agent.instanceId}
                          name={agent.name}
                          category={agent.category}
                          status={agent.status}
                          iconUrl={agent.iconUrl}
                          tagline={agent.tagline}
                        >
                          <span className="relative flex shrink-0">
                            <AgentAvatar name={agent.name} category={agent.category} iconUrl={agent.iconUrl} size="xs" />
                            <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-sidebar ${STATUS_DOT[agent.status] ?? "bg-zinc-400"}`} />
                          </span>
                        </AgentProfileCard>
                        <span className="truncate">{agent.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}

              {/* Hire new agent */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/discover" className="text-muted-foreground">
                    <Plus className="size-4" />
                    <span>Hire an Agent</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Direct Messages (minus co-founder) */}
        <SidebarGroup>
          <SidebarGroupLabel>Direct Messages</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {agents.map((agent) => {
                const dmPath = `/workspace/dm/${agent.instanceId}`
                const isActive = pathname.startsWith(dmPath)
                return (
                  <SidebarMenuItem key={agent.instanceId}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="gap-2.5"
                    >
                      <Link href={dmPath}>
                        <AgentProfileCard
                          instanceId={agent.instanceId}
                          name={agent.name}
                          category={agent.category}
                          status={agent.status}
                          iconUrl={agent.iconUrl}
                          tagline={agent.tagline}
                        >
                          <span className="flex shrink-0">
                            <AgentAvatar name={agent.name} category={agent.category} iconUrl={agent.iconUrl} size="xs" />
                          </span>
                        </AgentProfileCard>
                        <span className="truncate">{agent.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}

              {agents.length === 0 && !coFounder && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/discover" className="text-muted-foreground">
                      <Plus className="size-4" />
                      <span>Hire an Agent</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Workspace Channels (broadcast) */}
        {broadcastChannels.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Channels</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {broadcastChannels.map((ch) => (
                  <ChannelItem
                    key={ch.id}
                    channel={ch}
                    pathname={pathname}
                    unreadCount={unreadCounts[ch.id] ?? 0}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Team categories — Discord-style collapsible groups */}
        {teams.map((team) => (
          <TeamCategory
            key={team.id}
            team={team}
            agents={agents}
            coFounder={coFounder}
            pathname={pathname}
            unreadCounts={unreadCounts}
          />
        ))}

        {/* Create Team button (shown after teams or after channels) */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <CreateTeamDialog>
                  <SidebarMenuButton className="text-muted-foreground gap-2.5">
                    <Users className="size-4" />
                    <span>Create Team</span>
                  </SidebarMenuButton>
                </CreateTeamDialog>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Account */}
        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/workspace/usage"}>
                  <Link href="/workspace/usage">
                    <BarChart3 className="size-4" />
                    <span>Usage</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/workspace/settings"}>
                  <Link href="/workspace/settings">
                    <Key className="size-4" />
                    <span>API Keys</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/workspace/settings/general"}>
                  <Link href="/workspace/settings/general">
                    <Settings className="size-4" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {userEmail && (
        <SidebarFooter>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Avatar size="sm">
              <AvatarFallback className="bg-zinc-600 text-white text-xs">
                {userEmail[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sidebar-foreground/70 truncate text-xs">
              {userEmail}
            </span>
          </div>
        </SidebarFooter>
      )}

      <SidebarRail />

    </Sidebar>
  )
}

// ── Channel item (shared between broadcast + team sections) ──────────

function ChannelItem({
  channel,
  pathname,
  unreadCount,
}: {
  channel: BroadcastChannelInfo
  pathname: string
  unreadCount: number
}) {
  const chPath = `/workspace/c/${channel.id}`
  const isActive = pathname.startsWith(chPath)
  const hasUnread = unreadCount > 0

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} className="gap-2.5">
        <Link href={chPath}>
          <Hash className="size-4" />
          <span className={`truncate ${hasUnread ? 'font-semibold text-sidebar-foreground' : ''}`}>
            {channel.name}
          </span>
          {hasUnread && (
            <span className="ml-auto flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

// ── Team category — Discord-style collapsible group ──────────────────

function TeamCategory({
  team,
  agents,
  coFounder,
  pathname,
  unreadCounts,
}: {
  team: TeamInfo
  agents: AgentInfo[]
  coFounder: AgentInfo | null
  pathname: string
  unreadCounts: Record<string, number>
}) {
  const [open, setOpen] = useState(true)

  // Check if any channel in this team has unread messages
  const teamHasUnread = team.channels.some(ch => (unreadCounts[ch.id] ?? 0) > 0)

  // All agents available to add (including co-founder)
  const allAgents = coFounder ? [coFounder, ...agents] : agents

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarGroup className="py-0">
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="flex w-full items-center gap-1">
            <ChevronRight className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            <span className="truncate uppercase tracking-wider">{team.name}</span>
            {teamHasUnread && !open && (
              <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            )}
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <AddAgentToTeamDialog teamId={team.id} teamName={team.name} agents={allAgents}>
          <SidebarGroupAction title="Add agent to team">
            <Plus className="size-4" />
          </SidebarGroupAction>
        </AddAgentToTeamDialog>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {team.channels.map((ch) => (
                <ChannelItem
                  key={ch.id}
                  channel={ch}
                  pathname={pathname}
                  unreadCount={unreadCounts[ch.id] ?? 0}
                />
              ))}
              {team.channels.length === 0 && (
                <SidebarMenuItem>
                  <span className="px-2 py-1 text-xs text-muted-foreground/50">
                    No channels
                  </span>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
