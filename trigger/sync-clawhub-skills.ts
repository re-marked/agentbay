import { schedules, logger } from '@trigger.dev/sdk/v3'
import { createServiceClient } from '@agentbay/db'

const GITHUB_REPO = 'openclaw/skills'
const GITHUB_BRANCH = 'main'
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}`
const API_BASE = `https://api.github.com/repos/${GITHUB_REPO}`

// Popularity ranking — top slugs from ClawHub, ranked by install count.
// Skills matching these slugs get boosted total_installs so they show first.
const TOP_SLUGS = [
  'self-improving-agent', 'gog', 'tavily-search', 'find-skills', 'summarize',
  'github', 'agent-browser', 'weather', 'polymarketodds', 'proactive-agent',
  'sonoscli', 'notion', 'nano-pdf', 'nano-banana-pro', 'api-gateway',
  'obsidian', 'humanizer', 'openai-whisper', 'mcporter', 'free-ride',
  'brave-search', 'humanize-ai-text', 'auto-updater', 'byterover',
  'skill-creator', 'clawddocs', 'himalaya', 'youtube-watcher', 'stock-analysis',
  'youtube-api-skill', 'slack', 'frontend-design', 'baidu-search', 'gmail',
  'elite-longterm-memory', 'lnbits-with-qrcode', 'automation-workflows',
  'model-usage', 'blogwatcher', 'video-frames', 'trello', 'outlook-api',
  'stripe-api', 'browser-use', 'whatsapp-business', 'gemini', 'imap-smtp-email',
  'shopify', 'xero', 'desktop-control', 'salesforce-api', 'typeform',
  'markdown-convert', 'google-slides', 'google-meet', 'clickup-api',
  'caldav-calendar', 'calendly-api', 'asana-api', 'fathom-api', 'trello-api',
  'google-workspace-admin', 'discord', 'docker-essentials', 'apple-notes',
  'stock-market-pro', 'pipedrive-api', 'qmd', 'mailchimp', 'moltbook-interact',
  'google-play', 'klaviyo',
]

// Build slug → installs map (rank 1 = 10000, rank 72 = 100)
const SLUG_INSTALLS = new Map<string, number>()
TOP_SLUGS.forEach((slug, i) => {
  SLUG_INSTALLS.set(slug, Math.max(Math.round(10000 - (i * 138)), 100))
})

const BATCH_SIZE = 200
const MAX_SKILL_CONTENT_BYTES = 16384 // 16KB per skill

const SKILL_EMOJIS = [
  '\u{1F680}', '\u{1F52C}', '\u{1F9EA}', '\u{1F4A1}', '\u{1F527}', '\u2699\uFE0F',
  '\u{1F50D}', '\u{1F4CA}', '\u{1F4DD}', '\u{1F4E6}', '\u{1F310}', '\u{1F5C3}\uFE0F',
  '\u{1F916}', '\u{1F3AF}', '\u26A1', '\u{1F4AC}', '\u{1F512}', '\u{1F4CB}',
  '\u{1F9ED}', '\u{1F4D0}', '\u{1F433}', '\u2601\uFE0F', '\u{1F525}', '\u{1F4F8}',
  '\u{1F50E}', '\u{1F33F}', '\u{1F4E7}', '\u{1F30D}', '\u{1F6F0}\uFE0F', '\u23F0',
  '\u{1F3A8}', '\u{1F4D6}', '\u{1F9E0}', '\u{1F4BB}', '\u270D\uFE0F', '\u{1F5FA}\uFE0F',
  '\u{1F9EE}', '\u{1F393}', '\u{1F4EC}', '\u{1F3AD}', '\u{1F6E1}\uFE0F', '\u{1FAB7}',
  '\u{1F4E3}', '\u25B2', '\u{1F4C4}', '\u{1F9F2}', '\u{1F4CE}', '\u{1F5C4}\uFE0F',
]

function pickEmoji(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return SKILL_EMOJIS[Math.abs(hash) % SKILL_EMOJIS.length]
}

/**
 * Simple YAML frontmatter parser — extracts name + description from SKILL.md
 */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return {}
  const yaml = match[1]
  const result: { name?: string; description?: string } = {}
  const nameMatch = yaml.match(/^name:\s*(.+)$/m)
  if (nameMatch) result.name = nameMatch[1].trim()
  const descMatch = yaml.match(/^description:\s*(.+)$/m)
  if (descMatch) result.description = descMatch[1].trim()
  return result
}

