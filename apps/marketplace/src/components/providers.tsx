'use client'

import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" disableTransitionOnChange>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'oklch(24.91% 0.0024 67.72)',
            border: '1px solid oklch(30.17% 0.0032 67.71)',
            color: 'oklch(96.34% 0.0024 84.56)',
            '--normal-text': 'oklch(64.41% 0.0109 67.63)',
          } as React.CSSProperties,
          actionButtonStyle: {
            background: 'oklch(62.35% 0.1857 257.79)',
            color: 'oklch(100% 0 0)',
          },
        }}
      />
    </ThemeProvider>
  )
}
