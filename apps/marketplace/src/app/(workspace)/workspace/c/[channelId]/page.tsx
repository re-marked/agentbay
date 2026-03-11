import { getUser } from '@/lib/auth/get-user'
import { createServiceClient } from '@agentbay/db/server'
import { redirect } from 'next/navigation'
import { ChannelChat } from '@/components/channel-chat'
import { Hash } from 'lucide-react'
import { getActiveProjectId, getProjectAgents, toAgentInfoList } from '@/lib/projects/queries'
import { ChannelMemberList, type MemberInfo } from '@/components/channel-member-list'
import { DebugPageContext } from '@/components/debug/debug-page-context'
import { SetPageSegment } from '@/components/workspace-header'

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { channelId } = await params
  const service = createServiceClient()

  // Load channel + project membership in parallel
  const [{ data: channel }, projectInfo] = await Promise.all([
    service
      .from('channels')
      .select('id, project_id, name, kind, description, team_id, teams(id, name)')
      .eq('id', channelId)
      .single(),
    getActiveProjectId(user.id),
  ])

  if (!channel) redirect('/workspace/home')

  const { activeProjectId, userMemberId } = projectInfo
  if (!activeProjectId || channel.project_id !== activeProjectId || !userMemberId) {
    redirect('/workspace/home')
  }

  // Build members map for ChannelChat
  const { data: channelMembers } = await service
    .from('channel_members')
    .select('member_id, members!inner(id, display_name, instance_id)')
    .eq('channel_id', channelId)

  const membersMap: Record<string, { displayName: string; type: string; iconUrl?: string | null; category?: string; instanceId?: string | null }> = {}

  // Track agent info for streaming props
  let agentInstanceId: string | undefined
  let agentName: string | undefined
  let agentCategory: string | undefined
  let agentIconUrl: string | null | undefined

  if (channelMembers) {
    // Collect instance IDs for icon lookup
    const instanceIds = channelMembers
      .map((cm: any) => cm.members?.instance_id)
      .filter(Boolean) as string[]

    let iconMap: Record<string, { icon_url: string | null; category: string; name: string; status: string }> = {}
    if (instanceIds.length > 0) {
      const { data: instances } = await service
        .from('agent_instances')
        .select('id, status, agents!inner(name, icon_url, category)')
        .in('id', instanceIds)

      if (instances) {
        for (const inst of instances) {
          const agent = (inst as any).agents as { name: string; icon_url: string | null; category: string }
          iconMap[inst.id] = { name: agent?.name ?? '', icon_url: agent?.icon_url ?? null, category: agent?.category ?? '', status: inst.status }
        }
      }
    }

    for (const cm of channelMembers) {
      const member = (cm as any).members as { id: string; display_name: string; instance_id: string | null }
      if (!member) continue
      const isAgent = !!member.instance_id
      const agentInfo = member.instance_id ? iconMap[member.instance_id] : null
      membersMap[member.id] = {
        displayName: member.display_name ?? 'Unknown',
        type: isAgent ? 'agent' : 'user',
        iconUrl: agentInfo?.icon_url ?? null,
        category: agentInfo?.category ?? undefined,
        instanceId: member.instance_id,
      }

      // Capture agent info for streaming (only if agent is running)
      if (isAgent && member.instance_id && agentInfo?.status === 'running') {
        agentInstanceId = member.instance_id
        agentName = member.display_name ?? agentInfo?.name ?? 'Agent'
        agentCategory = agentInfo?.category
        agentIconUrl = agentInfo?.icon_url
      }
    }
  }

  // Enable streaming for DM channels that have an agent member
  const hasAgent = !!agentInstanceId

  // Build member list for the sidebar
  const membersList: MemberInfo[] = Object.entries(membersMap).map(([id, m]) => ({
    id,
    displayName: m.displayName,
    type: m.type as 'user' | 'agent',
    iconUrl: m.iconUrl,
    category: m.category,
  }))

  // For team channels, load available agents for the "Add Agent" button
  const teamInfo = (channel as any).teams as { id: string; name: string } | null
  let availableAgents: { instanceId: string; name: string; category: string; iconUrl: string | null }[] = []

  if (teamInfo && channel.kind === 'team') {
    const instances = await getProjectAgents(user.id, activeProjectId)
    const allAgents = toAgentInfoList(instances)
    // Filter out agents already in the channel
    const existingInstanceIds = new Set(
      Object.values(membersMap)
        .filter(m => m.type === 'agent' && m.instanceId)
        .map(m => m.instanceId!)
    )
    availableAgents = allAgents
      .filter(a => !existingInstanceIds.has(a.instanceId))
      .map(a => ({ instanceId: a.instanceId, name: a.name, category: a.category, iconUrl: a.iconUrl }))
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <SetPageSegment icon={<Hash className="size-3.5" />} label={channel.name} />
      <DebugPageContext data={{
        page: 'channel',
        channelId: channelId,
        channelName: channel.name,
        channelKind: channel.kind,
        userMemberId,
        agentInstanceId: agentInstanceId ?? null,
        hasAgent: hasAgent ? 'true' : 'false',
        memberCount: String(membersList.length),
      }} />

      <div className="flex flex-1 min-h-0">
        <ChannelChat
          channelId={channelId}
          userMemberId={userMemberId}
          members={membersMap}
          placeholder={`Message #${channel.name}`}
          streaming={hasAgent}
          instanceId={agentInstanceId}
          agentName={agentName}
          agentCategory={agentCategory}
          agentIconUrl={agentIconUrl}
        />
        <ChannelMemberList
          members={membersList}
          teamId={teamInfo?.id}
          teamName={teamInfo?.name}
          availableAgents={availableAgents}
        />
      </div>
    </div>
  )
}