/**
 * Categorize a skill by keywords in its name/description.
 */
function categorize(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase()
  if (/\b(docker|k8s|kubernetes|ci\/cd|deploy|devops|terraform|ansible|helm|infra|monitor|aws|gcp|azure|cloud|pipeline|jenkins|github.actions|argo)\b/.test(text)) return 'devops'
  if (/\b(api|web|html|css|react|next|vue|angular|http|rest|graphql|url|scrape|crawl|seo|dns|cdn|vercel|netlify|cloudflare|browser)\b/.test(text)) return 'web'
  if (/\b(code|debug|refactor|lint|test|git|commit|pr|review|typescript|python|rust|golang|java|swift|compile|build|ide|vscode|neovim|sql|database|query|schema|migration)\b/.test(text)) return 'coding'
  if (/\b(research|search|analyze|paper|study|academic|scholar|arxiv|pubmed|survey|literature)\b/.test(text)) return 'research'
  if (/\b(data|csv|json|excel|spreadsheet|parse|transform|etl|pipeline|chart|graph|visualization|analytics|statistics|pandas|numpy)\b/.test(text)) return 'data'
  if (/\b(email|slack|discord|telegram|chat|message|notify|notification|communicate|sms|whatsapp|translate|i18n|language)\b/.test(text)) return 'communication'
  if (/\b(design|art|creative|image|draw|color|palette|font|typography|ui|ux|figma|sketch|animation|music|audio|video|photo|media)\b/.test(text)) return 'creative'
  if (/\b(task|todo|note|calendar|schedule|automate|workflow|productivity|organize|plan|time|pomodoro|bookmark|template|document|markdown|readme|changelog|meeting)\b/.test(text)) return 'productivity'
  return 'general'
}

/**
 * Fetch text from a URL with timeout. Returns null on failure.
 */
