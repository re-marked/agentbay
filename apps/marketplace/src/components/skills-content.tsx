"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import { SkillCardLarge } from "@/components/skill-card"
import { SkillDetailSheet } from "@/components/skill-detail-sheet"
import type { SkillListItem } from "@/lib/skills"
import type { User } from "@supabase/supabase-js"

export function SkillsContent({
  skills,
  user,
}: {
  skills: SkillListItem[]
  user: User | null
}) {
  const searchParams = useSearchParams()
  const query = searchParams.get("q")
  const category = searchParams.get("category")

  const [selectedSkill, setSelectedSkill] = useState<SkillListItem | null>(null)

  const heading = query
    ? `Results for "${query}"`
    : category && category !== "all"
      ? category.charAt(0).toUpperCase() + category.slice(1)
      : "Skills"

  return (
    <main className="px-8 py-8 lg:px-12">
      <h1 className="text-[28px] font-bold tracking-tight mb-8">{heading}</h1>

      {skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary mb-5">
            <Search className="h-9 w-9 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No skills found</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Try a different search term or browse another category.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {skills.map((skill) => (
            <SkillCardLarge
              key={skill.id}
              skill={skill}
              onSelect={setSelectedSkill}
            />
          ))}
        </div>
      )}

      <SkillDetailSheet
        skill={selectedSkill}
        open={!!selectedSkill}
        onOpenChange={(open) => {
          if (!open) setSelectedSkill(null)
        }}
        user={user}
      />
    </main>
  )
}
