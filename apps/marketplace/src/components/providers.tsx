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
          className: 'border-border bg-card text-card-foreground',
        }}
      />
    </ThemeProvider>
  )
}
