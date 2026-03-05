import { Hono } from 'hono'

const health = new Hono()

health.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'router',
    machine: process.env.FLY_MACHINE_ID ?? null,
  })
})

export { health }
