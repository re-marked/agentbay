/** Inbound message payload — what callers POST to the Router. */
export interface MessagePayload {
  channel_id: string
  sender_id: string
  content: string
  message_kind?: 'text' | 'tool_result' | 'status' | 'system' | 'file'
  mentions?: string[]
  parent_id?: string | null
  origin_id?: string | null
  depth?: number
  metadata?: Record<string, unknown>
}

/** Persisted message row from channel_messages. */
export interface MessageRow {
  id: string
  channel_id: string
  sender_id: string
  content: string
  message_kind: string
  mentions: string[]
  parent_id: string | null
  origin_id: string | null
  depth: number
  metadata: Record<string, unknown>
  edited_at: string | null
  deleted_at: string | null
  created_at: string
}
