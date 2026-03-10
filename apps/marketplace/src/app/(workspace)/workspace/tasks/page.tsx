import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { getActiveProjectId } from '@/lib/projects/queries'
import { getProjectTasks, getProjectMembersForPicker } from '@/lib/workspace/task-queries'
import { TaskBoard } from '@/components/tasks/task-board'
import { SetPageSegment } from '@/components/workspace-header'
import { ListTodo } from 'lucide-react'

export default async function TasksPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const { activeProjectId } = await getActiveProjectId(user.id)
  if (!activeProjectId) redirect('/workspace/home')

  const [tasks, members] = await Promise.all([
    getProjectTasks(activeProjectId),
    getProjectMembersForPicker(activeProjectId),
  ])

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <SetPageSegment icon={<ListTodo className="size-3.5" />} label="Tasks" />
      <TaskBoard tasks={tasks} members={members} />
    </div>
  )
}
