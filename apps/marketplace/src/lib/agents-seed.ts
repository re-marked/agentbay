import { createServiceClient } from '@agentbay/db/server'

const SYSTEM_AGENTS = [
  {
    name: "Co-Founder",
    slug: "personal-ai",
    tagline: "Your permanent AI partner — runs the corporation with you",
    description: "Your Co-Founder is the first agent in every corporation. It knows your goals, manages your other agents, and operates as a true business partner. Always running, always thinking about what's next. One per corporation — can't be fired.",
    category: "system",
    pricing_model: "free",
    icon_url: "\u{1F91D}",
    tags: ["co-founder", "leadership", "management"],
  },
  {
    name: "Team Leader",
    slug: "team-leader",
    tagline: "Autonomous team coordinator — assigns tasks, tracks progress, reports up",
    description: "Each team gets a dedicated Team Leader agent that owns outcomes. It breaks down goals into tasks, assigns work to team members, tracks progress, and keeps you informed. Direct, efficient, and biased toward action.",
    category: "system",
    pricing_model: "free",
    icon_url: "\u{1F451}",
    tags: ["team-leader", "coordination", "task-management"],
  },
]

const DEMO_AGENTS = [
  {
    name: "Nova",
    slug: "nova-research",
    tagline: "Deep-dive researcher that synthesizes sources into clear summaries",
    description: "Nova reads papers, articles, and documentation to give you thorough, well-cited answers. Perfect for literature reviews, competitive analysis, and fact-checking.",
    category: "research",
    pricing_model: "free",
    icon_url: "\u{1F52C}",
    tags: ["research", "summarization", "citations"],
  },
  {
    name: "Scribe",
    slug: "scribe-writer",
    tagline: "Versatile writing assistant for blogs, emails, and long-form content",
    description: "Scribe adapts to your voice and tone. From punchy social posts to detailed whitepapers, it writes drafts you actually want to use.",
    category: "writing",
    pricing_model: "free",
    icon_url: "\u270D\uFE0F",
    tags: ["writing", "copywriting", "editing"],
  },
  {
    name: "Archie",
    slug: "archie-coder",
    tagline: "Full-stack coding partner that writes, reviews, and debugs code",
    description: "Archie understands your codebase context and writes production-ready code. Supports TypeScript, Python, Rust, Go, and more.",
    category: "coding",
    pricing_model: "free",

    icon_url: "\u{1F4BB}",
    tags: ["coding", "debugging", "code-review"],
  },
  {
    name: "Planner",
    slug: "planner-productivity",
    tagline: "Turns vague goals into actionable plans with deadlines and milestones",
    description: "Tell Planner what you want to achieve and it breaks it down into concrete steps. Integrates with your calendar and task manager.",
    category: "productivity",
    pricing_model: "free",
    icon_url: "\u{1F4CB}",
    tags: ["planning", "project-management", "goals"],
  },
  {
    name: "Ledger",
    slug: "ledger-business",
    tagline: "Financial analyst that reads spreadsheets and generates reports",
    description: "Upload your financials and Ledger will find trends, flag anomalies, and create executive-ready reports with charts.",
    category: "business",
    pricing_model: "free",

    icon_url: "\u{1F4CA}",
    tags: ["finance", "analytics", "reporting"],
  },
  {
    name: "Muse",
    slug: "muse-creative",
    tagline: "Creative brainstorming partner for ideas, stories, and concepts",
    description: "Muse helps you break through creative blocks. Whether you're designing a brand, writing fiction, or brainstorming product ideas, Muse keeps the ideas flowing.",
    category: "creative",
    pricing_model: "free",
    icon_url: "\u{1F3A8}",
    tags: ["brainstorming", "ideation", "storytelling"],
  },
  {
    name: "Coach",
    slug: "coach-personal",
    tagline: "Personal growth coach that helps you build better habits",
    description: "Coach provides accountability, tracks your progress, and offers evidence-based advice for health, productivity, and mindset.",
    category: "personal",
    pricing_model: "free",
    icon_url: "\u{1F9E0}",
    tags: ["coaching", "habits", "self-improvement"],
  },
  {
    name: "Catalyst",
    slug: "catalyst-productivity",
    tagline: "Automates repetitive workflows so you can focus on what matters",
    description: "Catalyst connects to your tools and automates the boring stuff — email triage, data entry, report generation, and more.",
    category: "productivity",
    pricing_model: "free",

    icon_url: "\u26A1",
    tags: ["automation", "workflows", "integration"],
  },
  {
    name: "Cipher",
    slug: "cipher-coder",
    tagline: "Security-focused code auditor that finds vulnerabilities before hackers do",
    description: "Cipher scans your codebase for OWASP top 10 vulnerabilities, insecure dependencies, and logic flaws. Get actionable fix suggestions with every finding.",
    category: "coding",
    pricing_model: "free",

    icon_url: "\u{1F6E1}\uFE0F",
    tags: ["security", "audit", "vulnerabilities"],
  },
  {
    name: "Pixel",
    slug: "pixel-creative",
    tagline: "UI/UX design consultant that critiques layouts and suggests improvements",
    description: "Send Pixel a screenshot or describe your interface and get detailed feedback on hierarchy, spacing, color, and accessibility. Outputs actionable design tokens.",
    category: "creative",
    pricing_model: "free",

    icon_url: "\u{1F3AF}",
    tags: ["design", "ui-ux", "accessibility"],
  },
  {
    name: "Atlas",
    slug: "atlas-research",
    tagline: "Market research analyst that maps competitors and industry trends",
    description: "Atlas monitors market signals, analyzes competitor moves, and synthesizes industry reports into strategic insights you can act on today.",
    category: "research",
    pricing_model: "free",

    icon_url: "\u{1F5FA}\uFE0F",
    tags: ["market-research", "competitors", "trends"],
  },
  {
    name: "Quill",
    slug: "quill-writing",
    tagline: "Technical documentation writer that turns code into clear docs",
    description: "Quill reads your codebase and generates READMEs, API references, and onboarding guides. Keeps docs in sync as your code evolves.",
    category: "writing",
    pricing_model: "free",

    icon_url: "\u{1F4D6}",
    tags: ["documentation", "technical-writing", "api-docs"],
  },
  {
    name: "Abacus",
    slug: "abacus-business",
    tagline: "Pricing strategist that models revenue scenarios and optimizes margins",
    description: "Feed Abacus your cost structure and customer data. It runs Monte Carlo simulations and recommends pricing tiers that maximize lifetime value.",
    category: "business",
    pricing_model: "free",

    icon_url: "\u{1F9EE}",
    tags: ["pricing", "revenue", "strategy"],
  },
  {
    name: "Zen",
    slug: "zen-personal",
    tagline: "Mindfulness companion that guides meditation and stress management",
    description: "Zen crafts personalized breathing exercises, journaling prompts, and micro-meditations based on your mood and schedule. No fluff, just calm.",
    category: "personal",
    pricing_model: "free",
    icon_url: "\u{1FAB7}",
    tags: ["meditation", "mindfulness", "wellness"],
  },
  {
    name: "Dispatch",
    slug: "dispatch-productivity",
    tagline: "Smart email triager that drafts replies and surfaces what matters",
    description: "Dispatch reads your inbox, categorizes messages by urgency, drafts context-aware replies, and flags threads that need your personal attention.",
    category: "productivity",
    pricing_model: "free",

    icon_url: "\u{1F4EC}",
    tags: ["email", "triage", "communication"],
  },
  {
    name: "Sonnet",
    slug: "sonnet-creative",
    tagline: "Poetry and lyric generator that writes in any style or meter",
    description: "From haikus to hip-hop verses, Sonnet composes original poetry tailored to your theme, mood, and formal constraints. Rhyme schemes on demand.",
    category: "creative",
    pricing_model: "free",
    icon_url: "\u{1F3AD}",
    tags: ["poetry", "lyrics", "creative-writing"],
  },
  {
    name: "Vex",
    slug: "vex-coding",
    tagline: "Database architect that designs schemas and optimizes queries",
    description: "Describe your data model and Vex generates migration files, indexes, and query plans. Supports Postgres, MySQL, SQLite, and MongoDB.",
    category: "coding",
    pricing_model: "free",

    icon_url: "\u{1F5C4}\uFE0F",
    tags: ["database", "sql", "schema-design"],
  },
  {
    name: "Herald",
    slug: "herald-business",
    tagline: "PR and communications strategist that crafts press releases and pitches",
    description: "Herald helps you write compelling press releases, media pitches, and crisis communications. Trained on thousands of successful campaigns.",
    category: "business",
    pricing_model: "free",

    icon_url: "\u{1F4E3}",
    tags: ["pr", "communications", "media"],
  },
  {
    name: "Sage",
    slug: "sage-research",
    tagline: "Academic paper reviewer that evaluates methodology and finds gaps",
    description: "Sage reads academic papers and returns structured reviews covering methodology, statistical rigor, novelty, and reproducibility. Perfect for peer review prep.",
    category: "research",
    pricing_model: "free",

    icon_url: "\u{1F393}",
    tags: ["academic", "peer-review", "methodology"],
  },
  {
    name: "Compass",
    slug: "compass-personal",
    tagline: "Career advisor that maps growth paths and preps you for interviews",
    description: "Compass analyzes your experience, identifies skill gaps, and generates tailored interview prep. From resume rewrites to salary negotiation scripts.",
    category: "personal",
    pricing_model: "free",
    icon_url: "\u{1F9ED}",
    tags: ["career", "interviews", "resume"],
  },
]

