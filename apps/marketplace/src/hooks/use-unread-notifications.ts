'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient as createBrowserClient } from '@agentbay/db/client'
import { toast } from 'sonner'

interface Channel {
  id: string
  name: string
}

const FALLBACK_POLL_INTERVAL = 30_000 // 30 seconds — fallback for autonomous agent messages

/**
 * Subscribe to Realtime Broadcast for instant notifications,
 * with a slow poll fallback for messages from autonomous agents
 * (which don't go through the stream route).
 */
export function useUnreadNotifications(
  channels: Channel[],
  userMemberId: string | null,
  projectId?: string | null,
) {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const pathname = usePathname()
  const supabaseRef = useRef(createBrowserClient())

  // Stabilize channel list
  const channelKey = channels.map(c => c.id).sort().join(',')
  const stableChannels = useMemo(() => channels, [channelKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track the latest seen message per channel
  const lastSeenRef = useRef<Record<string, string>>({})
  const initializedRef = useRef(false)

  // Channel name map
  const channelMapRef = useRef<Record<string, string>>({})
  useEffect(() => {
    const map: Record<string, string> = {}
    for (const ch of stableChannels) map[ch.id] = ch.name
    channelMapRef.current = map
  }, [stableChannels])

  // Active channel from pathname
  const activeChannelId = stableChannels.find(
    ch => pathname.startsWith(`/workspace/c/${ch.id}`),
  )?.id ?? null

  const activeChannelIdRef = useRef(activeChannelId)
  activeChannelIdRef.current = activeChannelId

  // Clear unread when navigating to a channel
  useEffect(() => {
    if (activeChannelId) {
      setUnreadCounts(prev => {
        if (!prev[activeChannelId]) return prev
        const next = { ...prev }
        delete next[activeChannelId]
        return next
      })
    }
  }, [activeChannelId])

  // Handle a new message notification (shared by Realtime + poll)
  const handleNewMessage = useCallback((channelId: string, preview: string) => {
    const channelName = channelMapRef.current[channelId]
    if (!channelName) return // Not a tracked channel

    // Skip if user is viewing this channel
    if (channelId === activeChannelIdRef.current) return

    // Increment unread
    setUnreadCounts(prev => ({
      ...prev,
      [channelId]: (prev[channelId] ?? 0) + 1,
    }))

    // Show toast
    const truncated = preview.length > 80 ? preview.slice(0, 80) + '\u2026' : preview
    toast(`#${channelName}`, {
      description: truncated,
      duration: 4000,
      action: {
        label: 'View',
        onClick: () => {
          window.location.href = `/workspace/c/${channelId}`
        },
      },
    })
  }, [])

  // ── Realtime Broadcast subscription ──
  useEffect(() => {
    if (!projectId) return

    const supabase = supabaseRef.current
    const channel = supabase.channel(`project:${projectId}:messages`)
      .on('broadcast', { event: 'new_message' }, (msg) => {
        const { channelId, senderId, preview } = msg.payload as {
          channelId: string
          senderId: string
          preview: string
        }
        // Skip own messages
        if (senderId === userMemberId) return
        handleNewMessage(channelId, preview ?? 'New message')
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, userMemberId, handleNewMessage])

  // ── Fallback poll (slow) for autonomous agent messages ──
  const poll = useCallback(async () => {
    if (!stableChannels.length || !userMemberId) return

    const supabase = supabaseRef.current

    for (const channel of stableChannels) {
      const lastSeen = lastSeenRef.current[channel.id]

      let query = supabase
        .from('channel_messages')
        .select('id, channel_id, sender_id, content, created_at')
        .eq('channel_id', channel.id)
        .neq('sender_id', userMemberId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)

      if (lastSeen) {
        query = query.gt('created_at', lastSeen)
      }

      const { data } = await query

      if (!data?.length) continue

      const msg = data[0]

      if (!initializedRef.current) {
        // First poll — just record timestamps, don't notify
        lastSeenRef.current[channel.id] = msg.created_at
        continue
      }

      // New message found — update timestamp
      lastSeenRef.current[channel.id] = msg.created_at

      // Notify (handleNewMessage deduplicates via active channel check)
      handleNewMessage(channel.id, msg.content ?? 'New message')
    }

    initializedRef.current = true
  }, [stableChannels, userMemberId, handleNewMessage])

  useEffect(() => {
    if (!stableChannels.length || !userMemberId) return

    // Initial poll to seed timestamps
    poll()

    const interval = setInterval(poll, FALLBACK_POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [poll, stableChannels, userMemberId])

  return { unreadCounts }
}
