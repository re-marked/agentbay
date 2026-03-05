import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { health } from './routes/health.js'
import { messages } from './routes/messages.js'

const app = new Hono()

// --- Middleware ---
app.use('*', logger())
app.use('*', cors())

// --- Routes ---
app.route('/', health)
app.route('/', messages)

// --- Start ---
const port = parseInt(process.env.PORT ?? '8081', 10)

serve({ fetch: app.fetch, port }, () => {
  console.log(`Router listening on :${port}`)
})
