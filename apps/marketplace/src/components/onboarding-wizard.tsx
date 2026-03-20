'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { renameCorporation } from '@/lib/projects/actions'
import {
  Loader2,
  ArrowRight,
  Sparkles,
  Building2,
} from 'lucide-react'

interface OnboardingWizardProps {
  corporationId: string
  coFounderInstanceId: string | null
}

export function OnboardingWizard({
  corporationId,
  coFounderInstanceId,
}: OnboardingWizardProps) {
  const router = useRouter()
  const [corpName, setCorpName] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    const trimmed = corpName.trim()
    if (!trimmed || trimmed.length > 50) {
      setError('Name must be 1-50 characters.')
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        const result = await renameCorporation(corporationId, trimmed)
        if ('error' in result && result.error) {
          setError(result.error)
          return
        }
        // Redirect to co-founder DM if available, otherwise home
        if (coFounderInstanceId) {
          router.push(`/workspace/dm/${coFounderInstanceId}`)
        } else {
          router.push('/workspace/home')
          router.refresh()
        }
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="max-w-lg w-full">
        {/* Welcome header */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 mx-auto mb-6">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">
          Welcome to AgentBay
        </h2>
        <p className="text-muted-foreground mb-8">
          Name your corporation and meet your co-founder.
        </p>

        {/* Co-founder status */}
        {coFounderInstanceId && (
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-4 py-2 text-sm text-primary mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Your co-founder is getting ready...
          </div>
        )}

        {/* Name input */}
        <Card className="border-0 text-left">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
                <Building2 className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">Name your corporation</p>
                <p className="text-xs text-muted-foreground">
                  This is your AI company. You can always rename it later.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="My Corporation"
                value={corpName}
                onChange={(e) => setCorpName(e.target.value)}
                maxLength={50}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit()
                }}
              />
              <Button
                onClick={handleSubmit}
                disabled={!corpName.trim() || isPending}
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    Get Started
                    <ArrowRight className="size-4 ml-1" />
                  </>
                )}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="mt-3 border-0 bg-red-500/10">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
