import { createServiceClient } from "@agentbay/db/server"

const DEMO_SKILLS = [
  {
    name: "Web Search",
    slug: "web-search",
    description: "Search the web and return summarized results with source links",
    emoji: "\u{1F50D}",
    category: "research",
    source: "openclaw",
    version: "2.1.0",
    author: "OpenClaw",
    tags: ["search", "web", "research"],
    homepage: "https://clawhub.dev/skills/web-search",
    requires: { tools: ["browser"], env: ["SEARCH_API_KEY"] },
    skill_content: `---
name: web-search
version: 2.1.0
description: Search the web and return summarized results
tools: [browser]
---

# Web Search

Search the web for information and return concise, sourced summaries.

## Instructions

1. Use the browser tool to search for the user's query
2. Visit the top 3-5 results
3. Summarize findings with inline citations
4. Always include source URLs at the bottom`,
  },
  {
    name: "Code Review",
    slug: "code-review",
    description: "Analyze code for bugs, security issues, and style improvements",
    emoji: "\u{1F50E}",
    category: "coding",
    source: "openclaw",
    version: "1.4.0",
    author: "OpenClaw",
    tags: ["code-review", "security", "best-practices"],
    homepage: "https://clawhub.dev/skills/code-review",
    requires: { tools: ["filesystem"] },
    skill_content: `---
name: code-review
version: 1.4.0
description: Review code for bugs, security, and style
tools: [filesystem]
---

# Code Review

Perform thorough code reviews focusing on correctness, security, and maintainability.

## Checklist

- Logic errors and edge cases
- OWASP top 10 vulnerabilities
- Type safety and null handling
- Naming conventions and readability
- Performance bottlenecks`,
  },
  {
    name: "Git Operations",
    slug: "git-ops",
    description: "Stage, commit, branch, and manage git repositories with natural language",
    emoji: "\u{1F33F}",
    category: "devops",
    source: "openclaw",
    version: "1.2.0",
    author: "OpenClaw",
    tags: ["git", "version-control", "devops"],
    homepage: "https://clawhub.dev/skills/git-ops",
    requires: { binaries: ["git"] },
    skill_content: `---
name: git-ops
version: 1.2.0
description: Git operations via natural language
binaries: [git]
---

# Git Operations

Manage git repositories using natural language commands.

## Capabilities

- Create branches, commits, and tags
- Interactive rebase and merge conflict resolution
- Cherry-pick and bisect workflows
- Conventional commit message generation`,
  },
  {
    name: "SQL Query Builder",
    slug: "sql-query-builder",
    description: "Generate and optimize SQL queries from natural language descriptions",
    emoji: "\u{1F5C3}\uFE0F",
    category: "data",
    source: "community",
    version: "1.0.0",
    author: "DataCraft",
    tags: ["sql", "database", "query"],
    requires: {},
    skill_content: `---
name: sql-query-builder
version: 1.0.0
description: Generate SQL queries from natural language
---

# SQL Query Builder

Translate natural language into optimized SQL queries.

## Supported Dialects

- PostgreSQL
- MySQL
- SQLite
- SQL Server

## Features

- Complex JOINs and subqueries
- Window functions and CTEs
- Query optimization suggestions
- Index recommendations`,
  },
  {
    name: "Summarize",
    slug: "summarize",
    description: "Condense long documents, articles, or conversations into key points",
    emoji: "\u{1F4DD}",
    category: "productivity",
    source: "openclaw",
    version: "2.0.0",
    author: "OpenClaw",
    tags: ["summarization", "tldr", "notes"],
    homepage: "https://clawhub.dev/skills/summarize",
    requires: {},
    skill_content: `---
name: summarize
version: 2.0.0
description: Summarize documents and conversations
---

# Summarize

Create concise summaries of long-form content.

## Output Formats

- **Key Points**: Bullet list of main takeaways
- **Executive Summary**: 2-3 paragraph overview
- **TLDR**: One-sentence summary
- **Action Items**: Extracted tasks and deadlines`,
  },
  {
    name: "Email Drafter",
    slug: "email-drafter",
    description: "Compose professional emails with the right tone for any context",
    emoji: "\u{1F4E7}",
    category: "communication",
    source: "community",
    version: "1.1.0",
    author: "CommStack",
    tags: ["email", "writing", "professional"],
    requires: {},
    skill_content: `---
name: email-drafter
version: 1.1.0
description: Draft professional emails
---

# Email Drafter

Compose context-appropriate emails for any situation.

## Tone Options

- Professional / Formal
- Friendly / Casual
- Urgent / Action-required
- Follow-up / Reminder

## Features

- Subject line generation
- CC/BCC suggestions
- Thread-aware replies`,
  },
  {
    name: "Data Analyzer",
    slug: "data-analyzer",
    description: "Analyze datasets, find patterns, and generate statistical insights",
    emoji: "\u{1F4CA}",
    category: "data",
    source: "openclaw",
    version: "1.3.0",
    author: "OpenClaw",
    tags: ["analytics", "statistics", "visualization"],
    homepage: "https://clawhub.dev/skills/data-analyzer",
    requires: { tools: ["filesystem"] },
    skill_content: `---
name: data-analyzer
version: 1.3.0
description: Statistical analysis and pattern detection
tools: [filesystem]
---

# Data Analyzer

Analyze structured data to find patterns and generate insights.

## Capabilities

- Descriptive statistics (mean, median, std dev)
- Correlation and regression analysis
- Outlier detection
- Trend identification
- Chart/visualization recommendations`,
  },
  {
    name: "CSV Parser",
    slug: "csv-parser",
    description: "Parse, transform, and clean CSV files with natural language commands",
    emoji: "\u{1F4C4}",
    category: "data",
    source: "community",
    version: "1.0.0",
    author: "DataCraft",
    tags: ["csv", "data-cleaning", "etl"],
    requires: { tools: ["filesystem"] },
    skill_content: `---
name: csv-parser
version: 1.0.0
description: Parse and transform CSV files
tools: [filesystem]
---

# CSV Parser

Clean, transform, and analyze CSV files.

## Operations

- Filter rows by conditions
- Rename and reorder columns
- Type conversion and formatting
- Deduplication
- Merge multiple CSVs`,
  },
  {
    name: "Diagram Generator",
    slug: "diagram-generator",
    description: "Create Mermaid diagrams from descriptions — flowcharts, ERDs, sequences",
    emoji: "\u{1F4D0}",
    category: "creative",
    source: "openclaw",
    version: "1.5.0",
    author: "OpenClaw",
    tags: ["diagrams", "mermaid", "visualization"],
    homepage: "https://clawhub.dev/skills/diagram-generator",
    requires: {},
    skill_content: `---
name: diagram-generator
version: 1.5.0
description: Generate Mermaid diagrams from descriptions
---

# Diagram Generator

Create visual diagrams from natural language descriptions.

## Diagram Types

- Flowcharts
- Sequence diagrams
- Entity-Relationship diagrams
- Class diagrams
- Gantt charts
- State diagrams`,
  },
  {
    name: "Unit Test Writer",
    slug: "unit-test-writer",
    description: "Generate comprehensive unit tests for functions and modules",
    emoji: "\u{1F9EA}",
    category: "coding",
    source: "openclaw",
    version: "1.2.0",
    author: "OpenClaw",
    tags: ["testing", "tdd", "quality"],
    homepage: "https://clawhub.dev/skills/unit-test-writer",
    requires: { tools: ["filesystem"] },
    skill_content: `---
name: unit-test-writer
version: 1.2.0
description: Generate unit tests for code
tools: [filesystem]
---

# Unit Test Writer

Generate comprehensive unit tests with edge case coverage.

## Supported Frameworks

- Jest / Vitest (TypeScript/JavaScript)
- pytest (Python)
- Go testing
- Rust #[test]

## Features

- Happy path + edge case coverage
- Mock/stub generation
- Parameterized test tables
- Coverage gap detection`,
  },
  {
    name: "Docker Helper",
    slug: "docker-helper",
    description: "Generate Dockerfiles, compose configs, and debug container issues",
    emoji: "\u{1F433}",
    category: "devops",
    source: "community",
    version: "1.0.0",
    author: "InfraKit",
    tags: ["docker", "containers", "devops"],
    requires: { binaries: ["docker"] },
    skill_content: `---
name: docker-helper
version: 1.0.0
description: Docker configuration and debugging
binaries: [docker]
---

# Docker Helper

Generate and debug Docker configurations.

## Capabilities

- Dockerfile generation with best practices
- Multi-stage build optimization
- Docker Compose service orchestration
- Container debugging (logs, exec, inspect)
- Image size optimization`,
  },
  {
    name: "Slack Notifier",
    slug: "slack-notifier",
    description: "Send formatted messages and alerts to Slack channels via webhooks",
    emoji: "\u{1F4AC}",
    category: "communication",
    source: "community",
    version: "1.0.0",
    author: "CommStack",
    tags: ["slack", "notifications", "webhooks"],
    requires: { env: ["SLACK_WEBHOOK_URL"] },
    skill_content: `---
name: slack-notifier
version: 1.0.0
description: Send messages to Slack channels
env: [SLACK_WEBHOOK_URL]
---

# Slack Notifier

Send rich formatted messages to Slack channels.

## Message Types

- Plain text notifications
- Block Kit formatted messages
- Attachment cards with fields
- Thread replies`,
  },
  {
    name: "Translate",
    slug: "translate",
    description: "Translate text between 50+ languages while preserving tone and context",
    emoji: "\u{1F30D}",
    category: "communication",
    source: "openclaw",
    version: "1.1.0",
    author: "OpenClaw",
    tags: ["translation", "i18n", "languages"],
    homepage: "https://clawhub.dev/skills/translate",
    requires: {},
    skill_content: `---
name: translate
version: 1.1.0
description: Multi-language translation
---

# Translate

Translate text between 50+ languages with context preservation.

## Features

- Tone-aware translation (formal, casual, technical)
- Idiom and cultural adaptation
- Batch translation for i18n files
- Glossary support for domain terms`,
  },
  {
    name: "API Tester",
    slug: "api-tester",
    description: "Send HTTP requests, inspect responses, and build test suites for APIs",
    emoji: "\u{1F6F0}\uFE0F",
    category: "web",
    source: "community",
    version: "1.0.0",
    author: "WebKit",
    tags: ["api", "http", "testing"],
    requires: {},
    skill_content: `---
name: api-tester
version: 1.0.0
description: Test and debug HTTP APIs
---

# API Tester

Send HTTP requests and validate API responses.

## Features

- All HTTP methods (GET, POST, PUT, DELETE, PATCH)
- Header and auth configuration
- Response assertion checks
- Collection/suite management
- Environment variable interpolation`,
  },
  {
    name: "Regex Builder",
    slug: "regex-builder",
    description: "Build and test regular expressions with plain English explanations",
    emoji: "\u{1F3AF}",
    category: "coding",
    source: "community",
    version: "1.0.0",
    author: "DevTools",
    tags: ["regex", "pattern-matching", "validation"],
    requires: {},
    skill_content: `---
name: regex-builder
version: 1.0.0
description: Build regex patterns from descriptions
---

# Regex Builder

Create and test regular expressions from natural language.

## Features

- Pattern generation from descriptions
- Step-by-step explanation of patterns
- Test against sample strings
- Common pattern library (email, URL, phone, etc.)
- Flavor support (PCRE, JS, Python, Go)`,
  },
  {
    name: "Markdown Formatter",
    slug: "markdown-formatter",
    description: "Format, lint, and beautify Markdown documents with consistent style",
    emoji: "\u{1F4DD}",
    category: "productivity",
    source: "community",
    version: "1.0.0",
    author: "DocTools",
    tags: ["markdown", "formatting", "documentation"],
    requires: {},
    skill_content: `---
name: markdown-formatter
version: 1.0.0
description: Format and beautify Markdown
---

# Markdown Formatter

Ensure consistent Markdown formatting across documents.

## Rules

- Heading hierarchy enforcement
- Consistent list markers
- Table alignment
- Link validation
- Code block language tags`,
  },
  {
    name: "JSON Transformer",
    slug: "json-transformer",
    description: "Transform, query, and validate JSON using jq-like expressions",
    emoji: "\u{1F4E6}",
    category: "data",
    source: "community",
    version: "1.0.0",
    author: "DataCraft",
    tags: ["json", "jq", "data-transform"],
    requires: {},
    skill_content: `---
name: json-transformer
version: 1.0.0
description: Transform and query JSON data
---

# JSON Transformer

Query and reshape JSON using natural language or jq syntax.

## Operations

- Filter and select fields
- Flatten nested structures
- Array aggregations
- Schema validation
- Format conversion (JSON ↔ YAML ↔ TOML)`,
  },
  {
    name: "Cron Scheduler",
    slug: "cron-scheduler",
    description: "Generate and explain cron expressions from natural language schedules",
    emoji: "\u23F0",
    category: "devops",
    source: "community",
    version: "1.0.0",
    author: "InfraKit",
    tags: ["cron", "scheduling", "automation"],
    requires: {},
    skill_content: `---
name: cron-scheduler
version: 1.0.0
description: Generate cron expressions from descriptions
---

# Cron Scheduler

Create and explain cron expressions from plain English.

## Features

- Natural language → cron conversion
- Cron → natural language explanation
- Next N execution times preview
- Timezone-aware scheduling
- Common schedule templates`,
  },
  {
    name: "Cloudflare Workers",
    slug: "cloudflare-workers",
    description: "Scaffold, deploy, and debug Cloudflare Workers and Pages projects",
    emoji: "\u2601\uFE0F",
    category: "web",
    source: "cloudflare",
    version: "1.3.0",
    author: "Cloudflare",
    tags: ["cloudflare", "workers", "edge"],
    homepage: "https://developers.cloudflare.com/workers/",
    requires: { binaries: ["wrangler"] },
    skill_content: `---
name: cloudflare-workers
version: 1.3.0
description: Build and deploy Cloudflare Workers
binaries: [wrangler]
---

# Cloudflare Workers

Build, test, and deploy edge functions on Cloudflare.

## Capabilities

- Worker scaffold with TypeScript
- KV, D1, R2 binding configuration
- Wrangler dev/deploy commands
- Route and domain management
- Debugging with wrangler tail`,
  },
  {
    name: "Vercel Deploy",
    slug: "vercel-deploy",
    description: "Deploy and manage Vercel projects, domains, and environment variables",
    emoji: "\u25B2",
    category: "web",
    source: "vercel",
    version: "1.1.0",
    author: "Vercel",
    tags: ["vercel", "deployment", "hosting"],
    homepage: "https://vercel.com/docs",
    requires: { binaries: ["vercel"] },
    skill_content: `---
name: vercel-deploy
version: 1.1.0
description: Deploy to Vercel
binaries: [vercel]
---

# Vercel Deploy

Deploy and manage Vercel projects.

## Capabilities

- Project initialization and linking
- Preview and production deployments
- Environment variable management
- Domain configuration
- Build log inspection`,
  },
  {
    name: "Screenshot Capture",
    slug: "screenshot-capture",
    description: "Take screenshots of web pages and UI components for review",
    emoji: "\u{1F4F8}",
    category: "web",
    source: "openclaw",
    version: "1.0.0",
    author: "OpenClaw",
    tags: ["screenshot", "browser", "testing"],
    homepage: "https://clawhub.dev/skills/screenshot",
    requires: { tools: ["browser"] },
    skill_content: `---
name: screenshot-capture
version: 1.0.0
description: Capture web page screenshots
tools: [browser]
---

# Screenshot Capture

Take screenshots of web pages for visual review.

## Features

- Full page or viewport capture
- Element-specific screenshots
- Mobile/tablet viewport emulation
- Before/after comparison`,
  },
  {
    name: "Changelog Generator",
    slug: "changelog-generator",
    description: "Generate changelogs from git history following Keep a Changelog format",
    emoji: "\u{1F4CB}",
    category: "devops",
    source: "community",
    version: "1.0.0",
    author: "DevTools",
    tags: ["changelog", "release", "documentation"],
    requires: { binaries: ["git"] },
    skill_content: `---
name: changelog-generator
version: 1.0.0
description: Generate changelogs from git commits
binaries: [git]
---

# Changelog Generator

Create formatted changelogs from git history.

## Format

Follows [Keep a Changelog](https://keepachangelog.com/) convention:
- Added / Changed / Deprecated / Removed / Fixed / Security
- Semantic versioning
- Commit categorization via conventional commits`,
  },
  {
    name: "Color Palette",
    slug: "color-palette",
    description: "Generate harmonious color palettes for design systems and themes",
    emoji: "\u{1F3A8}",
    category: "creative",
    source: "community",
    version: "1.0.0",
    author: "DesignKit",
    tags: ["colors", "design", "theming"],
    requires: {},
    skill_content: `---
name: color-palette
version: 1.0.0
description: Generate color palettes
---

# Color Palette

Create harmonious color palettes for any project.

## Modes

- Complementary, analogous, triadic, split-complementary
- From brand color → full palette
- Accessible contrast checking (WCAG AA/AAA)
- CSS variable and Tailwind config output
- Dark mode variant generation`,
  },
  {
    name: "PR Reviewer",
    slug: "pr-reviewer",
    description: "Review pull requests for code quality, test coverage, and documentation",
    emoji: "\u{1F4CB}",
    category: "coding",
    source: "openclaw",
    version: "1.1.0",
    author: "OpenClaw",
    tags: ["pull-request", "review", "github"],
    homepage: "https://clawhub.dev/skills/pr-reviewer",
    requires: { binaries: ["git", "gh"] },
    skill_content: `---
name: pr-reviewer
version: 1.1.0
description: Automated pull request reviews
binaries: [git, gh]
---

# PR Reviewer

Review pull requests with structured feedback.

## Review Checklist

- Code correctness and logic
- Test coverage for changes
- Documentation updates
- Breaking change detection
- Performance impact assessment`,
  },
  {
    name: "Meeting Notes",
    slug: "meeting-notes",
    description: "Structure meeting transcripts into action items, decisions, and summaries",
    emoji: "\u{1F4CB}",
    category: "productivity",
    source: "community",
    version: "1.0.0",
    author: "ProdKit",
    tags: ["meetings", "notes", "action-items"],
    requires: {},
    skill_content: `---
name: meeting-notes
version: 1.0.0
description: Structure meeting notes
---

# Meeting Notes

Transform raw meeting transcripts into structured notes.

## Output Sections

- **Summary**: 2-3 sentence overview
- **Key Decisions**: What was decided and by whom
- **Action Items**: Task, owner, deadline
- **Open Questions**: Unresolved topics for follow-up
- **Attendees**: Who was present`,
  },
]

/**
 * Seeds demo skills if the skills table is empty.
 * Uses service client to bypass RLS. Safe to call on every page load —
 * only inserts when count is 0.
 */
export async function seedDemoSkillsIfEmpty() {
  if (process.env.NODE_ENV !== "development") return

  const service = createServiceClient()

  const { count, error: countError } = await service
    .from("skills")
    .select("*", { count: "exact", head: true })
    .eq("status", "published")

  if (countError) return
  if (count !== null && count >= DEMO_SKILLS.length) return

  const skills = DEMO_SKILLS.map((s) => ({
    ...s,
    status: "published" as const,
    total_installs: Math.floor(Math.random() * 300) + 5,
  }))

  await service.from("skills").upsert(skills, { onConflict: "slug" })
}
