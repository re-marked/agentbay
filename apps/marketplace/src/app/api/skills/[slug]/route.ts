import { createClient } from "@agentbay/db/server"
import { NextResponse } from "next/server"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("skills")
    .select(
      "id, slug, name, description, emoji, category, skill_content, source, requires, version, author, homepage, total_installs, tags"
    )
    .eq("slug", slug)
    .eq("status", "published")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 })
  }

  return NextResponse.json(data)
}
