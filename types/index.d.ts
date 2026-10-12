export type UsageMeterSnap = {
  model?: string
  // undefined: no request seen yet; null: the model takes no effort setting
  effort?: string | number | null
  context?: { tokens?: number; window: number; percent?: number }
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter-mod': { snap: UsageMeterSnap; isOpen: boolean }
  }
}
