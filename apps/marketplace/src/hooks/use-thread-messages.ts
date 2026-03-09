'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient as createBrowserClient } from '@agentbay/db/client'
import type { ChannelMessage } from './use-channel-messages'

interface UseThreadMessagesOptions {
  channelId: string
  threadRootId: string
  userMemberId?: string
  members: Record<string, { displayName: string; type: string }>
}

export function useThreadMessages({
  channelId,
  threadRootId,
  members,
}: UseThreadMessagesOptions) {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef(createBrowserClient())
  const loadRef = useRef<(() => void) | undefined>(undefined)

  // Load thread root + all replies
  useEffect(() => {
    const load = async () => {
      const supabase = supabaseRef.current

      // Fetch: root message + all replies in this thread
      const { data, error: fetchErr } = await supabase
        .from('channel_messages')
        .select('id, channel_id, sender_id, content, message_kind, metadata, created_at, thread_id')
        .or(`id.eq.${threadRootId},thread_id.eq.${threadRootId}`)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(200)

      if (fetchErr) {
        setError(fetchErr.message)
        setIsLoading(false)
        return
      }

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
  }, [channelId, threadRootId, members])

  // Refetch when tab becomes visible (catches missed Realtime events during sleep/backgrounding)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') loadRef.current?.()
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  // Subscribe to Realtime INSERTs on the channel, filter client-side for this thread
  useEffect(() => {
    const supabase = supabaseRef.current

    const subscription = supabase
      .channel(`thread-messages:${threadRootId}`)
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
          // Only include messages that belong to this thread
          if (row.thread_id !== threadRootId && row.id !== threadRootId) return

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
  }, [channelId, threadRootId, members])

  const addOptimisticMessage = useCallback(
    (msg: ChannelMessage) => {
      setMessages(prev => {
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

  return { messages, isLoading, error, addOptimisticMessage }
}
