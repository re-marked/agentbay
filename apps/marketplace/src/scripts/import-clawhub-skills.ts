/**
 * Import skills from the openclaw/skills GitHub repo into the skills table.
 *
 * Usage:
 *   1. Clone: git clone --depth 1 https://github.com/openclaw/skills.git .tmp-skills-import
 *   2. Parse: node .tmp-import-skills.mjs > .tmp-skills-data.json
 *   3. Run:   npx tsx apps/marketplace/src/scripts/import-clawhub-skills.ts
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env or .env.local.
 * Inserts in batches of 500, upserts on slug.
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const BATCH_SIZE = 500
const DATA_FILE = resolve(process.cwd(), ".tmp-skills-data.json")

async function main() {
  // Load env from .env.local if present
  const envPath = resolve(process.cwd(), "apps/marketplace/.env.local")
  try {
    const envContent = readFileSync(envPath, "utf-8")
    for (const line of envContent.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const val = match[2].trim()
        if (!process.env[key]) process.env[key] = val
      }
    }
  } catch {}

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const supabase = createClient(url, key)

  console.log(`Reading ${DATA_FILE}...`)
  const raw = readFileSync(DATA_FILE, "utf-8")
  const skills: Record<string, unknown>[] = JSON.parse(raw)
  console.log(`Loaded ${skills.length} skills`)

  // Clean up data
  const cleaned = skills
    .filter((s: any) => s.skill_content && s.skill_content.length >= 20)
    .map((s: any) => ({
      slug: s.slug.slice(0, 255),
      name: s.name.length > 80 ? s.name.slice(0, 77) + "..." : s.name,
      description: s.description.slice(0, 500),
      emoji: s.emoji,
      category: s.category,
      source: "openclaw",
      version: s.version || "1.0.0",
      author: s.author,
      homepage: s.homepage,
      tags: s.tags || [],
      requires: s.requires || {},
      skill_content: s.skill_content,
      status: "published",
      total_installs: 0,
    }))

  console.log(`Inserting ${cleaned.length} skills in batches of ${BATCH_SIZE}...`)

  let inserted = 0
  let errors = 0

  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    const batch = cleaned.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from("skills")
      .upsert(batch, { onConflict: "slug", ignoreDuplicates: true })

    if (error) {
      console.error(`Batch ${i}-${i + batch.length} error:`, error.message)
      errors++
    } else {
      inserted += batch.length
    }

    if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= cleaned.length) {
      console.log(`  ${Math.min(i + BATCH_SIZE, cleaned.length)} / ${cleaned.length}`)
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${errors} batch errors`)
}

main().catch(console.error)
