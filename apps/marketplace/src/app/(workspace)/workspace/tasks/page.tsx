import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { getActiveProjectId } from '@/lib/projects/queries'
import { getProjectTasks, getProjectMembersForPicker } from '@/lib/workspace/task-queries'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { TaskBoard } from '@/components/tasks/task-board'

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
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-background px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-sm font-semibold">Tasks</h1>
      </header>

      <TaskBoard tasks={tasks} members={members} />
    </div>
  )
}
