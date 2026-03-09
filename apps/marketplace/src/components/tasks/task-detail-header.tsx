'use client'

import {
  Circle,
  CircleDot,
  CircleCheck,
  CircleX,
  CircleAlert,
  Clock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const STATUS_CONFIG: Record<string, { icon: typeof Circle; color: string; label: string }> = {
  pending: { icon: Circle, color: 'text-muted-foreground', label: 'Pending' },
  assigned: { icon: CircleDot, color: 'text-blue-400', label: 'Assigned' },
  in_progress: { icon: Clock, color: 'text-amber-400', label: 'In Progress' },
  blocked: { icon: CircleAlert, color: 'text-orange-400', label: 'Blocked' },
  completed: { icon: CircleCheck, color: 'text-emerald-400', label: 'Done' },
  failed: { icon: CircleX, color: 'text-red-400', label: 'Failed' },
  cancelled: { icon: CircleX, color: 'text-muted-foreground', label: 'Cancelled' },
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'bg-red-500/15 text-red-400 border-red-500/20',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  normal: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  low: 'bg-muted text-muted-foreground border-border/40',
}

interface TaskDetailHeaderProps {
  task: {
    id: string
    title: string
    description: string | null
    status: string
    priority: string
    assigneeName: string | null
    createdAt: string
    startedAt: string | null
    completedAt: string | null
  }
}

export function TaskDetailHeader({ task }: TaskDetailHeaderProps) {
  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending
  const StatusIcon = statusCfg.icon

  return (
    <div className="border-b border-border/40 px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`flex items-center gap-1.5 ${statusCfg.color}`}>
          <StatusIcon className="size-4" />
          <span className="text-xs font-medium">{statusCfg.label}</span>
        </div>

        <Badge variant="outline" className={`text-[11px] ${PRIORITY_COLOR[task.priority] ?? ''}`}>
          {task.priority}
        </Badge>

        {task.assigneeName && (
          <Badge variant="secondary" className="text-[11px]">
            {task.assigneeName}
          </Badge>
        )}
      </div>

      {task.description && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {task.description}
        </p>
      )}
    </div>
  )
}
