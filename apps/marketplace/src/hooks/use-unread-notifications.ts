'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient as createBrowserClient } from '@agentbay/db/client'
import { toast } from 'sonner'

interface Channel {
  id: string
  name: string
}

const POLL_INTERVAL = 3_000 // 3 seconds

/**
 * Poll for new messages in broadcast channels.
 * Tracks unread counts and shows toast notifications.
 * Clears unread when the user navigates to the channel.
 */
export function useUnreadNotifications(
  channels: Channel[],
  userMemberId: string | null,
) {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const pathname = usePathname()
  const supabaseRef = useRef(createBrowserClient())

  // Stabilize channel list
  const channelKey = channels.map(c => c.id).sort().join(',')
  const stableChannels = useMemo(() => channels, [channelKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track the latest seen message per channel (to detect new ones)
  const lastSeenRef = useRef<Record<string, string>>({}) // channelId → latest message created_at
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

  // Poll for new messages
  const poll = useCallback(async () => {
    if (!stableChannels.length || !userMemberId) return

    const supabase = supabaseRef.current

    for (const channel of stableChannels) {
      const lastSeen = lastSeenRef.current[channel.id]

      // Build query: get the latest message in this channel
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
        // First poll — just record the latest timestamps, don't notify
        lastSeenRef.current[channel.id] = msg.created_at
        continue
      }

      // New message found
      lastSeenRef.current[channel.id] = msg.created_at

      // Skip if user is viewing this channel
      if (channel.id === activeChannelIdRef.current) continue

      // Increment unread
      setUnreadCounts(prev => ({
        ...prev,
        [channel.id]: (prev[channel.id] ?? 0) + 1,
      }))

      // Show toast
      const preview = msg.content?.length > 80
        ? msg.content.slice(0, 80) + '…'
        : msg.content ?? 'New message'

      toast(`#${channel.name}`, {
        description: preview,
        duration: 4000,
        action: {
          label: 'View',
          onClick: () => {
            window.location.href = `/workspace/c/${channel.id}`
          },
        },
      })
    }

    initializedRef.current = true
  }, [stableChannels, userMemberId])

  // Start polling
  useEffect(() => {
    if (!stableChannels.length || !userMemberId) return

    // Initial poll to seed timestamps
    poll()

    const interval = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [poll, stableChannels, userMemberId])

  return { unreadCounts }
}
