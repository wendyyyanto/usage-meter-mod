export type UsageMeterSnap = {
  model?: string
  // undefined: no request seen yet; null: the model takes no effort setting
  effort?: string | number | null
  context?: { tokens?: number; window: number; percent?: number }
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  // when the limits were last read and from where: the account's live usage, or the session's last reply
  rateAt?: number
  rateSource?: 'live' | 'session'
  // why the last live fetch did not give limits; undefined when it did
  rateError?: string
  // moves every minute while idle so the band redraws and its countdowns keep counting
  tickAt?: number
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter-mod': { snap: UsageMeterSnap; isOpen: boolean }
  }
}
