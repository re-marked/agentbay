'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Terminal, FileText, Pencil, Globe, FileCode, Loader2 } from 'lucide-react'
import { spring } from '@/lib/spring'

export interface ToolUse {
  id: string
  tool: string
  args?: string
  output?: string
  status: 'running' | 'done' | 'error'
}

const TOOL_CONFIG: Record<string, { label: string; icon: typeof Terminal }> = {
  exec: { label: 'Exec', icon: Terminal },
  read: { label: 'Read', icon: FileText },
  write: { label: 'Write', icon: FileCode },
  edit: { label: 'Edit', icon: Pencil },
  apply_patch: { label: 'Patch', icon: FileCode },
  web_search: { label: 'Web Search', icon: Globe },
}

function getToolConfig(tool: string) {
  return TOOL_CONFIG[tool] ?? { label: tool, icon: Terminal }
}

function ToolUseItem({ toolUse }: { toolUse: ToolUse }) {
  const [expanded, setExpanded] = useState(false)
  const config = getToolConfig(toolUse.tool)
  const Icon = config.icon
  const hasOutput = toolUse.output && toolUse.output.length > 0

  return (
    <div className="my-1 rounded-md border border-border/40 bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => hasOutput && setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/40 transition-colors"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium text-muted-foreground">{config.label}</span>
        {toolUse.args && (
          <span className="text-muted-foreground/70 truncate font-mono text-[11px]">
            {typeof toolUse.args === 'string' ? toolUse.args : JSON.stringify(toolUse.args)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {toolUse.status === 'running' && (
            <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
          )}
          {hasOutput && (
            <motion.span
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={spring}
              className="flex"
            >
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </motion.span>
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && hasOutput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: spring,
              opacity: { duration: 0.15, ease: 'easeOut' },
            }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/30 bg-muted/10 px-3 py-2">
              <pre className="text-[11px] text-muted-foreground/80 font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                {typeof toolUse.output === 'string' ? toolUse.output : JSON.stringify(toolUse.output, null, 2)}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function ToolUseBlockList({ toolUses }: { toolUses: ToolUse[] }) {
  if (toolUses.length === 0) return null
  return (
    <div className="my-1">
      {toolUses.map((tu) => (
        <ToolUseItem key={tu.id} toolUse={tu} />
      ))}
    </div>
  )
}
