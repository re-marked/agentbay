"use client"

import { Download } from "lucide-react"
import { SkillEmoji, SKILL_CATEGORY_COLORS, SKILL_SOURCE_COLORS, type SkillListItem } from "@/lib/skills"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}

export function SkillCardLarge({
  skill,
  onSelect,
}: {
  skill: SkillListItem
  onSelect: (skill: SkillListItem) => void
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(skill)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(skill)
      }}
      className="group border-0 gap-0 py-0 cursor-pointer select-none"
    >
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start gap-4">
          <SkillEmoji emoji={skill.emoji} name={skill.name} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight text-foreground truncate">
              {skill.name}
            </h3>
            <p className="text-[13px] text-muted-foreground mt-1 line-clamp-2">
              {skill.description}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Download className="size-3" />
                {formatCount(skill.total_installs)}
              </span>
              <span className="text-xs text-muted-foreground/60">
                v{skill.version}
              </span>
              {skill.author && (
                <span className="text-xs text-muted-foreground/60">
                  by {skill.author}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <Badge
            variant="secondary"
            className={
              SKILL_CATEGORY_COLORS[skill.category] ??
              "bg-secondary text-secondary-foreground"
            }
          >
            {skill.category}
          </Badge>
          <Badge
            variant="secondary"
            className={
              SKILL_SOURCE_COLORS[skill.source] ??
              "bg-secondary text-secondary-foreground"
            }
          >
            {skill.source}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
