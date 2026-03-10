'use client'

import * as React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface MarkdownContentProps {
  content: string
  className?: string
  /** Map of display names → profile URLs for clickable @mention pills */
  mentionLinks?: Record<string, string>
}

// ── @mention rendering ──────────────────────────────────────────────
const MENTION_RE = /@"([^"]+)"|@(\S+)/g

const MENTION_CLASSES = 'inline-flex items-center rounded bg-primary/15 px-1 py-0.5 text-primary font-medium hover:bg-primary/25 transition-colors cursor-default'
const MENTION_LINK_CLASSES = 'inline-flex items-center rounded bg-primary/15 px-1 py-0.5 text-primary font-medium hover:bg-primary/25 transition-colors cursor-pointer no-underline'

/** Split a text string into segments, wrapping @mentions in styled elements. */
function renderMentions(text: string, links?: Record<string, string>): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null

  MENTION_RE.lastIndex = 0
  while ((m = MENTION_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const name = m[1] ?? m[2]
    const href = links?.[name]
    if (href) {
      parts.push(
        <a key={m.index} href={href} className={MENTION_LINK_CLASSES}>
          @{name}
        </a>,
      )
    } else {
      parts.push(
        <span key={m.index} className={MENTION_CLASSES}>
          @{name}
        </span>,
      )
    }
    last = m.index + m[0].length
  }

  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/** Recursively walk React children, replacing string segments that contain @mentions. */
function processMentions(children: React.ReactNode, links?: Record<string, string>): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      if (!child.includes('@')) return child
      const parts = renderMentions(child, links)
      return parts.length === 1 ? parts[0] : <>{parts}</>
    }
    if (React.isValidElement(child) && (child.props as Record<string, unknown>).children) {
      return React.cloneElement(
        child,
        {},
        processMentions((child.props as Record<string, unknown>).children as React.ReactNode, links),
      )
    }
    return child
  })
}

function buildComponents(links?: Record<string, string>): Components {
  const m = (children: React.ReactNode) => processMentions(children, links)
  return {
    h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-1">{children}</h1>,
    h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-1">{children}</h2>,
    h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
    p: ({ children }) => <p className="mb-1 last:mb-0 leading-relaxed">{m(children)}</p>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{m(children)}</strong>,
    em: ({ children }) => <em className="italic">{m(children)}</em>,
    del: ({ children }) => <del className="line-through text-muted-foreground">{children}</del>,
    code: ({ className, children, ...props }) => {
      const isBlock = className?.startsWith('language-')
      if (isBlock) return <code className={className ?? ''} {...props}>{children}</code>
      return <code className="bg-muted/80 text-foreground/90 rounded px-1.5 py-0.5 text-[0.85em] font-mono">{children}</code>
    },
    pre: ({ children }) => <pre className="bg-muted/80 rounded-md p-3 my-2 overflow-x-auto text-[0.85em] font-mono leading-relaxed">{children}</pre>,
    ul: ({ children }) => <ul className="list-disc pl-6 mb-1 space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-6 mb-1 space-y-0.5">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{m(children)}</li>,
    blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-foreground/70 italic">{children}</blockquote>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>,
    hr: () => <hr className="border-muted my-3" />,
  }
}

const defaultComponents = buildComponents()

export function MarkdownContent({ content, className = '', mentionLinks }: MarkdownContentProps) {
  const components = mentionLinks ? buildComponents(mentionLinks) : defaultComponents
  return (
    <div className={className}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  )
}
