import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { authMiddleware } from './middleware/auth.js'
import { health } from './routes/health.js'
import { messages } from './routes/messages.js'

const app = new Hono()

// --- Global Middleware ---
app.use('*', logger())
app.use('*', cors())

// --- Public Routes (no auth) ---
app.route('/', health)

// --- Protected Routes (service key required) ---
app.use('/v1/*', authMiddleware)
app.route('/', messages)

// --- Start ---
const port = parseInt(process.env.PORT ?? '8081', 10)

serve({ fetch: app.fetch, port }, () => {
  console.log(`Router listening on :${port}`)
  if (!process.env.ROUTER_SERVICE_KEY) {
    console.warn('[auth] ROUTER_SERVICE_KEY not set — auth disabled (dev mode)')
  }
})
