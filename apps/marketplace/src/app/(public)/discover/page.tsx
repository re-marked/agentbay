import { Suspense } from "react"
import { createClient } from "@agentbay/db/server"
import { getUser } from "@/lib/auth/get-user"
import { DiscoverSidebar } from "@/components/discover-sidebar"
import { DiscoverContent } from "@/components/discover-content"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SYSTEM_AGENT_SLUGS, type AgentListItem } from "@/lib/agents"

interface Props {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>
}

function toListItem(a: {
  id: string; slug: string; name: string; tagline: string;
  description: string; category: string; avg_rating: number | null;
  total_hires: number; total_reviews: number; icon_url: string | null;
}): AgentListItem {
  return {
    id: a.id, slug: a.slug, name: a.name, tagline: a.tagline,
    description: a.description, category: a.category,
    avg_rating: a.avg_rating, total_hires: a.total_hires,
    total_reviews: a.total_reviews, icon_url: a.icon_url,
    creator_name: null,
  }
}

async function fetchSystemAgents(): Promise<AgentListItem[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("agents")
    .select("id, slug, name, tagline, description, category, avg_rating, total_hires, total_reviews, icon_url")
    .eq("status", "published")
    .in("slug", [...SYSTEM_AGENT_SLUGS])

  if (!data) return []

  // Keep stable order: co-founder first, team leader second
  const bySlug = new Map(data.map(a => [a.slug, a]))
  return SYSTEM_AGENT_SLUGS
    .map(slug => bySlug.get(slug))
    .filter(Boolean)
    .map(a => toListItem(a!))
}

async function fetchAgents(searchParams: {
  q?: string
  category?: string
  sort?: string
}): Promise<AgentListItem[]> {
  const supabase = await createClient()
  let query = supabase
    .from("agents")
    .select(
      "id, slug, name, tagline, description, category, avg_rating, total_hires, total_reviews, icon_url, creator_id",
    )
    .eq("status", "published")

  if (searchParams.q) {
    const term = `%${searchParams.q}%`
    query = query.or(
      `name.ilike.${term},tagline.ilike.${term},description.ilike.${term}`,
    )
  }

  // When filtering by "system" category, return empty — system agents are shown separately
  if (searchParams.category === "system") {
    return []
  }

  if (searchParams.category && searchParams.category !== "all") {
    query = query.eq("category", searchParams.category)
  }

  // Exclude system agents from the main grid
  for (const slug of SYSTEM_AGENT_SLUGS) {
    query = query.neq("slug", slug)
  }

  switch (searchParams.sort) {
    case "newest":
      query = query.order("published_at", {
        ascending: false,
        nullsFirst: false,
      })
      break
    case "highest_rated":
      query = query.order("avg_rating", {
        ascending: false,
        nullsFirst: false,
      })
      break
    case "most_hired":
      query = query.order("total_hires", { ascending: false })
      break
    default:
      query = query.order("total_hires", { ascending: false })
      break
  }

  query = query.limit(50)
  const { data } = await query
  if (!data) return []
  return data.map(toListItem)
}

export default async function DiscoverPage({ searchParams }: Props) {
  const [user, params] = await Promise.all([getUser(), searchParams])
  const [systemAgents, agents] = await Promise.all([
    fetchSystemAgents(),
    fetchAgents(params),
  ])

  return (
    <SidebarProvider className="h-full !min-h-0">
      <Suspense>
        <DiscoverSidebar />
      </Suspense>
      <SidebarInset className="overflow-hidden">
        <ScrollArea className="h-0 flex-1">
          <Suspense>
            <DiscoverContent systemAgents={systemAgents} agents={agents} user={user} />
          </Suspense>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  )
}
