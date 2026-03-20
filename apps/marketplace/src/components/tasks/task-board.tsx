'use client'

import { useState } from 'react'
import { Plus, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TaskRow } from './task-row'
import { TaskCreateDialog } from './task-create-dialog'
import type { TaskWithAssignee } from '@/lib/workspace/task-queries'
import type { ProjectMemberOption } from '@/lib/workspace/task-queries'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All Priorities' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]

interface TaskBoardProps {
  tasks: TaskWithAssignee[]
  members: ProjectMemberOption[]
}

export function TaskBoard({ tasks, members }: TaskBoardProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
    return true
  })

  // Group by status for visual separation
  const active = filtered.filter(t =>
    ['pending', 'assigned', 'in_progress', 'blocked'].includes(t.status)
  )
  const done = filtered.filter(t =>
    ['completed', 'failed', 'cancelled'].includes(t.status)
  )

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Toolbar */}
      <div className="sticky top-0 z-[5] flex items-center gap-3 border-b border-border/40 bg-background/95 backdrop-blur-sm px-4 py-2.5">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1.5" />
          New Task
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <Filter className="size-3.5 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger size="sm" className="w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger size="sm" className="w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Task list */}
      <div className="px-4 py-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card mb-4">
              <Plus className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-1">No tasks yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Create a task and assign it to an agent. They'll pick it up on their next heartbeat.
            </p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1.5" />
              Create First Task
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Active tasks header */}
            {active.length > 0 && (
              <>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-1">
                  Active — {active.length}
                </div>
                {active.map(task => (
                  <TaskRow key={task.id} task={task} members={members} />
                ))}
              </>
            )}

            {/* Done tasks */}
            {done.length > 0 && (
              <>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-2 pt-4 pb-1">
                  Done — {done.length}
                </div>
                {done.map(task => (
                  <TaskRow key={task.id} task={task} members={members} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <TaskCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        members={members}
      />
    </div>
  )
}
