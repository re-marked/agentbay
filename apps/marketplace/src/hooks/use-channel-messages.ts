'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient as createBrowserClient } from '@agentbay/db/client'

export interface ChannelMessage {
  id: string
  channelId: string
  senderId: string
  content: string
  messageKind: string
  createdAt: string
  senderName?: string
  senderType?: 'user' | 'agent'
  metadata?: Record<string, unknown> | null
}

interface UseChannelMessagesOptions {
  channelId: string
  userMemberId: string
  /** Pre-loaded member info: id → { displayName, type } */
  members: Record<string, { displayName: string; type: string }>
}

export function useChannelMessages({
  channelId,
  userMemberId,
  members,
}: UseChannelMessagesOptions) {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef(createBrowserClient())
  const loadRef = useRef<(() => void) | undefined>(undefined)

  // Load history on mount
  useEffect(() => {
    const load = async () => {
      const supabase = supabaseRef.current
      const { data, error: fetchErr } = await supabase
        .from('channel_messages')
        .select('id, channel_id, sender_id, content, message_kind, metadata, created_at')
        .eq('channel_id', channelId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(100)

      if (fetchErr) {
        setError(fetchErr.message)
        setIsLoading(false)
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMessages(
        (data ?? []).map((row: any) => ({
          id: row.id,
          channelId: row.channel_id,
          senderId: row.sender_id,
          content: row.content,
          messageKind: row.message_kind,
          createdAt: row.created_at,
          senderName: members[row.sender_id]?.displayName ?? 'Unknown',
          senderType: (members[row.sender_id]?.type ?? 'user') as 'user' | 'agent',
          metadata: row.metadata,
        }))
      )
      setIsLoading(false)
    }

    loadRef.current = load
    load()
  }, [channelId, members])

  // Refetch when tab becomes visible (catches missed Realtime events during sleep/backgrounding)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') loadRef.current?.()
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  // Subscribe to Realtime INSERTs
  useEffect(() => {
    const supabase = supabaseRef.current

    const subscription = supabase
      .channel(`channel-messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channel_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new
          const senderId = row.sender_id as string
          const newMsg: ChannelMessage = {
            id: row.id as string,
            channelId: row.channel_id as string,
            senderId,
            content: row.content as string,
            messageKind: row.message_kind as string,
            createdAt: row.created_at as string,
            senderName: members[senderId]?.displayName ?? 'Unknown',
            senderType: (members[senderId]?.type ?? 'user') as 'user' | 'agent',
            metadata: (row.metadata as Record<string, unknown>) ?? null,
          }

          // Add message if not already present (dedup with optimistic updates)
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            // Remove optimistic message if real one arrived
            const filtered = prev.filter(
              m => !(m.id.startsWith('optimistic-') && m.content === newMsg.content && m.senderId === newMsg.senderId)
            )
            return [...filtered, newMsg]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [channelId, members])

  // Send message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return
      setIsSending(true)
      setError(null)

      // Optimistic update — add user message immediately
      const optimisticId = `optimistic-${Date.now()}`
      const optimisticMsg: ChannelMessage = {
        id: optimisticId,
        channelId,
        senderId: userMemberId,
        content: content.trim(),
        messageKind: 'text',
        createdAt: new Date().toISOString(),
        senderName: members[userMemberId]?.displayName ?? 'You',
        senderType: 'user',
      }
      setMessages(prev => [...prev, optimisticMsg])

      try {
        const res = await fetch('/api/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, content: content.trim() }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== optimisticId))
      } finally {
        setIsSending(false)
      }
    },
    [channelId, userMemberId, members]
  )

  // Add a message optimistically (for streaming mode where the API route persists it)
  // Skips if a real (non-optimistic) message with same content+sender already exists
  const addOptimisticMessage = useCallback(
    (msg: ChannelMessage) => {
      setMessages(prev => {
        // Don't add if a real message already covers this
        const isDuplicate = prev.some(
          m => !m.id.startsWith('optimistic-')
            && m.senderId === msg.senderId
            && m.content === msg.content
            && m.messageKind === msg.messageKind,
        )
        if (isDuplicate) return prev
        return [...prev, msg]
      })
    },
    [],
  )

  return { messages, isLoading, isSending, error, sendMessage, addOptimisticMessage }
}
