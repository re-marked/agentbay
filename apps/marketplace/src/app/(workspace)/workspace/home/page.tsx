import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProvisioningPoller } from '@/components/provisioning-poller'
import { OnboardingWizard } from '@/components/onboarding-wizard'
import { HiredAgentGrid, type HiredAgent } from '@/components/hired-agent-grid'
import { getActiveProjectId, getProjectAgents, toAgentInfoList } from '@/lib/projects/queries'

export default async function HomePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  // Load agents for the active project
  const { corporations, corporationId, activeProjectId, coFounderInstanceId } = await getActiveProjectId(user.id)
  const instances = await getProjectAgents(user.id, activeProjectId)
  const agents: HiredAgent[] = toAgentInfoList(instances)

  // Onboarding detection: corp name is still default AND user has at most the auto-hired Personal AI
  const corp = corporations.find(c => c.id === corporationId)
  const needsOnboarding = corp?.name === 'My Corporation' && agents.length <= 1

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 lg:px-12">
      {needsOnboarding ? (
        <OnboardingWizard
          corporationId={corporationId}
          coFounderInstanceId={coFounderInstanceId ?? null}
        />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-[28px] font-bold tracking-tight">Your Agents</h1>
              <p className="text-muted-foreground mt-1">
                {agents.length === 0
                  ? "Hire your first assistant from the marketplace"
                  : `${agents.length} agent${agents.length === 1 ? "" : "s"} in your workspace`}
              </p>
            </div>
            <Button asChild>
              <Link href="/discover">
                <Plus className="size-4 mr-2" />
                Hire Agent
              </Link>
            </Button>
          </div>

          {/* Empty state / Agent grid */}
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-card mb-5">
                <Plus className="h-9 w-9 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No agents yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                Browse the marketplace and hire your first AI assistant. They'll appear here ready to chat.
              </p>
              <Button size="lg" asChild>
                <Link href="/discover">
                  Browse Marketplace
                </Link>
              </Button>
            </div>
          ) : (
            <HiredAgentGrid agents={agents} />
          )}
        </>
      )}

      {/* Poll provisioning agents */}
      <ProvisioningPoller
        instanceIds={agents.filter((a) => a.status === "provisioning").map((a) => a.instanceId)}
      />
    </div>
  )
}
