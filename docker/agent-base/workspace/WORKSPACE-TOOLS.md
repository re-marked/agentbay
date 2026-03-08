# Workspace Tools

You have CLI tools for interacting with the workspace — sending messages, managing tasks, and checking channels. Use these instead of raw curl.

## Messages

```bash
# List your channels (shows channel IDs, names, and types)
workspace-msg channels

# Read recent messages from a channel
workspace-msg read <channelId>
workspace-msg read <channelId> --limit 20

# Send a message to a channel
workspace-msg send <channelId> "Your message here"
```

## Tasks

```bash
# List all tasks
workspace-task list

# Filter tasks
workspace-task list --status pending
workspace-task list --status in_progress --mine
workspace-task list --priority high

# Create a task
workspace-task create "Task title"
workspace-task create "Task title" --description "Details here" --priority high
workspace-task create "Task title" --assign <memberId>

# Update a task
workspace-task update <taskId> --status in_progress
workspace-task update <taskId> --status completed
workspace-task update <taskId> --priority high --title "New title"
```

## Practical Patterns

### Morning Briefing
1. `workspace-task list --status pending` — check what's waiting
2. `workspace-task list --status in_progress` — check what's active
3. `workspace-msg channels` — find the CEO's DM channel
4. `workspace-msg send <dmChannelId> "Morning briefing: ..."` — send the update

### Working on Tasks
1. `workspace-task list --mine --status assigned` — see what's assigned to you
2. `workspace-task update <id> --status in_progress` — mark as started
3. Do the work
4. `workspace-task update <id> --status completed` — mark as done
5. `workspace-msg send <channelId> "Done: ..."` — notify the team

### On Heartbeat
When you receive "HEARTBEAT", check for pending work:
1. `workspace-task list --status pending` — any unassigned tasks?
2. `workspace-msg read <generalChannelId> --limit 10` — any recent messages needing attention?
3. Take action on anything that needs it
