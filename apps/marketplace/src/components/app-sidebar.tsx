"use client"

import * as React from "react"
import { Home, Settings, Plus, BarChart3, Key, Sparkles, MoreHorizontal, Pencil, Trash2, CompassIcon, Hash } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { toast } from "sonner"
import { WorkspaceSwitcher, type ProjectInfo } from "@/components/workspace-switcher"
import { ConfirmDialog } from "@/components/confirm-dialog"
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
  SidebarMenuAction,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

interface ChatInfo {
  id: string
  name: string
  agentCount: number
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userEmail?: string
  agents?: AgentInfo[]
  chats?: ChatInfo[]
  projects?: ProjectInfo[]
  activeProjectId?: string | null
}

/** Discord-style channel name: lowercase, dashes for spaces, keep emojis */
function toChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

const STATUS_DOT: Record<string, string> = {
  running: "bg-status-running",
  suspended: "bg-status-suspended",
  provisioning: "bg-status-provisioning animate-pulse",
  error: "bg-status-error",
}

export function AppSidebar({
  userEmail,
  agents = [],
  chats = [],
  projects = [],
  activeProjectId = null,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isCreating, setIsCreating] = React.useState(false)
  const [newChatName, setNewChatName] = React.useState("")
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
  const [deletingChatId, setDeletingChatId] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const renameRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (isCreating && inputRef.current) inputRef.current.focus()
  }, [isCreating])

  React.useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus()
  }, [renamingId])

  async function handleCreateChat() {
    const name = toChannelName(newChatName.trim())
    if (!name) {
      setIsCreating(false)
      return
    }
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        const { chat } = await res.json()
        setIsCreating(false)
        setNewChatName("")
        router.push(`/workspace/chat/${chat.id}`)
        router.refresh()
      }
    } catch {
      // silently fail
    }
  }

  async function handleRenameChat(chatId: string) {
    const name = toChannelName(renameValue.trim())
    if (!name) {
      setRenamingId(null)
      return
    }
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (res.ok) toast.success(`Channel renamed to #${name}`)
      setRenamingId(null)
      setRenameValue("")
      router.refresh()
    } catch {
      setRenamingId(null)
    }
  }

  async function handleDeleteChat(chatId: string) {
    try {
      await fetch(`/api/chats/${chatId}`, { method: "DELETE" })
      if (pathname.startsWith(`/workspace/chat/${chatId}`)) {
        router.push("/workspace/home")
      }
      router.refresh()
    } catch {
      // silently fail
    }
  }

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <WorkspaceSwitcher projects={projects} activeProjectId={activeProjectId} userEmail={userEmail} />
      </SidebarHeader>

      <SidebarContent>
        {/* Home + Discover */}
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

        {/* Direct Messages */}
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

              {agents.length === 0 && (
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

        {/* Group Chats */}
        <SidebarGroup>
          <SidebarGroupLabel>Group Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {chats.map((chat) => {
                const chatPath = `/workspace/chat/${chat.id}`
                const isActive = pathname.startsWith(chatPath)

                if (renamingId === chat.id) {
                  return (
                    <SidebarMenuItem key={chat.id}>
                      <div className="flex items-center gap-2 px-2 py-1">
                        <Hash className="size-4 shrink-0 text-muted-foreground" />
                        <input
                          ref={renameRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameChat(chat.id)
                            if (e.key === "Escape") setRenamingId(null)
                          }}
                          onBlur={() => handleRenameChat(chat.id)}
                          className="flex-1 bg-transparent text-sm outline-none border-b border-primary"
                        />
                      </div>
                    </SidebarMenuItem>
                  )
                }

                return (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton asChild isActive={isActive} className="gap-2.5">
                      <Link href={chatPath}>
                        <Hash className="size-4" />
                        <span className="truncate">{toChannelName(chat.name)}</span>
                      </Link>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction>
                          <MoreHorizontal className="size-4" />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem
                          onClick={() => {
                            setRenamingId(chat.id)
                            setRenameValue(toChannelName(chat.name))
                          }}
                        >
                          <Pencil className="size-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeletingChatId(chat.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                )
              })}

              {/* New chat inline input */}
              {isCreating ? (
                <SidebarMenuItem>
                  <div className="flex items-center gap-2 px-2 py-1">
                    <Hash className="size-4 shrink-0 text-muted-foreground" />
                    <input
                      ref={inputRef}
                      value={newChatName}
                      onChange={(e) => setNewChatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateChat()
                        if (e.key === "Escape") {
                          setIsCreating(false)
                          setNewChatName("")
                        }
                      }}
                      onBlur={() => {
                        if (!newChatName.trim()) {
                          setIsCreating(false)
                          setNewChatName("")
                        }
                      }}
                      placeholder="new-channel"
                      className="flex-1 bg-transparent text-sm outline-none border-b border-primary placeholder:text-muted-foreground/50"
                    />
                  </div>
                </SidebarMenuItem>
              ) : (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setIsCreating(true)}
                    className="text-muted-foreground"
                  >
                    <Plus className="size-4" />
                    <span>New Chat</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
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

      {/* Chat delete confirmation */}
      <ConfirmDialog
        open={deletingChatId !== null}
        onOpenChange={(open) => { if (!open) setDeletingChatId(null) }}
        title={`Delete #${deletingChatId ? toChannelName(chats.find((c) => c.id === deletingChatId)?.name ?? '') : ''}?`}
        description="This will permanently delete the channel and all its messages. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deletingChatId) {
            handleDeleteChat(deletingChatId)
            setDeletingChatId(null)
          }
        }}
      />
    </Sidebar>
  )
}
