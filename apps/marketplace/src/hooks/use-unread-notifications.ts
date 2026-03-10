'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient as createBrowserClient } from '@agentbay/db/client'
import { toast } from 'sonner'

interface Channel {
  id: string
  name: string
}

/**
 * Subscribe to Realtime INSERTs on broadcast channels.
 * Tracks unread counts per channel and shows toast notifications.
 * Clears unread when the user navigates to the channel.
 */
export function useUnreadNotifications(
  channels: Channel[],
  userMemberId: string | null,
) {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const pathname = usePathname()
  const supabaseRef = useRef(createBrowserClient())

  // Stabilize channel list — only recreate subscriptions when IDs actually change
  const channelKey = channels.map(c => c.id).sort().join(',')
  const stableChannels = useMemo(() => channels, [channelKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track active channel from pathname
  const activeChannelId = stableChannels.find(
    ch => pathname.startsWith(`/workspace/c/${ch.id}`),
  )?.id ?? null

  const activeChannelIdRef = useRef(activeChannelId)
  activeChannelIdRef.current = activeChannelId

  // Keep refs for values used inside Realtime callbacks (avoids stale closures)
  const userMemberIdRef = useRef(userMemberId)
  userMemberIdRef.current = userMemberId

  const channelMapRef = useRef<Record<string, string>>({})
  useEffect(() => {
    const map: Record<string, string> = {}
    for (const ch of stableChannels) map[ch.id] = ch.name
    channelMapRef.current = map
  }, [stableChannels])

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

  // Subscribe to each broadcast channel — deps are stable (channelKey + userMemberId)
  useEffect(() => {
    if (!stableChannels.length || !userMemberId) return

    const supabase = supabaseRef.current
    const subs: ReturnType<typeof supabase.channel>[] = []

    for (const channel of stableChannels) {
      const sub = supabase
        .channel(`unread:${channel.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'channel_messages',
            filter: `channel_id=eq.${channel.id}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>
            const senderId = row.sender_id as string
            const channelId = row.channel_id as string

            // Skip own messages
            if (senderId === userMemberIdRef.current) return

            // Skip if user is currently viewing this channel
            if (channelId === activeChannelIdRef.current) return

            // Skip thread replies (only count top-level messages)
            if (row.parent_id) return

            // Increment unread count
            setUnreadCounts(prev => ({
              ...prev,
              [channelId]: (prev[channelId] ?? 0) + 1,
            }))

            // Show toast notification
            const name = channelMapRef.current[channelId] ?? 'channel'
            const content = (row.content as string) ?? ''
            const preview = content.length > 80 ? content.slice(0, 80) + '…' : content

            toast(`#${name}`, {
              description: preview || 'New message',
              duration: 4000,
              action: {
                label: 'View',
                onClick: () => {
                  window.location.href = `/workspace/c/${channelId}`
                },
              },
            })
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[unread] subscribed to #${channel.name}`)
          } else if (status === 'CHANNEL_ERROR') {
            console.warn(`[unread] subscription error for #${channel.name}`)
          }
        })

      subs.push(sub)
    }

    return () => {
      subs.forEach(sub => supabase.removeChannel(sub))
    }
  }, [stableChannels, userMemberId]) // eslint-disable-line react-hooks/exhaustive-deps

  return { unreadCounts }
}
