"use client"

import * as React from "react"
import { Home, Settings, Plus, BarChart3, Key, Sparkles, CompassIcon, Hash, ListTodo } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { WorkspaceSwitcher, type ProjectInfo } from "@/components/workspace-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { AgentAvatar } from "@/lib/agents"
import { AgentProfileCard } from "@/components/agent-profile-card"

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

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userEmail?: string
  corporationName?: string
  coFounder?: AgentInfo | null
  agents?: AgentInfo[]
  broadcastChannels?: BroadcastChannelInfo[]
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
  corporationName,
  coFounder = null,
  agents = [],
  broadcastChannels = [],
  projects = [],
  activeProjectId = null,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname()

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
                {broadcastChannels.map((ch) => {
                  const chPath = `/workspace/c/${ch.id}`
                  const isActive = pathname.startsWith(chPath)
                  return (
                    <SidebarMenuItem key={ch.id}>
                      <SidebarMenuButton asChild isActive={isActive} className="gap-2.5">
                        <Link href={chPath}>
                          <Hash className="size-4" />
                          <span className="truncate">{ch.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}


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
