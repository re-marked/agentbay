import {
  Sparkles, Code, Search, Rocket, Database, MessageSquare, Palette, Server, Globe,
  type LucideIcon,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillListItem {
  id: string
  slug: string
  name: string
  description: string
  emoji: string | null
  category: string
  source: string
  version: string
  author: string | null
  total_installs: number
  tags: string[]
}

export interface SkillDetail extends SkillListItem {
  skill_content: string
  requires: { tools?: string[]; binaries?: string[]; env?: string[] }
  homepage: string | null
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const SKILL_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "coding", label: "Coding" },
  { id: "research", label: "Research" },
  { id: "productivity", label: "Productivity" },
  { id: "data", label: "Data" },
  { id: "communication", label: "Communication" },
  { id: "creative", label: "Creative" },
  { id: "devops", label: "DevOps" },
  { id: "web", label: "Web" },
] as const

export type SkillCategory = (typeof SKILL_CATEGORIES)[number]["id"]

export const SKILL_CATEGORY_ICONS: Record<string, LucideIcon> = {
  all: Sparkles,
  coding: Code,
  research: Search,
  productivity: Rocket,
  data: Database,
  communication: MessageSquare,
  creative: Palette,
  devops: Server,
  web: Globe,
}

export const SKILL_CATEGORY_COLORS: Record<string, string> = {
  coding: "bg-amber-500/15 text-amber-400",
  research: "bg-emerald-500/15 text-emerald-400",
  productivity: "bg-primary/15 text-primary",
  data: "bg-violet-500/15 text-violet-400",
  communication: "bg-sky-500/15 text-sky-400",
  creative: "bg-pink-500/15 text-pink-400",
  devops: "bg-orange-500/15 text-orange-400",
  web: "bg-teal-500/15 text-teal-400",
  general: "bg-zinc-500/15 text-zinc-400",
}

export const SKILL_SOURCE_COLORS: Record<string, string> = {
  openclaw: "bg-emerald-500/15 text-emerald-400",
  cloudflare: "bg-orange-500/15 text-orange-400",
  vercel: "bg-foreground/10 text-foreground",
  community: "bg-primary/15 text-primary",
}

// ---------------------------------------------------------------------------
// Avatar helpers
// ---------------------------------------------------------------------------

function emojiToTwemojiUrl(emoji: string): string {
  const codepoints = [...emoji]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((cp) => cp !== "fe0f")
    .join("-")
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoints}.svg`
}

export function SkillEmoji({
  emoji,
  name,
  size = "md",
}: {
  emoji: string | null
  name: string
  size?: "sm" | "md" | "lg"
}) {
  const sizeClasses = {
    sm: "h-10 w-10 rounded-xl",
    md: "h-12 w-12 rounded-[14px]",
    lg: "h-16 w-16 rounded-2xl",
  }
  const imgSize = { sm: 24, md: 28, lg: 36 }
  const textSize = { sm: "text-sm", md: "text-lg", lg: "text-2xl" }

  if (emoji) {
    return (
      <div className={`flex items-center justify-center bg-secondary shrink-0 ${sizeClasses[size]}`}>
        <img
          src={emojiToTwemojiUrl(emoji)}
          alt={name}
          width={imgSize[size]}
          height={imgSize[size]}
          className="select-none"
          draggable={false}
        />
      </div>
    )
  }

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-primary to-primary/80 text-white font-semibold shrink-0 ${sizeClasses[size]} ${textSize[size]}`}
    >
      {name[0]}
    </div>
  )
}
