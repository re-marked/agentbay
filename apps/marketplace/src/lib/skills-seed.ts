import { createServiceClient } from "@agentbay/db/server"
import { pickEmoji } from "./skills"
import CLAWHUB_SKILLS from "./clawhub-skills.json"

/**
 * Seeds skills from the curated ClawHub catalog if the skills table is empty.
 * Uses service client to bypass RLS. Safe to call on every page load —
 * only inserts when count is 0.
 *
 * Source: https://github.com/openclaw/skills (~15K open-source skills)
 * This file contains ~108 curated skills across all categories.
 *
 * For a full import of all 15K+ skills, run:
 *   git clone --depth 1 https://github.com/openclaw/skills.git .tmp-skills-import
 *   node .tmp-import-skills.mjs > .tmp-skills-data.json
 *   npx tsx apps/marketplace/src/scripts/import-clawhub-skills.ts
 */
export async function seedDemoSkillsIfEmpty() {
  if (process.env.NODE_ENV !== "development") return

  const service = createServiceClient()

  const { count, error: countError } = await service
    .from("skills")
    .select("*", { count: "exact", head: true })
    .eq("status", "published")

  if (countError) return
  if (count !== null && count >= CLAWHUB_SKILLS.length) return

  const skills = CLAWHUB_SKILLS.map((s) => ({
    ...s,
    emoji: s.emoji || pickEmoji(s.slug),
    status: "published" as const,
    total_installs: Math.floor(Math.random() * 300) + 5,
  }))

  // Insert in batches to avoid payload limits
  const BATCH = 50
  for (let i = 0; i < skills.length; i += BATCH) {
    await service
      .from("skills")
      .upsert(skills.slice(i, i + BATCH), { onConflict: "slug" })
  }
}
