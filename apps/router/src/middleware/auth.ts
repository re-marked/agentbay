import { createMiddleware } from 'hono/factory'

/**
 * Service key authentication middleware.
 *
 * All /v1/* endpoints require a Bearer token matching ROUTER_SERVICE_KEY.
 * If ROUTER_SERVICE_KEY is not set (local dev), auth is bypassed.
 *
 * Usage:
 *   - Marketplace (Vercel): sends Bearer token in Authorization header
 *   - Agents (Fly): send Bearer token when calling back with responses
 *   - Webhooks: include Bearer token in webhook config
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const expected = process.env.ROUTER_SERVICE_KEY

  // Dev mode: no key configured = no auth check
  if (!expected) {
    await next()
    return
  }

  const header = c.req.header('Authorization')

  if (!header) {
    return c.json({ error: 'Missing Authorization header' }, 401)
  }

  if (!header.startsWith('Bearer ')) {
    return c.json({ error: 'Authorization must use Bearer scheme' }, 401)
  }

  const token = header.slice(7)

  if (token !== expected) {
    return c.json({ error: 'Invalid service key' }, 403)
  }

  await next()
})
