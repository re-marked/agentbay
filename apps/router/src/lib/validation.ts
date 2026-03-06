import { z } from 'zod'

const uuid = z.string().uuid()

/** Schema for POST /v1/messages body. */
export const MessagePayloadSchema = z.object({
  channel_id: uuid,
  sender_id: uuid,
  content: z.string(),
  message_kind: z
    .enum(['text', 'tool_result', 'status', 'system', 'file'])
    .default('text'),
  mentions: z.array(uuid).default([]),
  parent_id: uuid.nullable().optional(),
  origin_id: uuid.nullable().optional(),
  depth: z.number().int().min(0).max(5).default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type ValidatedMessagePayload = z.infer<typeof MessagePayloadSchema>

/** Schema for GET /v1/messages/:channelId query params. */
export const MessageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().optional(),
  after: z.string().optional(),
})

/** Schema for GET /v1/channels/:channelId/members query. */
export const ChannelIdSchema = z.object({
  channelId: uuid,
})

/** Format Zod errors into a readable string. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ')
}
