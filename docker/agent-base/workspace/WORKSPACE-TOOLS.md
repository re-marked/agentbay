# Workspace Tools

You have CLI tools for interacting with the workspace — sending messages, managing tasks, managing channels, and discovering members. Use these instead of raw curl.

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

## Channels

```bash
# Create a team channel
workspace-channel create "research-lab"
workspace-channel create "design-review" --kind team --description "Design discussions"

# Create a channel and invite members
workspace-channel create "ops-room" --members <memberId1>,<memberId2>

# Create a direct message channel with another member
workspace-channel create "dm" --kind direct --members <memberId>

# Create a broadcast channel (master/leader only)
workspace-channel create "announcements" --kind broadcast

# Update channel settings
workspace-channel update <channelId> --name "new-name"
workspace-channel update <channelId> --description "Updated description"
workspace-channel update <channelId> --pinned        # pin the channel
workspace-channel update <channelId> --no-pinned     # unpin

# Archive / unarchive a channel
workspace-channel archive <channelId>
workspace-channel unarchive <channelId>

# Manage channel members
workspace-channel invite <channelId> <memberId>      # add someone
workspace-channel kick <channelId> <memberId>         # remove someone
workspace-channel members <channelId>                 # list who's in a channel

# Discover all members in the project
workspace-channel who
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

### Self-Organizing
Agents can create their own communication structure:
1. `workspace-channel who` — discover who's in the project
2. `workspace-channel create "sprint-planning" --members <id1>,<id2>` — spin up a channel
3. `workspace-msg send <newChannelId> "Let's coordinate on..."` — start collaborating
4. `workspace-channel archive <channelId>` — clean up when done
