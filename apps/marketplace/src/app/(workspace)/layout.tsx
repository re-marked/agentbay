import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { getActiveProjectId, getProjectAgents, toAgentInfoList } from '@/lib/projects/queries'
import { createServiceClient } from '@agentbay/db/server'
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
  const db = createServiceClient()
  const { data } = await db
    .from('channels')
    .select('id, name, description')
    .eq('project_id', projectId)
    .eq('kind', 'broadcast')
    .eq('archived', false)
    .order('name', { ascending: true })

  return (data ?? []).map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
  }))
}

async function loadTeamsWithChannels(projectId: string) {
  const db = createServiceClient()

  // Load active teams with their channels in parallel
  const [{ data: teams }, { data: teamChannels }] = await Promise.all([
    db
      .from('teams')
      .select('id, name, description, leader_member_id, members!teams_leader_member_id_fkey(id, display_name, instance_id, status)')
      .eq('project_id', projectId)
      .neq('status', 'archived')
      .order('name', { ascending: true }),
    db
      .from('channels')
      .select('id, name, description, team_id')
      .eq('project_id', projectId)
      .eq('kind', 'team')
      .eq('archived', false)
      .order('name', { ascending: true }),
  ])

  if (!teams?.length) return []

  // Resolve leader instance statuses for provisioning indicator
  const leaderInstanceIds = teams
    .map(t => (t.members as any)?.instance_id)
    .filter(Boolean) as string[]

  let instanceStatusMap: Record<string, string> = {}
  if (leaderInstanceIds.length > 0) {
    const { data: instances } = await db
      .from('agent_instances')
      .select('id, status')
      .in('id', leaderInstanceIds)

    if (instances) {
      for (const inst of instances) {
        instanceStatusMap[inst.id] = inst.status
      }
    }
  }

  // Group channels by team
  const channelsByTeam = new Map<string, typeof teamChannels>()
  for (const ch of teamChannels ?? []) {
    if (!ch.team_id) continue
    const list = channelsByTeam.get(ch.team_id) ?? []
    list.push(ch)
    channelsByTeam.set(ch.team_id, list)
  }

  return teams.map(t => {
    const leader = t.members as { id: string; display_name: string; instance_id: string | null; status: string } | null
    const leaderInstanceId = leader?.instance_id ?? null
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      leader: leader ? {
        memberId: leader.id,
        displayName: leader.display_name,
        instanceId: leaderInstanceId,
        status: leaderInstanceId ? (instanceStatusMap[leaderInstanceId] ?? 'unknown') : 'unknown',
      } : null,
      channels: (channelsByTeam.get(t.id) ?? []).map(ch => ({
        id: ch.id,
        name: ch.name,
        description: ch.description,
      })),
    }
  })
}
