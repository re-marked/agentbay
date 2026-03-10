'use client'

import * as React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface MarkdownContentProps {
  content: string
  className?: string
}

// ── @mention rendering ──────────────────────────────────────────────
const MENTION_RE = /@"([^"]+)"|@(\S+)/g

/** Split a text string into segments, wrapping @mentions in styled spans. */
function renderMentions(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null

  MENTION_RE.lastIndex = 0
  while ((m = MENTION_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const name = m[1] ?? m[2]
    parts.push(
      <span
        key={m.index}
        className="inline rounded bg-primary/15 px-1 py-0.5 text-primary font-medium hover:bg-primary/25 transition-colors"
      >
        @{name}
      </span>,
    )
    last = m.index + m[0].length
  }

  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/** Recursively walk React children, replacing string segments that contain @mentions. */
function processMentions(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      if (!child.includes('@')) return child
      const parts = renderMentions(child)
      return parts.length === 1 ? parts[0] : <>{parts}</>
    }
    if (React.isValidElement(child) && (child.props as Record<string, unknown>).children) {
      return React.cloneElement(
        child,
        {},
        processMentions((child.props as Record<string, unknown>).children as React.ReactNode),
      )
    }
    return child
  })
}

const components: Components = {
  // Headings
  h1: ({ children }) => (
    <h1 className="text-xl font-bold mt-4 mb-1">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold mt-3 mb-1">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>
  ),

  // Paragraphs
  p: ({ children }) => (
    <p className="mb-1 last:mb-0 leading-relaxed">{processMentions(children)}</p>
  ),

  // Inline
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{processMentions(children)}</strong>
  ),
  em: ({ children }) => <em className="italic">{processMentions(children)}</em>,
  del: ({ children }) => (
    <del className="line-through text-muted-foreground">{children}</del>
  ),

  // Code
  code: ({ className, children, ...props }) => {
    const isBlock = className?.startsWith('language-')
    if (isBlock) {
      return (
        <code className={className ?? ''} {...props}>
          {children}
        </code>
      )
    }
    return (
      <code className="bg-muted/80 text-foreground/90 rounded px-1.5 py-0.5 text-[0.85em] font-mono">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="bg-muted/80 rounded-md p-3 my-2 overflow-x-auto text-[0.85em] font-mono leading-relaxed">
      {children}
    </pre>
  ),

  // Lists
  ul: ({ children }) => (
    <ul className="list-disc pl-6 mb-1 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 mb-1 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{processMentions(children)}</li>,

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-foreground/70 italic">
      {children}
    </blockquote>
  ),

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {children}
    </a>
  ),

  // Horizontal rule
  hr: () => <hr className="border-muted my-3" />,
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  return (
    <div className={className}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  )
}
