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
// Emoji pool for random skill avatars
// ---------------------------------------------------------------------------

export const SKILL_EMOJIS = [
  "\u{1F680}", "\u{1F52C}", "\u{1F9EA}", "\u{1F4A1}", "\u{1F527}", "\u{2699}\uFE0F",
  "\u{1F50D}", "\u{1F4CA}", "\u{1F4DD}", "\u{1F4E6}", "\u{1F310}", "\u{1F5C3}\uFE0F",
  "\u{1F916}", "\u{1F3AF}", "\u{26A1}", "\u{1F4AC}", "\u{1F512}", "\u{1F4CB}",
  "\u{1F9ED}", "\u{1F4D0}", "\u{1F433}", "\u{2601}\uFE0F", "\u{1F525}", "\u{1F4F8}",
  "\u{1F50E}", "\u{1F33F}", "\u{1F4E7}", "\u{1F30D}", "\u{1F6F0}\uFE0F", "\u23F0",
  "\u{1F3A8}", "\u{1F4D6}", "\u{1F9E0}", "\u{1F4BB}", "\u270D\uFE0F", "\u{1F5FA}\uFE0F",
  "\u{1F9EE}", "\u{1F393}", "\u{1F4EC}", "\u{1F3AD}", "\u{1F6E1}\uFE0F", "\u{1FAB7}",
  "\u{1F4E3}", "\u25B2", "\u{1F4C4}", "\u{1F9F2}", "\u{1F4CE}", "\u{1F5C4}\uFE0F",
]

/** Pick a deterministic emoji from a string (slug/name). */
export function pickEmoji(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return SKILL_EMOJIS[Math.abs(hash) % SKILL_EMOJIS.length]
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
