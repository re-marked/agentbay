'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Circle,
  CircleDot,
  CircleCheck,
  CircleX,
  CircleAlert,
  Clock,
  ChevronRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { updateTask } from '@/lib/workspace/task-actions'
import type { TaskWithAssignee } from '@/lib/workspace/task-queries'
import type { ProjectMemberOption } from '@/lib/workspace/task-queries'

const STATUS_CONFIG: Record<string, { icon: typeof Circle; color: string; label: string }> = {
  pending: { icon: Circle, color: 'text-muted-foreground', label: 'Pending' },
  assigned: { icon: CircleDot, color: 'text-blue-400', label: 'Assigned' },
  in_progress: { icon: Clock, color: 'text-amber-400', label: 'In Progress' },
  blocked: { icon: CircleAlert, color: 'text-orange-400', label: 'Blocked' },
  completed: { icon: CircleCheck, color: 'text-emerald-400', label: 'Done' },
  failed: { icon: CircleX, color: 'text-red-400', label: 'Failed' },
  cancelled: { icon: CircleX, color: 'text-muted-foreground', label: 'Cancelled' },
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  normal: 'bg-blue-400',
  low: 'bg-muted-foreground/50',
}

interface TaskRowProps {
  task: TaskWithAssignee
  members: ProjectMemberOption[]
}

export function TaskRow({ task }: TaskRowProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending
  const StatusIcon = statusCfg.icon
  const isDone = ['completed', 'failed', 'cancelled'].includes(task.status)

  function handleStatusChange(newStatus: string) {
    startTransition(async () => {
      await updateTask(task.id, { status: newStatus })
    })
  }

  return (
    <div
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors ${
        isDone ? 'opacity-60' : ''
      } ${isPending ? 'opacity-50' : ''}`}
      onClick={() => router.push(`/workspace/tasks/${task.id}`)}
    >
      {/* Status icon — clickable to cycle */}
      <button
        className={`shrink-0 ${statusCfg.color} hover:scale-110 transition-transform`}
        onClick={(e) => {
          e.stopPropagation()
          const next = task.status === 'pending' || task.status === 'assigned'
            ? 'in_progress'
            : task.status === 'in_progress'
              ? 'completed'
              : task.status === 'blocked'
                ? 'in_progress'
                : undefined
          if (next) handleStatusChange(next)
        }}
        title={`Status: ${statusCfg.label} (click to advance)`}
      >
        <StatusIcon className="size-4.5" />
      </button>

      {/* Priority dot */}
      <span
        className={`size-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.normal}`}
        title={`Priority: ${task.priority}`}
      />

      {/* Title */}
      <span className={`text-sm font-medium truncate flex-1 ${isDone ? 'line-through' : ''}`}>
        {task.title}
      </span>

      {/* Assignee badge */}
      {task.assignee && (
        <Badge variant="secondary" className="text-[11px] shrink-0 max-w-[140px] truncate">
          {task.assignee.display_name}
        </Badge>
      )}

      {/* Due date */}
      {task.due_at && (
        <span className="text-[11px] text-muted-foreground shrink-0">
          {new Date(task.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      )}

      {/* Age */}
      <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:block">
        {formatAge(task.created_at)}
      </span>

      <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
    </div>
  )
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}
