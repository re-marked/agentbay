import { Suspense } from "react"
import { createClient } from "@agentbay/db/server"
import { getUser } from "@/lib/auth/get-user"
import { SkillsSidebar } from "@/components/skills-sidebar"
import { SkillsContent } from "@/components/skills-content"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { seedDemoSkillsIfEmpty } from "@/lib/skills-seed"
import type { SkillListItem } from "@/lib/skills"

interface Props {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>
}

async function fetchSkills(searchParams: {
  q?: string
  category?: string
  sort?: string
}): Promise<SkillListItem[]> {
  const supabase = await createClient()
  let query = supabase
    .from("skills")
    .select(
      "id, slug, name, description, emoji, category, source, version, author, total_installs, tags"
    )
    .eq("status", "published")

  if (searchParams.q) {
    const term = `%${searchParams.q}%`
    query = query.or(
      `name.ilike.${term},description.ilike.${term}`
    )
  }

  if (searchParams.category && searchParams.category !== "all") {
    query = query.eq("category", searchParams.category)
  }

  switch (searchParams.sort) {
    case "newest":
      query = query.order("created_at", { ascending: false })
      break
    case "name":
      query = query.order("name", { ascending: true })
      break
    default:
      query = query.order("total_installs", { ascending: false })
      break
  }

  query = query.limit(100)
  const { data } = await query
  if (!data) return []

  return data.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    emoji: s.emoji,
    category: s.category,
    source: s.source,
    version: s.version,
    author: s.author,
    total_installs: s.total_installs,
    tags: s.tags ?? [],
  }))
}

export default async function SkillsPage({ searchParams }: Props) {
  await seedDemoSkillsIfEmpty()

  const [user, params] = await Promise.all([getUser(), searchParams])
  const skills = await fetchSkills(params)

  return (
    <SidebarProvider className="h-full !min-h-0">
      <Suspense>
        <SkillsSidebar />
      </Suspense>
      <SidebarInset className="overflow-hidden">
        <ScrollArea className="h-0 flex-1">
          <Suspense>
            <SkillsContent skills={skills} user={user} />
          </Suspense>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  )
}
