import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { getActiveProjectId, getProjectAgents, toAgentInfoList } from '@/lib/projects/queries'
import { getProjectChats } from '@/lib/chats/queries'
import { createServiceClient } from '@agentbay/db/server'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { corporations, projects, activeProjectId, coFounderInstanceId } =
    await getActiveProjectId(user.id)

  // Run queries in parallel
  const [instances, chats, broadcastChannels] = await Promise.all([
    getProjectAgents(user.id, activeProjectId),
    getProjectChats(user.id, activeProjectId),
    activeProjectId ? loadBroadcastChannels(activeProjectId) : [],
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
    <SidebarProvider className="h-svh !min-h-0">
      <AppSidebar
        userEmail={user.email}
        corporationName={corporations[0]?.name}
        coFounder={coFounder}
        agents={agents}
        chats={chats}
        broadcastChannels={broadcastChannels}
        projects={projects}
        activeProjectId={activeProjectId}
      />
      <SidebarInset className="overflow-hidden">
        {children}
      </SidebarInset>
    </SidebarProvider>
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
