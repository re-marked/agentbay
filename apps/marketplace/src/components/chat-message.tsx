import * as React from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const MENTION_RE = /@"([^"]+)"|@(\S+)/g

function renderMentions(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  MENTION_RE.lastIndex = 0
  while ((m = MENTION_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const name = m[1] ?? m[2]
    parts.push(
      <span key={m.index} className="inline rounded bg-primary/15 px-1 py-0.5 text-primary font-medium">
        @{name}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last === 0) return text
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export interface ChatMessageData {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  isStreaming?: boolean
}

export function ChatMessage({ message }: { message: ChatMessageData }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <Avatar size="sm" className="mt-0.5 shrink-0">
        <AvatarFallback>{isUser ? 'U' : 'A'}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        <p className="whitespace-pre-wrap break-words">
          {renderMentions(message.content)}
          {message.isStreaming && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />
          )}
        </p>
      </div>
    </div>
  )
}
