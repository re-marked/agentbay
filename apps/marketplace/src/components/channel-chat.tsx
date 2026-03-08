'use client'

import React, { useEffect, useRef, useCallback } from 'react'
import { useChannelMessages, type ChannelMessage } from '@/hooks/use-channel-messages'
import { useStreamingChat } from '@/hooks/use-streaming-chat'
import { MarkdownContent } from '@/components/markdown-content'
import { ToolUseBlockList, type ToolUse } from '@/components/tool-use-block'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { AgentAvatar } from '@/lib/agents'
import type { KeyboardEvent } from 'react'

interface ChannelChatProps {
  channelId: string
  userMemberId: string
  agentMemberId?: string
  members: Record<string, { displayName: string; type: string; iconUrl?: string | null; category?: string }>
  agentName?: string
  agentCategory?: string
  agentIconUrl?: string | null
  placeholder?: string
  streaming?: boolean
}

function formatTime(date: Date): string {
  const now = new Date()
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today at ${time}`
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`
}

interface MessageGroup {
  senderId: string
  senderName: string
  senderType: 'user' | 'agent'
  messages: ChannelMessage[]
}

function groupMessages(messages: ChannelMessage[]): MessageGroup[] {
  return messages.reduce<MessageGroup[]>((groups, msg) => {
    const last = groups[groups.length - 1]
    if (last && last.senderId === msg.senderId) {
      last.messages.push(msg)
    } else {
      groups.push({
        senderId: msg.senderId,
        senderName: msg.senderName ?? 'Unknown',
        senderType: msg.senderType ?? 'user',
        messages: [msg],
      })
    }
    return groups
  }, [])
}

