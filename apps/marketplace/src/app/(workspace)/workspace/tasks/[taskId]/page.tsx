import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@agentbay/db/server'
import { getActiveProjectId } from '@/lib/projects/queries'
import { ChannelChat } from '@/components/channel-chat'
import { TaskDetailHeader } from '@/components/tasks/task-detail-header'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { ChannelMemberList } from '@/components/channel-member-list'

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { taskId } = await params
  const service = createServiceClient()

  const { activeProjectId, userMemberId } = await getActiveProjectId(user.id)
  if (!activeProjectId || !userMemberId) redirect('/workspace/home')

  // Load task with assignee info
  const { data: task } = await service
    .from('tasks')
    .select(`
      id, title, description, status, priority,
      assigned_to, channel_id, metadata,
      created_at, started_at, completed_at,
      assignee:members!tasks_assigned_to_fkey(id, display_name, instance_id)
    `)
    .eq('id', taskId)
    .eq('project_id', activeProjectId)
    .single()

  if (!task) redirect('/workspace/tasks')

  const metadata = (task.metadata ?? {}) as Record<string, unknown>
  const threadRootId = metadata.thread_root_id as string | undefined
  const channelId = task.channel_id as string | undefined
  const assignee = task.assignee as { id: string; display_name: string; instance_id: string | null } | null

  // Resolve agent info if assigned to an agent
  let agentName: string | undefined
  let agentCategory: string | undefined
  let agentIconUrl: string | null | undefined
  let instanceId: string | undefined

  if (assignee?.instance_id) {
    instanceId = assignee.instance_id
    const { data: inst } = await service
      .from('agent_instances')
      .select('id, display_name, status, agents!inner(name, category, icon_url)')
      .eq('id', assignee.instance_id)
      .single()

    if (inst) {
      const agent = (inst as any).agents as { name: string; category: string; icon_url: string | null }
      agentName = inst.display_name ?? agent.name
      agentCategory = agent.category
      agentIconUrl = agent.icon_url
    }
  }

  // Build members map for the channel chat
  const membersMap: Record<string, { displayName: string; type: string; iconUrl?: string | null; category?: string }> = {}

  // Add user
  const { data: userMemberRow } = await service
    .from('members')
    .select('id, display_name')
    .eq('id', userMemberId)
    .single()

  membersMap[userMemberId] = {
    displayName: userMemberRow?.display_name ?? 'You',
    type: 'user',
  }

  // Add assignee if exists
  if (assignee) {
    membersMap[assignee.id] = {
      displayName: assignee.display_name ?? agentName ?? 'Agent',
      type: assignee.instance_id ? 'agent' : 'user',
      iconUrl: agentIconUrl,
      category: agentCategory,
    }
  }

  // Also load any other members who posted in the thread
  if (channelId) {
    const { data: channelMemberRows } = await service
      .from('channel_members')
      .select('member_id, members!inner(id, display_name, instance_id)')
      .eq('channel_id', channelId)

    for (const cm of channelMemberRows ?? []) {
      const m = (cm as any).members as { id: string; display_name: string; instance_id: string | null }
      if (!membersMap[m.id]) {
        membersMap[m.id] = {
          displayName: m.display_name ?? 'Unknown',
          type: m.instance_id ? 'agent' : 'user',
        }
      }
    }
  }

  const hasThread = threadRootId && channelId

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-background px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <span className="text-sm font-semibold truncate flex-1">{task.title}</span>
      </header>

      <TaskDetailHeader
        task={{
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assigneeName: assignee?.display_name ?? null,
          createdAt: task.created_at,
          startedAt: task.started_at,
          completedAt: task.completed_at,
        }}
      />

      {hasThread ? (
        <div className="flex flex-1 min-h-0">
          <ChannelChat
            channelId={channelId}
            userMemberId={userMemberId}
            instanceId={instanceId}
            members={membersMap}
            agentName={agentName}
            agentCategory={agentCategory}
            agentIconUrl={agentIconUrl}
            placeholder={`Message about this task...`}
            streaming={!!instanceId}
            threadId={threadRootId}
            taskId={taskId}
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
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              No activity yet on this task.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Assign this task to an agent to get started.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
