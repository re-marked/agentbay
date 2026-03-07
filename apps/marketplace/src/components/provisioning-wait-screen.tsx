'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkInstanceStatus } from '@/lib/hire/actions'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

const MESSAGES = [
  'Personal AI is getting ready...',
  'Almost there...',
  'Just a moment longer...',
]

const MAX_POLL_MS = 300_000 // 5 minutes

export function ProvisioningWaitScreen({
  instanceId,
  agentName,
}: {
  instanceId: string
  agentName: string
}) {
  const router = useRouter()
  const [messageIndex, setMessageIndex] = useState(0)
  const [status, setStatus] = useState<'polling' | 'error' | 'timeout'>('polling')

  useEffect(() => {
    // Cycle through messages every 8 seconds
    const msgInterval = setInterval(() => {
      setMessageIndex((prev) => Math.min(prev + 1, MESSAGES.length - 1))
    }, 8_000)

    return () => clearInterval(msgInterval)
  }, [])

  useEffect(() => {
    const startedAt = Date.now()

    const interval = setInterval(async () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        setStatus('timeout')
        clearInterval(interval)
        return
      }

      try {
        const result = await checkInstanceStatus(instanceId)
        if (result?.status === 'running') {
          clearInterval(interval)
          router.refresh()
          return
        }
        if (result?.status === 'error') {
          clearInterval(interval)
          setStatus('error')
          return
        }
      } catch {
        // ignore polling errors — will retry
      }
    }, 5_000)

    return () => clearInterval(interval)
  }, [instanceId, router])

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center max-w-sm">
        {/* Animated avatar pulse */}
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/15">
            <span className="text-3xl">🤖</span>
          </div>
          {status === 'polling' && (
            <div className="absolute inset-0 rounded-2xl bg-primary/10 animate-ping" />
          )}
        </div>

        {status === 'polling' && (
          <>
            <div>
              <h3 className="text-lg font-semibold mb-1">{agentName}</h3>
              <p className="text-sm text-muted-foreground animate-pulse">
                {MESSAGES[messageIndex]}
              </p>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div>
              <h3 className="text-lg font-semibold mb-1">Something went wrong</h3>
              <p className="text-sm text-muted-foreground">
                {agentName} couldn&apos;t start up. This is usually temporary.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setStatus('polling')
                router.refresh()
              }}
            >
              <RefreshCw className="size-4 mr-2" />
              Try Again
            </Button>
          </>
        )}

        {status === 'timeout' && (
          <>
            <div>
              <h3 className="text-lg font-semibold mb-1">Taking longer than expected</h3>
              <p className="text-sm text-muted-foreground">
                {agentName} is still being set up. Try refreshing in a moment.
              </p>
            </div>
            <Button variant="outline" onClick={() => router.refresh()}>
              <RefreshCw className="size-4 mr-2" />
              Refresh
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
