import { getUser } from '@/lib/auth/get-user'
import { createServiceClient } from '@agentbay/db/server'
import { redirect } from 'next/navigation'
import { ProvisioningWaitScreen } from '@/components/provisioning-wait-screen'
import { ChannelChat } from '@/components/channel-chat'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { AgentAvatar } from '@/lib/agents'
import { AgentProfileCard } from '@/components/agent-profile-card'
import { getActiveProjectId } from '@/lib/projects/queries'
import { ChannelMemberList } from '@/components/channel-member-list'
import { DebugPageContext } from '@/components/debug/debug-page-context'

export default async function DirectMessagePage({
  params,
}: {
  params: Promise<{ instanceId: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { instanceId } = await params
  const service = createServiceClient()

  // Load agent instance + project membership in parallel
  const [{ data: instance }, projectInfo] = await Promise.all([
    service
      .from('agent_instances')
      .select('id, status, display_name, agents!inner(name, category, icon_url)')
      .eq('id', instanceId)
      .eq('user_id', user.id)
      .in('status', ['running', 'suspended', 'stopped', 'provisioning', 'error'])
      .limit(1)
      .single(),
    getActiveProjectId(user.id),
  ])

  if (!instance) redirect('/workspace/home')

  const agent = (instance as Record<string, unknown>).agents as {
    name: string; category: string; icon_url: string | null
  }
  const agentName = instance.display_name ?? agent.name
  const isNotReady = instance.status === 'provisioning' || instance.status === 'error'

  // For running agents, look up the DM channel and member info
  let channelId: string | null = null
  let userMemberId: string | null = null
  let agentMemberId: string | null = null
  let membersMap: Record<string, { displayName: string; type: string; iconUrl?: string | null; category?: string; instanceId?: string | null }> = {}

  if (!isNotReady) {
    const { activeProjectId, userMemberId: uid } = projectInfo
    userMemberId = uid

    if (activeProjectId && userMemberId) {
      // Find agent member (required before channel lookup)
      const { data: agentMember } = await service
        .from('members')
        .select('id, display_name')
        .eq('project_id', activeProjectId)
        .eq('instance_id', instanceId)
        .neq('status', 'archived')
        .limit(1)
        .maybeSingle()

      if (agentMember) {
        agentMemberId = agentMember.id

        // Find DM channel + user display name in parallel
        // For the DM channel: get channel memberships for both users at once
        const [{ data: userChannels }, { data: agentChannels }, { data: userMemberRow }] = await Promise.all([
          service.from('channel_members').select('channel_id').eq('member_id', userMemberId),
          service.from('channel_members').select('channel_id').eq('member_id', agentMember.id),
          service.from('members').select('id, display_name').eq('id', userMemberId).single(),
        ])

        if (userChannels && agentChannels) {
          const agentChannelIds = new Set(agentChannels.map(c => c.channel_id))
          const sharedChannelIds = userChannels
            .map(c => c.channel_id)
            .filter(id => agentChannelIds.has(id))

          if (sharedChannelIds.length > 0) {
            const { data: dmChannel } = await service
              .from('channels')
              .select('id')
              .eq('project_id', activeProjectId)
              .eq('kind', 'direct')
              .eq('archived', false)
              .in('id', sharedChannelIds)
              .limit(1)
              .maybeSingle()

            if (dmChannel) {
              channelId = dmChannel.id
              membersMap = {
                [userMemberId]: {
                  displayName: userMemberRow?.display_name ?? 'You',
                  type: 'user',
                },
                [agentMember.id]: {
                  displayName: agentMember.display_name ?? agentName,
                  type: 'agent',
                  iconUrl: agent.icon_url,
                  category: agent.category,
                  instanceId,
                },
              }
            }
          }
        }
      }
    }
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <DebugPageContext data={{
        page: 'dm',
        instanceId,
        channelId,
        userMemberId,
        agentMemberId,
        flyApp: instance.id,
        status: instance.status,
      }} />
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border/40 bg-background px-4 rounded-t-xl">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-1 data-[orientation=vertical]:h-4"
        />
        <AgentProfileCard
          instanceId={instance.id}
          name={agentName}
          category={agent.category}
          status={instance.status}
          iconUrl={agent.icon_url}
          side="bottom"
        >
          <span className="cursor-pointer">
            <AgentAvatar
              name={agentName}
              category={agent.category}
              iconUrl={agent.icon_url}
              size="xs"
            />
          </span>
        </AgentProfileCard>
        <span className="text-sm font-medium truncate">{agentName}</span>
      </header>

      {isNotReady ? (
        <ProvisioningWaitScreen instanceId={instance.id} agentName={agentName} initialStatus={instance.status} />
      ) : channelId && userMemberId ? (
        <div className="flex flex-1 min-h-0">
          <ChannelChat
            channelId={channelId}
            userMemberId={userMemberId}
            agentMemberId={agentMemberId ?? undefined}
            instanceId={instanceId}
            members={membersMap}
            agentName={agentName}
            agentCategory={agent.category}
            agentIconUrl={agent.icon_url}
            placeholder={`Message ${agentName}`}
            streaming
          />
          <ChannelMemberList
            members={Object.entries(membersMap).map(([id, m]) => ({
              id,
              displayName: m.displayName,
              type: m.type as 'user' | 'agent',
              iconUrl: m.iconUrl,
              category: m.category,
            }))}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Setting up your conversation channel...
          </p>
        </div>
      )}
    </div>
  )
}
