import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { getActiveProjectId, getProjectAgents, toAgentInfoList } from '@/lib/projects/queries'
import { Channels, Teams } from '@agentbay/db/primitives'
import { DebugProvider } from '@/components/debug/debug-provider'
import { DebugPanel } from '@/components/debug/debug-panel'
import { WorkspaceHeader, WorkspaceHeaderProvider } from '@/components/workspace-header'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { corporations, projects, activeProjectId, coFounderInstanceId, userMemberId } =
    await getActiveProjectId(user.id)

  // Run queries in parallel
  const [instances, broadcastChannels, teams] = await Promise.all([
    getProjectAgents(user.id, activeProjectId),
    activeProjectId ? loadBroadcastChannels(activeProjectId) : [],
    activeProjectId ? loadTeamsWithChannels(activeProjectId) : [],
  ])
  const allAgents = toAgentInfoList(instances)

  // Separate co-founder from regular agents
  const coFounder = coFounderInstanceId
    ? allAgents.find(a => a.instanceId === coFounderInstanceId) ?? null
    : null
  const agents = coFounder
    ? allAgents.filter(a => a.instanceId !== coFounderInstanceId)
    : allAgents

  return (
    <DebugProvider>
      <SidebarProvider className="h-svh !min-h-0">
        <AppSidebar
          userEmail={user.email}
          userMemberId={userMemberId}
          corporationName={corporations[0]?.name}
          coFounder={coFounder}
          agents={agents}
          broadcastChannels={broadcastChannels}
          teams={teams}
          projects={projects}
          activeProjectId={activeProjectId}
        />
        <SidebarInset className="overflow-hidden">
          <WorkspaceHeaderProvider>
            <WorkspaceHeader
              corporationName={corporations[0]?.name}
              projects={projects}
              activeProjectId={activeProjectId}
              broadcastChannels={broadcastChannels}
              teams={teams}
            />
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
              {children}
            </div>
          </WorkspaceHeaderProvider>
        </SidebarInset>
      </SidebarProvider>
      <DebugPanel />
    </DebugProvider>
  )
}

async function loadBroadcastChannels(projectId: string) {
  const channels = await Channels.listBroadcasts(projectId)
  return channels.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
  }))
}

async function loadTeamsWithChannels(projectId: string) {
  // Load active teams and team channels in parallel
  const [teams, teamChannels] = await Promise.all([
    Teams.listActive(projectId),
    Channels.listTeamChannels(projectId),
  ])

  if (!teams.length) return []

  // Group channels by team
  const channelsByTeam = new Map<string, typeof teamChannels>()
  for (const ch of teamChannels) {
    if (!ch.team_id) continue
    const list = channelsByTeam.get(ch.team_id) ?? []
    list.push(ch)
    channelsByTeam.set(ch.team_id, list)
  }

  return teams.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    channels: (channelsByTeam.get(t.id) ?? []).map(ch => ({
      id: ch.id,
      name: ch.name,
      description: ch.description,
    })),
  }))
}
