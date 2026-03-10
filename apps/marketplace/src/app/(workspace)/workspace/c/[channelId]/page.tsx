import { getUser } from '@/lib/auth/get-user'
import { createServiceClient } from '@agentbay/db/server'
import { redirect } from 'next/navigation'
import { ChannelChat } from '@/components/channel-chat'
import { Hash } from 'lucide-react'
import { getActiveProjectId } from '@/lib/projects/queries'
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
      .select('id, project_id, name, kind, description')
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

    let iconMap: Record<string, { icon_url: string | null; category: string; name: string }> = {}
    if (instanceIds.length > 0) {
      const { data: instances } = await service
        .from('agent_instances')
        .select('id, agents!inner(name, icon_url, category)')
        .in('id', instanceIds)

      if (instances) {
        for (const inst of instances) {
          const agent = (inst as any).agents as { name: string; icon_url: string | null; category: string }
          iconMap[inst.id] = { name: agent?.name ?? '', icon_url: agent?.icon_url ?? null, category: agent?.category ?? '' }
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

      // Capture agent info for streaming
      if (isAgent && member.instance_id) {
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
        <ChannelMemberList members={membersList} />
      </div>
    </div>
  )
}
