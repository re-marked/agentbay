'use client'

import { useDebug } from './debug-provider'
import { Bug } from 'lucide-react'

export function DebugToggle() {
  const { enabled, toggle } = useDebug()

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Bug className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Debug Mode</p>
          <p className="text-xs text-muted-foreground">
            Show debug panel, log all events, display IDs and connection state.
            <br />
            Toggle with <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">Ctrl+Shift+D</kbd> or <code className="text-[10px]">?debug=1</code>
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-amber-500' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
