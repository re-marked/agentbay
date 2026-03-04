'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Rocket, CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { hireAgent } from '@/lib/hire/actions'

interface AgentHireButtonProps {
  agentSlug: string
  agentName: string
}

export function AgentHireButton({ agentSlug, agentName }: AgentHireButtonProps) {
  const router = useRouter()
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleHire() {
    setDeploying(true)
    setError(null)

    const result = await hireAgent({ agentSlug })

    if ('error' in result && result.error) {
      const msg = result.error as string
      if (msg.includes('Unauthorized') || msg.includes('unauthorized')) {
        router.push(`/login?next=/agents/${agentSlug}`)
        return
      }
      setError(msg)
      setDeploying(false)
      return
    }

    if (result.alreadyHired && result.status === 'running') {
      router.push('/workspace/home')
      return
    }

    router.push('/workspace/home')
  }

  return (
    <>
      <Button
        size="lg"
        disabled={deploying}
        onClick={handleHire}
        className="w-full rounded-xl font-semibold text-base h-13"
      >
        {deploying ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" />
            Setting up {agentName}...
          </>
        ) : (
          <>
            <Rocket className="size-4 mr-2" />
            Hire {agentName}
          </>
        )}
      </Button>

      <AlertDialog open={!!error} onOpenChange={(open) => { if (!open) setError(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-red-500/15">
              <CircleAlert className="text-red-400" />
            </AlertDialogMedia>
            <AlertDialogTitle>Couldn&apos;t deploy</AlertDialogTitle>
            <AlertDialogDescription>{error}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