export function ChannelChat({
  channelId,
  userMemberId,
  members,
  agentName,
  agentCategory,
  agentIconUrl,
  placeholder,
  streaming = false,
}: ChannelChatProps) {
  const { messages, isLoading, isSending, error, sendMessage, addOptimisticMessage } = useChannelMessages({
    channelId,
    userMemberId,
    members,
  })

  const {
    sendStreamingMessage,
    streamingContent,
    streamingTools,
    isStreaming,
    streamError,
  } = useStreamingChat({
    channelId,
    onDone: useCallback((result: { content: string; tools: ToolUse[] }) => {
      // Bridge the gap: inject optimistic agent message so content doesn't
      // disappear between streaming-clear and Realtime delivery
      if (!result.content && result.tools.length === 0) return
      const agentId = Object.keys(members).find(id => members[id].type === 'agent')
      if (!agentId) return
      addOptimisticMessage({
        id: `optimistic-agent-${Date.now()}`,
        channelId,
        senderId: agentId,
        content: result.content,
        messageKind: 'text',
        createdAt: new Date().toISOString(),
        senderName: members[agentId]?.displayName ?? agentName ?? 'Agent',
        senderType: 'agent',
      })
    }, [channelId, members, agentName, addOptimisticMessage]),
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isBusy = streaming ? isStreaming : isSending
  const displayError = streaming ? (streamError ?? error) : error

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    }
  }, [messages, streamingContent, streamingTools])

  const handleSend = useCallback(
    (value: string) => {
      if (!value.trim() || isBusy) return

      if (streaming) {
        // In streaming mode: add optimistic user message, then stream
        addOptimisticMessage({
          id: `optimistic-${Date.now()}`,
          channelId,
          senderId: userMemberId,
          content: value.trim(),
          messageKind: 'text',
          createdAt: new Date().toISOString(),
          senderName: members[userMemberId]?.displayName ?? 'You',
          senderType: 'user',
        })
        sendStreamingMessage(value.trim())
      } else {
        sendMessage(value)
      }
    },
    [streaming, isBusy, channelId, userMemberId, members, sendMessage, sendStreamingMessage, addOptimisticMessage],
  )

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const value = textareaRef.current?.value.trim()
      if (!value) return
      handleSend(value)
      if (textareaRef.current) textareaRef.current.value = ''
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex flex-col gap-2 flex-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const groups = groupMessages(messages)

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Messages area */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="flex flex-col gap-4 px-4 py-4">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-1 items-center justify-center py-20">
              <p className="text-sm text-muted-foreground">
                Send a message to start the conversation
              </p>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.messages[0].id} className="flex gap-3 hover:bg-muted/30 -mx-2 px-2 py-1 rounded-md transition-colors">
              {/* Avatar */}
              <div className="shrink-0 pt-0.5">
                {group.senderType === 'agent' ? (
                  <AgentAvatar
                    name={group.senderName}
                    category={agentCategory ?? ''}
                    iconUrl={agentIconUrl}
                    size="sm"
                  />
                ) : (
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/20 text-primary text-sm font-medium">
                      {group.senderName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>

              {/* Messages */}
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-semibold ${group.senderType === 'agent' ? 'text-indigo-400' : 'text-foreground'}`}>
                    {group.senderType === 'user' ? 'You' : group.senderName}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatTime(new Date(group.messages[0].createdAt))}
                  </span>
                </div>
                {/* Collect consecutive tool_result messages into blocks */}
                {(() => {
                  const elements: React.ReactNode[] = []
                  let toolBatch: ToolUse[] = []

                  const flushTools = () => {
                    if (toolBatch.length > 0) {
                      elements.push(
                        <ToolUseBlockList key={`tools-${toolBatch[0].id}`} toolUses={[...toolBatch]} />
                      )
                      toolBatch = []
                    }
                  }

                  for (const msg of group.messages) {
                    if (msg.messageKind === 'tool_result' && msg.metadata) {
                      const meta = msg.metadata as Record<string, unknown>
                      toolBatch.push({
                        id: (meta.id as string) ?? msg.id,
                        tool: (meta.tool as string) ?? 'unknown',
                        args: meta.args as string | undefined,
                        output: meta.output as string | undefined,
                        status: (meta.status as 'done' | 'error') ?? 'done',
                      })
                    } else {
                      flushTools()
                      elements.push(
                        <div key={msg.id} className="text-sm text-foreground/90 leading-relaxed">
                          <MarkdownContent content={msg.content} />
                        </div>
                      )
                    }
                  }
                  flushTools()
                  return elements
                })()}
              </div>
            </div>
          ))}

          {/* Streaming agent response */}
          {isStreaming && (streamingContent || streamingTools.length > 0) && (
            <div className="flex gap-3 -mx-2 px-2 py-1 rounded-md">
              <div className="shrink-0 pt-0.5">
                <AgentAvatar
                  name={agentName ?? 'Agent'}
                  category={agentCategory ?? ''}
                  iconUrl={agentIconUrl}
                  size="sm"
                />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-indigo-400">
                    {agentName ?? 'Agent'}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Now
                  </span>
                </div>
                {streamingContent && (
                  <div className="text-sm text-foreground/90 leading-relaxed">
                    <MarkdownContent content={streamingContent} />
                  </div>
                )}
                {streamingTools.length > 0 && (
                  <ToolUseBlockList toolUses={streamingTools} />
                )}
              </div>
            </div>
          )}

          {/* Typing indicator — only show when streaming mode is active but no content yet */}
          {isStreaming && !streamingContent && streamingTools.length === 0 && (
            <div className="flex gap-3 -mx-2 px-2 py-1">
              <div className="shrink-0 pt-0.5">
                <AgentAvatar
                  name={agentName ?? 'Agent'}
                  category={agentCategory ?? ''}
                  iconUrl={agentIconUrl}
                  size="sm"
                />
              </div>
              <div className="flex items-center gap-1.5 pt-2">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Non-streaming typing indicator (legacy) */}
          {!streaming && isSending && (
            <div className="flex gap-3 -mx-2 px-2 py-1">
              <div className="shrink-0 pt-0.5">
                <AgentAvatar
                  name={agentName ?? 'Agent'}
                  category={agentCategory ?? ''}
                  iconUrl={agentIconUrl}
                  size="sm"
                />
              </div>
              <div className="flex items-center gap-1.5 pt-2">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Error banner */}
      {displayError && (
        <div className="px-4 py-2 text-sm text-destructive bg-destructive/10 border-t border-destructive/20">
          {displayError}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-6 pt-2">
        <Textarea
          ref={textareaRef}
          placeholder={placeholder ?? `Message ${agentName ?? '#channel'}`}
          onKeyDown={handleKeyDown}
          disabled={isBusy}
          className="bg-muted/50 border-muted-foreground/20 min-h-14 max-h-40 resize-none rounded-lg text-base disabled:opacity-50"
          rows={1}
        />
      </div>
    </div>
  )
}
