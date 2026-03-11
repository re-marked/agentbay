import {
  Sparkles,
  Rocket,
  Search,
  PenTool,
  Code,
  Briefcase,
  Palette,
  Heart,
  Shield,
  type LucideIcon,
} from "lucide-react"

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  all: Sparkles,
  system: Shield,
  productivity: Rocket,
  research: Search,
  writing: PenTool,
  coding: Code,
  business: Briefcase,
  creative: Palette,
  personal: Heart,
}

export const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "system", label: "System" },
  { id: "productivity", label: "Productivity" },
  { id: "research", label: "Research" },
  { id: "writing", label: "Writing" },
  { id: "coding", label: "Coding" },
  { id: "business", label: "Business" },
  { id: "creative", label: "Creative" },
  { id: "personal", label: "Personal" },
] as const

export const SYSTEM_AGENT_SLUGS = ['personal-ai', 'team-leader'] as const

export const CATEGORY_COLORS: Record<string, string> = {
  system: "bg-indigo-500/15 text-indigo-400",
  productivity: "bg-primary/15 text-primary",
  research: "bg-emerald-500/15 text-emerald-400",
  writing: "bg-purple-500/15 text-purple-400",
  coding: "bg-amber-500/15 text-amber-400",
  business: "bg-rose-500/15 text-rose-400",
  creative: "bg-pink-500/15 text-pink-400",
  personal: "bg-cyan-500/15 text-cyan-400",
  general: "bg-zinc-500/15 text-zinc-400",
}

const CATEGORY_GRADIENT: Record<string, string> = {
  system: "from-indigo-500 to-indigo-600",
  productivity: "from-primary to-primary/80",
  research: "from-emerald-500 to-emerald-600",
  writing: "from-purple-500 to-purple-600",
  coding: "from-amber-500 to-amber-600",
  business: "from-rose-500 to-rose-600",
  creative: "from-pink-500 to-pink-600",
  personal: "from-cyan-500 to-cyan-600",
  general: "from-indigo-500 to-indigo-600",
}

/**
 * Converts an emoji character to a Twemoji CDN SVG URL.
 */
function emojiToTwemojiUrl(emoji: string): string {
  const codepoints = [...emoji]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((cp) => cp !== "fe0f")
    .join("-")
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoints}.svg`
}

/**
 * Returns true if the string is a single emoji (not a URL or text).
 */
function isEmoji(str: string): boolean {
  return str.length <= 8 && !/^https?:\/\//.test(str)
}

export function AgentAvatar({
  name,
  category,
  iconUrl,
  size = "md",
}: {
  name: string
  category: string
  iconUrl?: string | null
  size?: "xs" | "sm" | "md" | "lg"
}) {
  const sizeClasses = {
    xs: "h-5 w-5 rounded-md",
    sm: "h-10 w-10 rounded-xl",
    md: "h-12 w-12 rounded-[14px]",
    lg: "h-16 w-16 rounded-2xl",
  }
  const imgSize = { xs: 14, sm: 24, md: 28, lg: 36 }

  if (iconUrl && isEmoji(iconUrl)) {
    return (
      <div
        className={`flex items-center justify-center bg-secondary shrink-0 ${sizeClasses[size]}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={emojiToTwemojiUrl(iconUrl)}
          alt={name}
          width={imgSize[size]}
          height={imgSize[size]}
          className="select-none"
          draggable={false}
        />
      </div>
    )
  }

  if (iconUrl && !isEmoji(iconUrl)) {
    return (
      <div
        className={`flex items-center justify-center bg-secondary shrink-0 overflow-hidden ${sizeClasses[size]}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconUrl} alt={name} className="h-full w-full object-cover" />
      </div>
    )
  }

  // Fallback: colored initial
  const gradient = CATEGORY_GRADIENT[category] ?? "from-zinc-500 to-zinc-600"
  const textSize = { xs: "text-[10px]", sm: "text-sm", md: "text-lg", lg: "text-2xl" }
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${gradient} text-white font-semibold shrink-0 ${sizeClasses[size]} ${textSize[size]}`}
    >
      {name[0]}
    </div>
  )
}

/** @deprecated Use AgentAvatar instead */
export const AgentInitial = AgentAvatar

export type AgentCategory = (typeof CATEGORIES)[number]["id"]

export interface AgentListItem {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: string
  avg_rating: number | null
  total_hires: number
  total_reviews: number
  icon_url: string | null
  creator_name: string | null
}
