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

export default async function DirectMessagePage({
  params,
}: {
  params: Promise<{ instanceId: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { instanceId } = await params
  const service = createServiceClient()

  const { data: instance } = await service
    .from('agent_instances')
    .select('id, status, display_name, agents!inner(name, category, icon_url)')
    .eq('id', instanceId)
    .eq('user_id', user.id)
    .in('status', ['running', 'suspended', 'stopped', 'provisioning', 'error'])
    .limit(1)
    .single()

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
  let membersMap: Record<string, { displayName: string; type: string; iconUrl?: string | null; category?: string }> = {}

  if (!isNotReady) {
    const { activeProjectId, userMemberId: uid } = await getActiveProjectId(user.id)
    userMemberId = uid

    if (activeProjectId && userMemberId) {
      // Find agent's member in this project
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
        // Find DM channel between user and agent
        const { data: agentChannels } = await service
          .from('channel_members')
          .select('channel_id')
          .eq('member_id', agentMember.id)

        if (agentChannels && agentChannels.length > 0) {
          const { data: dmChannel } = await service
            .from('channels')
            .select('id')
            .eq('project_id', activeProjectId)
            .eq('kind', 'direct')
            .eq('archived', false)
            .in('id', agentChannels.map(c => c.channel_id))
            .limit(1)
            .maybeSingle()

          if (dmChannel) {
            channelId = dmChannel.id

            // Build members map for the hook
            const { data: userMemberRow } = await service
              .from('members')
              .select('id, display_name')
              .eq('id', userMemberId)
              .single()

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
              },
            }
          }
        }
      }
    }
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
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
        <ChannelChat
          channelId={channelId}
          userMemberId={userMemberId}
          agentMemberId={agentMemberId ?? undefined}
          members={membersMap}
          agentName={agentName}
          agentCategory={agent.category}
          agentIconUrl={agent.icon_url}
          placeholder={`Message ${agentName}`}
          streaming
        />
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
