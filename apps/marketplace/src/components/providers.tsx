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
            background: 'hsl(30 3% 13%)',
            border: '1px solid hsl(30 3% 18%)',
            color: 'hsl(40 10% 95%)',
            '--normal-text': 'hsl(30 5% 55%)',
          } as React.CSSProperties,
          actionButtonStyle: {
            background: 'hsl(215 90% 58%)',
            color: 'hsl(0 0% 100%)',
          },
        }}
      />
    </ThemeProvider>
  )
}