async function fetchText(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/**
 * Sync skills from the openclaw/skills GitHub repo into the Supabase skills table.
 *
 * Strategy:
 * 1. Fetch the full repo tree via GitHub API (single request, returns all paths)
 * 2. Extract all author/skill-slug pairs that have _meta.json
 * 3. Check which slugs already exist in DB to skip them (incremental sync)
 * 4. For new skills, fetch _meta.json + SKILL.md via raw.githubusercontent.com
 * 5. Parse metadata, categorize, and upsert in batches
 */
export const syncClawhubSkills = schedules.task({
  id: 'sync-clawhub-skills',
  cron: '0 4 * * *', // 4 AM UTC daily
  maxDuration: 1800, // 30 minutes

  run: async () => {
    const db = createServiceClient()

    // 1. Fetch the full git tree
    logger.info('Fetching git tree from GitHub...')
    const treeRes = await fetch(`${API_BASE}/git/trees/${GITHUB_BRANCH}?recursive=1`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    })

    if (!treeRes.ok) {
      logger.error(`GitHub tree API failed: ${treeRes.status} ${treeRes.statusText}`)
      return { error: `GitHub API ${treeRes.status}` }
    }

    const tree = await treeRes.json() as { tree: { path: string; type: string }[] }
    logger.info(`Tree has ${tree.tree.length} entries`)

    // 2. Find all _meta.json at skills/{author}/{slug}/_meta.json (depth 3)
    const metaPaths = tree.tree
      .filter(e => e.type === 'blob' && /^skills\/[^/]+\/[^/]+\/_meta\.json$/.test(e.path))
      .map(e => e.path)

    logger.info(`Found ${metaPaths.length} skill _meta.json files`)

    // Build a map of skill slugs to their paths
    // slug format: {author}--{skill-slug} to avoid collisions
    const skillEntries: { author: string; skillSlug: string; metaPath: string; dir: string }[] = []
    for (const p of metaPaths) {
      const parts = p.split('/')
      if (parts.length !== 4) continue
      const author = parts[1]
      const skillSlug = parts[2]
      skillEntries.push({
        author,
        skillSlug,
        metaPath: p,
        dir: `skills/${author}/${skillSlug}`,
      })
    }

    // Also build a set of which dirs have SKILL.md (any casing)
    const skillMdMap = new Map<string, string>() // dir → filename
    for (const e of tree.tree) {
      if (e.type !== 'blob') continue
      const match = e.path.match(/^(skills\/[^/]+\/[^/]+)\/(SKILL\.md|skill\.md|Skill\.md)$/)
      if (match) {
        skillMdMap.set(match[1], match[2])
      }
    }

    // 3. Check which slugs already exist
    const allSlugs = skillEntries.map(e => `${e.author}--${e.skillSlug}`)

    // Fetch existing slugs in batches of 1000 (Supabase limit)
    const existingSlugs = new Set<string>()
    for (let i = 0; i < allSlugs.length; i += 1000) {
      const batch = allSlugs.slice(i, i + 1000)
      const { data } = await db
        .from('skills')
        .select('slug')
        .in('slug', batch)

      if (data) {
        for (const row of data) {
          existingSlugs.add(row.slug)
        }
      }
    }

    const newEntries = skillEntries.filter(e => !existingSlugs.has(`${e.author}--${e.skillSlug}`))
    logger.info(`${existingSlugs.size} skills already exist, ${newEntries.length} new to import`)

    if (newEntries.length === 0) {
      logger.info('No new skills to import')
      return { imported: 0, total: skillEntries.length }
    }

    // 4. Fetch and parse new skills in batches
    let imported = 0
    let skipped = 0
    const FETCH_CONCURRENCY = 20

    for (let batchStart = 0; batchStart < newEntries.length; batchStart += BATCH_SIZE) {
      const batch = newEntries.slice(batchStart, batchStart + BATCH_SIZE)
      const rows: Record<string, unknown>[] = []

      // Fetch meta + skill content concurrently within the batch
      for (let i = 0; i < batch.length; i += FETCH_CONCURRENCY) {
        const chunk = batch.slice(i, i + FETCH_CONCURRENCY)

        const results = await Promise.allSettled(
          chunk.map(async (entry) => {
            // Fetch _meta.json
            const metaText = await fetchText(`${RAW_BASE}/${entry.metaPath}`)
            if (!metaText) return null

            let meta: { owner?: string; slug?: string; displayName?: string; latest?: { version?: string } }
            try {
              meta = JSON.parse(metaText)
            } catch {
              return null
            }

            // Fetch SKILL.md
            const mdFilename = skillMdMap.get(entry.dir)
            let skillContent = ''
            if (mdFilename) {
              const mdText = await fetchText(`${RAW_BASE}/${entry.dir}/${mdFilename}`)
              if (mdText) {
                skillContent = mdText.length > MAX_SKILL_CONTENT_BYTES
                  ? mdText.slice(0, MAX_SKILL_CONTENT_BYTES) + '\n\n[... truncated — see full skill on ClawHub ...]'
                  : mdText
              }
            }

            const frontmatter = parseFrontmatter(skillContent)
            const description = frontmatter.description || meta.displayName || meta.slug || ''
            if (description.length < 5) return null

            const name = meta.displayName || frontmatter.name || meta.slug || entry.skillSlug
            const slug = `${entry.author}--${entry.skillSlug}`

            // Check popularity ranking — match on skill slug (not author--slug)
            const popularityInstalls = SLUG_INSTALLS.get(entry.skillSlug) ?? 0

            return {
              slug: slug.slice(0, 255),
              name: name.length > 80 ? name.slice(0, 77) + '...' : name,
              description: description.slice(0, 500),
              emoji: pickEmoji(slug),
              category: categorize(name, description),
              source: 'openclaw',
              version: meta.latest?.version || '1.0.0',
              author: entry.author,
              homepage: `https://clawhub.dev/skills/${entry.author}/${entry.skillSlug}`,
              tags: [] as string[],
              requires: {},
              skill_content: skillContent || `# ${name}\n\n${description}`,
              status: 'published',
              total_installs: popularityInstalls,
            }
          })
        )

        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            rows.push(r.value)
          } else {
            skipped++
          }
        }
      }

      // Upsert batch into Supabase
      if (rows.length > 0) {
        const { error } = await db
          .from('skills')
          .upsert(rows, { onConflict: 'slug', ignoreDuplicates: true })

        if (error) {
          logger.error(`Batch upsert error at offset ${batchStart}:`, { error: error.message })
        } else {
          imported += rows.length
        }
      }

      logger.info(`Progress: ${Math.min(batchStart + BATCH_SIZE, newEntries.length)} / ${newEntries.length} (${imported} imported, ${skipped} skipped)`)
    }

    logger.info(`Sync complete: ${imported} imported, ${skipped} skipped, ${existingSlugs.size} already existed`)
    return { imported, skipped, alreadyExisted: existingSlugs.size, total: skillEntries.length }
  },
})
