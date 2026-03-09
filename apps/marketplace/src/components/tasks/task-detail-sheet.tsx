'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { updateTask, deleteTask } from '@/lib/workspace/task-actions'
import type { TaskWithAssignee } from '@/lib/workspace/task-queries'
import type { ProjectMemberOption } from '@/lib/workspace/task-queries'

const STATUSES = [
  'pending', 'assigned', 'in_progress', 'blocked',
  'completed', 'failed', 'cancelled',
] as const

const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'text-red-500',
  high: 'text-orange-400',
  normal: 'text-blue-400',
  low: 'text-muted-foreground',
}

interface TaskDetailSheetProps {
  task: TaskWithAssignee
  members: ProjectMemberOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TaskDetailSheet({ task, members, open, onOpenChange }: TaskDetailSheetProps) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [isPending, startTransition] = useTransition()

  function save(updates: Parameters<typeof updateTask>[1]) {
    startTransition(async () => {
      await updateTask(task.id, updates)
    })
  }

  function handleDelete() {
    if (!confirm('Delete this task?')) return
    startTransition(async () => {
      await deleteTask(task.id)
      onOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[460px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="sr-only">Task Detail</SheetTitle>
          {/* Editable title */}
          <input
            className="text-lg font-semibold bg-transparent border-none outline-none w-full placeholder:text-muted-foreground focus:ring-0"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={() => {
              if (title !== task.title && title.trim()) {
                save({ title: title.trim() })
              }
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
              }
            }}
          />
        </SheetHeader>

        <div className="space-y-5 px-1">
          {/* Status */}
          <Field label="Status">
            <Select
              value={task.status}
              onValueChange={status => save({ status })}
            >
              <SelectTrigger size="sm" className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => (
                  <SelectItem key={s} value={s}>
                    {s.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Priority */}
          <Field label="Priority">
            <Select
              value={task.priority}
              onValueChange={priority => save({ priority })}
            >
              <SelectTrigger size="sm" className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map(p => (
                  <SelectItem key={p} value={p}>
                    <span className={PRIORITY_COLOR[p]}>{p}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Assignee */}
          <Field label="Assigned to">
            <Select
              value={task.assigned_to ?? 'unassigned'}
              onValueChange={v => save({ assignedTo: v === 'unassigned' ? null : v })}
            >
              <SelectTrigger size="sm" className="w-[200px]">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      <span className={`size-1.5 rounded-full shrink-0 ${m.type === 'agent' ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                      {m.displayName}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Description */}
          <Field label="Description">
            <textarea
              className="w-full min-h-[100px] rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
              value={description}
              onChange={e => setDescription(e.target.value)}
              onBlur={() => {
                if (description !== (task.description ?? '')) {
                  save({ description: description || null })
                }
              }}
              placeholder="Add a description..."
            />
          </Field>

          {/* Metadata */}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Created by</span>
              <span>{task.creator?.display_name ?? 'Unknown'}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Created</span>
              <span>{new Date(task.created_at).toLocaleString()}</span>
            </div>
            {task.started_at && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Started</span>
                <span>{new Date(task.started_at).toLocaleString()}</span>
              </div>
            )}
            {task.completed_at && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Completed</span>
                <span>{new Date(task.completed_at).toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>ID</span>
              <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{task.id.slice(0, 8)}</code>
            </div>
          </div>

          {/* Delete */}
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash2 className="size-3.5 mr-2" />
              Delete task
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      {children}
    </div>
  )
}
