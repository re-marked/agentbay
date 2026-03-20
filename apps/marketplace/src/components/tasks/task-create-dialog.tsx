'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { createTask } from '@/lib/workspace/task-actions'
import type { ProjectMemberOption } from '@/lib/workspace/task-queries'

const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const

interface TaskCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: ProjectMemberOption[]
}

export function TaskCreateDialog({ open, onOpenChange, members }: TaskCreateDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [assignedTo, setAssignedTo] = useState<string>('unassigned')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    startTransition(async () => {
      await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assignedTo: assignedTo === 'unassigned' ? undefined : assignedTo,
      })
      setTitle('')
      setDescription('')
      setPriority('normal')
      setAssignedTo('unassigned')
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <input
              autoFocus
              className="w-full rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="What needs to be done?"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
              placeholder="Description (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Priority + Assignee row */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Assign to</label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger size="sm" className="w-full">
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
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || isPending}>
              {isPending ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
