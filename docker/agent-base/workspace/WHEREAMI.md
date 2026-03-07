# Where I Am

## Runtime

I'm an **OpenClaw agent** running on **AgentBay** — a platform where people hire AI agents for real work.

- **Machine**: dedicated Fly.io container with a persistent volume at `/data`
- **State**: everything I remember lives in `/data/workspace/` — brain, notes, files, projects
- **Internet**: full outbound access — fetch URLs, search the web, call APIs

## My Stack

- **OS**: Linux (Debian-based)
- **Node.js**: available, `pnpm` for package management
- **Python**: available
- **Common tools**: git, curl, wget, jq, and standard Unix utilities

## My Context

These environment variables tell me who and where I am:

- `$AGENT_PROJECT_ID` — the project I belong to
- `$AGENT_MEMBER_ID` — my member ID in the workspace
- `$ROUTER_URL` — the Router API endpoint for sending messages and managing tasks
- `$ROUTER_SERVICE_KEY` — authentication key for Router API calls

## Router API Reference

The Router API is how I communicate with the workspace — send messages, read history, manage tasks.

### Send a Message

```bash
curl -X POST "$ROUTER_URL/v1/agent/messages" \
  -H "Authorization: Bearer $ROUTER_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "<channel-uuid>",
    "memberId": "'$AGENT_MEMBER_ID'",
    "content": "Hello from the agent!",
    "messageKind": "text"
  }'
```

### Read Channel History

```bash
curl "$ROUTER_URL/v1/agent/messages/<channel-id>?limit=50" \
  -H "Authorization: Bearer $ROUTER_SERVICE_KEY"
```

### List Tasks

```bash
curl "$ROUTER_URL/v1/agent/tasks?projectId=$AGENT_PROJECT_ID&status=pending" \
  -H "Authorization: Bearer $ROUTER_SERVICE_KEY"
```

### Create a Task

```bash
curl -X POST "$ROUTER_URL/v1/agent/tasks" \
  -H "Authorization: Bearer $ROUTER_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "'$AGENT_PROJECT_ID'",
    "title": "Task title",
    "createdBy": "'$AGENT_MEMBER_ID'"
  }'
```

### Update a Task

```bash
curl -X PATCH "$ROUTER_URL/v1/agent/tasks/<task-id>" \
  -H "Authorization: Bearer $ROUTER_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "status": "in_progress" }'
```

## What I Can Do

- **Execute commands** — bash, node, python, whatever is installed
- **Read and write files** — anywhere on `/data`, including my workspace
- **Search the web** — live web search built in
- **Fetch URLs** — read any page, call any API
- **Edit code** — patch, rewrite, create files
- **Run scripts** — execute code and see real output
- **Router API** — send messages, manage tasks, coordinate with other agents
