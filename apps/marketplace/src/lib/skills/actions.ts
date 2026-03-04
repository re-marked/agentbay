"use server"

import { createClient, createServiceClient } from "@agentbay/db/server"
import { getUser } from "@/lib/auth/get-user"
import { revalidatePath } from "next/cache"

/**
 * Get the current user's agent instances (running or suspended) for the
 * "Add to Agent" picker dropdown.
 */
export async function getUserInstances() {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()

  const { data } = await supabase
    .from("agent_instances")
    .select("id, display_name, status, agent_id")
    .eq("user_id", user.id)
    .in("status", ["running", "suspended"])
    .order("display_name")

  return data ?? []
}

interface InstallSkillParams {
  skillSlug: string
  instanceId: string
}

/**
 * Install a skill onto an agent instance.
 * 1. Fetch skill from catalog
 * 2. Verify instance ownership
 * 3. Check not already installed
 * 4. Write SKILL.md to workspace_files JSONB
 * 5. Insert instance_skills row (triggers install count)
 */
export async function installSkill({ skillSlug, instanceId }: InstallSkillParams) {
  const user = await getUser()
  if (!user) return { error: "Unauthorized" } as const

  const service = createServiceClient()

  // 1. Fetch skill
  const { data: skill } = await service
    .from("skills")
    .select("id, slug, name, skill_content")
    .eq("slug", skillSlug)
    .eq("status", "published")
    .single()

  if (!skill) return { error: "Skill not found" } as const

  // 2. Verify instance ownership
  const { data: instance } = await service
    .from("agent_instances")
    .select("id, workspace_files")
    .eq("id", instanceId)
    .eq("user_id", user.id)
    .single()

  if (!instance) return { error: "Agent not found" } as const

  // 3. Check not already installed
  const { data: existing } = await service
    .from("instance_skills")
    .select("id")
    .eq("instance_id", instanceId)
    .eq("skill_id", skill.id)
    .limit(1)
    .single()

  if (existing) return { error: "Skill already installed on this agent" } as const

  // 4. Write SKILL.md to workspace_files
  const workspaceFiles = (instance.workspace_files as Record<string, string>) ?? {}
  // Use subdirectory format: /data/workspace/skills/{name}/SKILL.md
  // This matches what the agent skills UI expects when listing directories
  const skillDir = skill.slug.split('--').pop() || skill.slug
  const skillPath = `/data/workspace/skills/${skillDir}/SKILL.md`
  workspaceFiles[skillPath] = skill.skill_content

  await service
    .from("agent_instances")
    .update({ workspace_files: workspaceFiles })
    .eq("id", instanceId)

  // 5. Insert instance_skills (auto-increments total_installs via trigger)
  const { error: insertErr } = await service
    .from("instance_skills")
    .insert({ instance_id: instanceId, skill_id: skill.id })

  if (insertErr) {
    return { error: `Failed to record installation: ${insertErr.message}` } as const
  }

  revalidatePath("/skills")

  return { success: true, skillName: skill.name }
}