/**
 * Seeds demo agents if the agents table is empty.
 * Uses service client to bypass RLS. Safe to call on every page load —
 * only inserts when count is 0.
 */
export async function seedDemoAgentsIfEmpty() {
  // Only seed demo agents in development
  if (process.env.NODE_ENV !== 'development') return

  const service = createServiceClient()

  const { count, error: countError } = await service
    .from("agents")
    .select("*", { count: "exact", head: true })
    .eq("status", "published")

  if (countError) return

  if (count !== null && count >= DEMO_AGENTS.length) return

  // We need a creator_id — use the first user
  const { data: firstUser, error: userError } = await service
    .from("users")
    .select("id")
    .limit(1)
    .single()

  if (userError || !firstUser) return

  const now = new Date().toISOString()

  // System agents always get seeded (even in production)
  const systemAgents = SYSTEM_AGENTS.map((a) => ({
    ...a,
    creator_id: firstUser.id,
    github_repo_url: `https://github.com/agentbay/${a.slug}`,
    status: "published" as const,
    published_at: now,
    total_hires: 0,
    total_reviews: 0,
    avg_rating: null,
  }))

  await service.from("agents").upsert(systemAgents, { onConflict: "slug" })

  const agents = DEMO_AGENTS.map((a) => ({
    ...a,
    creator_id: firstUser.id,
    github_repo_url: `https://github.com/agentbay/${a.slug}`,
    status: "published" as const,
    published_at: now,
    total_hires: Math.floor(Math.random() * 500) + 10,
    total_reviews: Math.floor(Math.random() * 100) + 5,
    avg_rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
  }))

  await service.from("agents").upsert(agents, { onConflict: "slug" })
}
