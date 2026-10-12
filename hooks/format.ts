// Claude's palette: clay orange for titles, blue for effort and notes, its warm grey for separators
export const COLORS = {
  title: '#D97757',
  effort: '#6A9BCC',
  muted: '#B0AEA5',
  empty: '#6B6A64',
  green: '#8BA870',
  yellow: '#E5C158',
  orange: '#EE8C3A',
  red: '#D4574E',
}

export const zone = (p: number) =>
  p >= 90 ? COLORS.red : p >= 75 ? COLORS.orange : p >= 50 ? COLORS.yellow : COLORS.green

// the same four zones as weather: how close the limit is, at a glance
export const weather = (p: number) =>
  p >= 90
    ? { icon: '⛈️', word: 'Stormy' }
    : p >= 75
      ? { icon: '🌧️', word: 'Rainy' }
      : p >= 50
        ? { icon: '⛅', word: 'Cloudy' }
        : { icon: '☀️', word: 'Sunny' }

// filled cells of a bar `total` wide: any use at all shows one cell; NaN counts as 0, past 100 as full
export function cells(percent: number, total: number) {
  const p = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0
  return p > 0 ? Math.max(1, Math.round((p / 100) * total)) : 0
}

// claude-sonnet-5-5 -> Sonnet 5.5; claude-opus-4-1-20250805[1m] -> Opus 4.1 1M; anything else unchanged
export function modelName(id: string) {
  const m = /^claude-([a-z]+)-(\d+(?:-\d{1,2})*)(?:-\d{8})?(?:\[(\w+)\])?$/.exec(id)
  if (!m) return id
  const family = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1)
  return `${family} ${m[2]!.replace(/-/g, '.')}${m[3] ? ' ' + m[3].toUpperCase() : ''}`
}

const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

export function effortView(effort: string | number) {
  const n = LEVELS.indexOf(String(effort)) + 1
  return {
    label: String(effort),
    dots: n > 0 ? '●'.repeat(n) + '○'.repeat(LEVELS.length - n) : '',
  }
}

export function tokens(n: number) {
  const k = n / 1000
  if (k < 1) return String(n)
  if (k < 1000) return `${Math.round(k)}k`
  return `${+(k / 1000).toFixed(1)}M`
}

export function countdown(iso: string | undefined, now: number) {
  const ms = iso ? Date.parse(iso) - now : NaN
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h`
  if (h > 0) return `${h}h ${m % 60}m`
  return `${Math.max(1, m)}m`
}

export function ago(ms: number) {
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ${m % 60}m ago` : `${Math.floor(h / 24)}d ago`
}

// Anthropic's plan-usage reply ({ five_hour: { utilization, resets_at }, seven_day: {...} }) in the
// shape the session reports its limits in; anything it does not recognise is left out
export function parseUsage(body: unknown) {
  const out: { kind: string; percentUsed: number; resetsAt?: string }[] = []
  if (!body || typeof body !== 'object') return out
  for (const kind of ['five_hour', 'seven_day']) {
    const w = (body as Record<string, { utilization?: unknown; resets_at?: unknown } | null>)[kind]
    if (typeof w?.utilization === 'number' && Number.isFinite(w.utilization)) {
      out.push({
        kind,
        percentUsed: Math.round(w.utilization * 10) / 10,
        resetsAt: typeof w.resets_at === 'string' ? w.resets_at : undefined,
      })
    }
  }
  return out
}

// one muted line saying where the limits came from and how old they are, so a stale band explains itself
export function limitsNote(source: 'live' | 'session' | undefined, error: string | undefined, ageMs: number | undefined) {
  const age = ageMs === undefined ? '' : ` · ${ago(ageMs)}`
  if (source === 'live' && !error) return `limits live${age}`
  return `limits from last reply${error ? ` (${error})` : ''}${age}`
}

const NAMES: Record<string, [string, string]> = {
  five_hour: ['5h', '5-hour'],
  seven_day: ['7d', '7-day'],
  spend_limit: ['spend', 'Spend'],
}
export const shortKind = (kind: string) => NAMES[kind]?.[0] ?? kind
export const longKind = (kind: string) => NAMES[kind]?.[1] ?? kind

// rough US prices in USD, ascending: what the session's cost is "worth"
const THINGS: [price: number, one: string, many: string][] = [
  [0.25, 'gumball 🍬', 'gumballs 🍬'],
  [1.5, 'candy bar 🍫', 'candy bars 🍫'],
  [3.5, "order of McDonald's fries 🍟", "orders of McDonald's fries 🍟"],
  [4.5, 'latte ☕', 'lattes ☕'],
  [5.99, 'Big Mac 🍔', 'Big Macs 🍔'],
  [10, 'burrito 🌯', 'burritos 🌯'],
  [15, 'movie ticket 🎬', 'movie tickets 🎬'],
  [20, 'large pizza 🍕', 'large pizzas 🍕'],
  [40, 'sushi dinner 🍣', 'sushi dinners 🍣'],
  [75, 'dinner for two 🍝', 'dinners for two 🍝'],
  [150, 'concert ticket 🎤', 'concert tickets 🎤'],
]

// "≈ 1.1 lattes ☕": the biggest thing the cost covers, counted to one decimal (whole past 10)
export function costEquiv(usd: number) {
  if (!Number.isFinite(usd) || usd <= 0) return ''
  const thing = [...THINGS].reverse().find(t => usd >= t[0])
  if (!thing) return `≈ less than a ${THINGS[0]![1]}`
  const n = usd / thing[0]
  const count = n < 10 ? String(+n.toFixed(1)) : String(Math.round(n))
  return `≈ ${count} ${count === '1' ? thing[1] : thing[2]}`
}
