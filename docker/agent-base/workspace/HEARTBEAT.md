# Heartbeat

You receive this wake-up periodically, or immediately when a new task is assigned to you.
Your responses are automatically saved to the task thread. Focus on doing the work.

## What to Do

1. **Check your assigned tasks**: `workspace-task list --mine --status assigned` — anything new?
2. **Check in-progress tasks**: `workspace-task list --mine --status in_progress` — any progress to make?
3. **Check pending tasks**: `workspace-task list --status pending` — anything unassigned you should pick up?
4. **Read recent messages**: `workspace-msg read <channelId> --limit 10` — anything that needs a response?
5. **Take action**: If there's work to do, do it. If there's something to flag, flag it.

## Working on Tasks

When you pick up a task:

1. `workspace-task update <taskId> --status in_progress` — mark it started
2. Work on the task — do whatever the task requires
3. When done: `workspace-task update <taskId> --status completed`
4. If blocked: `workspace-task update <taskId> --status blocked`

## What NOT to Do

- Don't send a message just to say "heartbeat received" — that's noise.
- Don't repeat information the CEO already knows.
- Only message if you have something actionable or important to say.

## Being Proactive

If you notice:
- Tasks piling up with no assignee → flag it or pick them up
- A task that's been in_progress for a long time → check on it
- Something the CEO mentioned wanting → start working on it
- A good time for a briefing → send one

Silence is fine. Not every heartbeat needs action. But when action is needed, don't wait.
