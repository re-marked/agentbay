import { NextResponse } from 'next/server'
import { tasks } from '@trigger.dev/sdk/v3'

/**
 * Vercel Cron endpoint that triggers the Trigger.dev sync-clawhub-skills task.
 * Runs daily at 4 AM UTC via vercel.json cron config.
 * Also callable manually via GET /api/cron/sync-skills?secret=CRON_SECRET.
 */
export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret) {
    const isVercelCron = authHeader === `Bearer ${cronSecret}`
    const isManualTrigger = secret === cronSecret
    if (!isVercelCron && !isManualTrigger) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const handle = await tasks.trigger('sync-clawhub-skills', {})
    return NextResponse.json({ ok: true, taskId: handle.id })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to trigger sync', detail: String(err) },
      { status: 500 }
    )
  }
}
