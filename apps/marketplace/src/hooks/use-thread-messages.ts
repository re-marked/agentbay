'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient as createBrowserClient } from '@agentbay/db/client'
import type { ChannelMessage } from './use-channel-messages'
import { useDebug } from '@/components/debug/debug-provider'

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
  const { log } = useDebug()

  // Load thread root + all replies
  useEffect(() => {
    const load = async () => {
      const supabase = supabaseRef.current

      // Fetch: root message + all replies in this thread (parent_id = root)
      const { data, error: fetchErr } = await supabase
        .from('channel_messages')
        .select('id, channel_id, sender_id, content, message_kind, metadata, created_at, parent_id')
        .or(`id.eq.${threadRootId},parent_id.eq.${threadRootId}`)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(200)

      if (fetchErr) {
        log('error', `Failed to load thread messages: ${fetchErr.message}`, { threadRootId })
        setError(fetchErr.message)
        setIsLoading(false)
        return
      }

      log('message', `Loaded ${(data ?? []).length} thread messages for root ${threadRootId.slice(0, 8)}`)

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
          if (row.parent_id !== threadRootId && row.id !== threadRootId) {
            log('realtime', `Filtered out non-thread message ${(row.id as string).slice(0, 8)} (parent_id=${row.parent_id})`)
            return
          }
          log('realtime', `INSERT thread message: ${(row.message_kind as string) ?? 'text'} from ${(row.sender_id as string).slice(0, 8)}`)

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
      .subscribe((status) => {
        log('realtime', `Subscription thread-messages:${threadRootId.slice(0, 8)} → ${status}`)
      })

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [channelId, threadRootId, members, log])

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
