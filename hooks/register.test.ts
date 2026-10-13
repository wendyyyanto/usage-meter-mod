import { test, expect, mock } from 'claude-code/testing'

import { COLORS, hhmm } from './format'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 100,
  scroll: { top: 0, bodyRows: 11, totalRows: 6 },
  view: {},
} as never

const FRESH = { startedAt: 0, context: { window: 200000 }, rateLimits: [], cost: { usd: 0 } }
const WORKING = {
  context: { tokens: 84000, window: 200000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 31, resetsAt: '2026-10-12T11:40:00Z' },
    { kind: 'seven_day', percentUsed: 78, resetsAt: '2026-10-14T23:00:00Z' },
  ],
  cost: { usd: 1.23 },
  changed: ['context', 'rateLimits', 'cost'],
} as never

const START = { cwd: '/x', surface: 'terminal', isInteractive: true } as never
const SURFACES = ['terminal', 'desktop'] as const
const STEP = { turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 }

// what the account's plan-usage endpoint answers: body null makes it fail (503), status 429 rate-limits it
const LIVE = { body: null as object | null, status: 0, headers: {} as Record<string, string>, calls: 0 }
const live = (five: number, fiveResets: string, seven: number, sevenResets: string) => ({
  five_hour: { utilization: five, resets_at: fiveResets, limit_dollars: null },
  seven_day: { utilization: seven, resets_at: sevenResets, limit_dollars: null },
})
const NOW = Date.parse('2026-10-12T10:00:00Z') // where the mock clock starts

const bottom = (
  on: any,
  model: string,
  opts: { live?: object | null; usage?: object; auth?: 'none' | 'api-key'; settings?: object | 'fail' } = {},
) => {
  Object.assign(LIVE, { body: opts.live ?? null, status: 0, headers: {}, calls: 0 })
  on('session.usage', () => ({ value: opts.usage ?? FRESH }))
  on('session.model', () => ({ value: model }))
  on('settings.read', () => (opts.settings === 'fail' ? { deny: 'no settings' } : { value: opts.settings ?? {} }))
  on('session.authorize', () => ({ value: opts.auth === 'none' ? null : { handle: 'h', kind: opts.auth ?? 'bearer' } }))
  on('http.fetch', () => {
    LIVE.calls += 1
    if (LIVE.status === 429) return { value: { status: 429, ok: false, headers: LIVE.headers, text: '' } }
    return {
      value: LIVE.body
        ? { status: 200, ok: true, headers: {}, text: JSON.stringify(LIVE.body) }
        : { status: 503, ok: false, headers: {}, text: '' },
    }
  })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.measure', (_: unknown, e: any) => ({ changed: e.changed }))
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  on('turn.step', async function* (_: unknown, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' } as never
  })
  return mock.clock(on, { now: NOW })
}

// a turn begins: the session is busy until it finishes
const begin = ($: any) => $.turn.start({ text: 'go', turnId: 't' } as never)

// "a conversation finished": a turn of the main loop (or of a subagent) ends
const finish = ($: any, agentId?: string) =>
  $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', agentId } as never)

const flat = (n: any): string => (typeof n === 'string' ? n : (n?.children ?? []).map(flat).join(''))
const all = (n: any, test: (x: any) => boolean): any[] =>
  typeof n === 'string' || !n ? [] : [...(test(n) ? [n] : []), ...(n.children ?? []).flatMap((c: any) => all(c, test))]
const mount = ($: any, surface: 'terminal' | 'desktop' = 'terminal', props: object = PROPS) =>
  $.ui.mount({ plugin: 'usage-meter-mod', surface, component: 'AbovePrompt', props })
// the expanded band: one child per line (model|effort, context, 5-hour, 7-day, cost, then the limits note)
const lines = async (ui: any) => ((await ui.drawn()).children ?? []) as any[]

test('a new session shows the band at once, with its starting figures', async ($, on) => {
  const clock = bottom(on, 'claude-opus-5-5', { settings: { effortLevel: 'high' } })
  await $.session.start(START)
  await clock.advance(0) // the first fetch fails (503): no limits yet

  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect((await ui.find({ key: 'toggle' }))?.text).toContain('Hide')
    const rows = (await lines(ui)).map(flat)
    expect(rows.length).toBe(6) // the last row is the limits note
    expect(rows[0]).toMatch(/Model.*Opus 5\.5.*Effort.*●●●○○.*high/) // the effort it is set to, before any request
    expect(rows[1]).toMatch(/Context.*0%.*Sunny.*0 \/ 200k/) // context 0
    expect(rows[1]).toContain('▱'.repeat(20)) // an empty bar, not a placeholder
    expect(rows[2]).toMatch(/5-hour.*–/) // no limit figure yet
    expect(rows[3]).toMatch(/7-day.*–/)
    expect(rows[4]).toContain('$0.00')
    await ui.press({ key: 'toggle' })
    expect((await ui.find({ key: 'toggle' }))?.text).toContain('Details')
    expect(flat(await ui.drawn())).toContain('Opus 5.5')
    await ui.press({ key: 'toggle' })
    await ui.unmount()
  }
})

test('a new session’s limits arrive a moment after it starts', async ($, on) => {
  const clock = bottom(on, 'claude-opus-5-5', { live: LIVE_NOW })
  await $.session.start(START)
  await clock.advance(0)

  const ui = await mount($)
  const rows = (await lines(ui)).map(flat)
  expect(rows[2]).toMatch(/5-hour.*32%/)
  expect(rows[3]).toMatch(/7-day.*28%/)
  await ui.unmount()
})

test('with no effort setting the band says default; unreadable settings do not stop the seed', async ($, on) => {
  const clock = bottom(on, 'claude-opus-5-5', { settings: 'fail' })
  await $.session.start(START)
  await clock.advance(0)

  const ui = await mount($)
  const rows = (await lines(ui)).map(flat)
  expect(rows[0]).toMatch(/Model.*Opus 5\.5.*Effort.*default/)
  expect(rows[1]).toMatch(/Context.*0%.*0 \/ 200k/)
  await ui.unmount()
})

test('working session: one line per detail, bars coloured by zone', async ($, on) => {
  bottom(on, 'claude-sonnet-5-5')
  await $.session.start(START)
  await $.session.measure(WORKING)
  await $.turn.step({ ...STEP, effort: 'high' } as never).next()

  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    const rows = await lines(ui)
    const text = rows.map(flat)
    expect(text[0]).toMatch(/Model.*Sonnet 5\.5.*Effort.*●●●○○.*high/)
    expect(text[1]).toMatch(/Context.*42%.*☀️.*Sunny.*84k \/ 200k/)
    expect(text[2]).toMatch(/5-hour.*31%.*☀️.*Sunny.*resets in 1h 40m/)
    expect(text[3]).toMatch(/7-day.*78%.*🌧️.*Rainy.*resets in 2d 13h/)
    expect(text[4]).toMatch(/Cost.*\$1\.23.*gumball/)

    // 20 pills a bar: the filled ones in the zone colour, then the empty ones
    const pills = (row: any) => all(row, x => x.type === 'Text' && /^[▰▱]$/.test(flat(x))).map(x => [flat(x), x.props.color])
    const bar = (filled: number, color: string) => [
      ...Array(filled).fill(['▰', color]),
      ...Array(20 - filled).fill(['▱', COLORS.empty]),
    ]
    expect(pills(rows[1])).toEqual(bar(8, COLORS.green)) // 42% of 20 cells
    expect(pills(rows[2])).toEqual(bar(6, COLORS.green))
    expect(pills(rows[3])).toEqual(bar(16, COLORS.orange))

    await ui.press({ key: 'toggle' })
    const collapsed = flat(await ui.drawn())
    expect(collapsed).toContain('7d 78% 🌧️') // the highest window leads
    expect(collapsed).toContain('ctx 42% ☀️')
    await ui.press({ key: 'toggle' })
    await ui.unmount()
  }
})

test('every title is Claude orange, never grey', async ($, on) => {
  bottom(on, 'claude-sonnet-5-5')
  await $.session.start(START)
  await $.session.measure(WORKING)
  const ui = await mount($)
  const titles = all(await ui.drawn(), x => x.type === 'Text' && x.props?.color === COLORS.title).map(flat)
  expect(titles).toEqual(['Model', 'Effort', 'Context', '5-hour', '7-day', 'Cost'])
  await ui.unmount()
})

test('effort appears after the first request, main loop only; none for a model without it', async ($, on) => {
  bottom(on, 'claude-sonnet-5-5')
  await $.session.start(START)

  await $.turn.step({ ...STEP, effort: 'xhigh', agentId: 'sub' } as never).next()
  let ui = await mount($)
  expect(flat(await ui.drawn())).not.toContain('xhigh')
  await ui.unmount()

  await $.turn.step({ ...STEP, effort: 'xhigh' } as never).next()
  ui = await mount($)
  expect(flat(await ui.drawn())).toContain('xhigh')
  await ui.unmount()

  await $.turn.step({ ...STEP } as never).next()
  ui = await mount($)
  expect(flat((await lines(ui))[0])).toMatch(/Effort.*n\/a/)
  await ui.unmount()
})

test('a survey takes the band', async ($, on) => {
  bottom(on, 'claude-sonnet-5-5')
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine band'] }) as never)
  await $.session.start(START)
  const ui = await mount($, 'terminal', { ...(PROPS as object), hasSurvey: true })
  expect(await ui.find({ key: 'toggle' })).toBeUndefined()
  expect(flat(await ui.drawn())).toContain('engine band')
  await ui.unmount()
})

// what the real pane showed while the band was still on the session's old figures
const STALE_USAGE = {
  startedAt: 0,
  context: { tokens: 413000, window: 1000000, percent: 41 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 70, resetsAt: '2026-10-12T09:00:00Z' }, // that window ended an hour ago
    { kind: 'seven_day', percentUsed: 22, resetsAt: '2026-10-14T19:00:00Z' },
  ],
  cost: { usd: 11.89 },
}
const LIVE_NOW = live(32, '2026-10-12T13:43:00.337907+00:00', 28, '2026-10-16T19:00:00.337929+00:00')

test('live account usage replaces the session’s stale limits', async ($, on) => {
  const clock = bottom(on, 'claude-sonnet-5-5', { live: LIVE_NOW, usage: STALE_USAGE })
  await $.session.start(START)
  await clock.advance(0) // let the first fetch finish

  const ui = await mount($)
  const text = (await lines(ui)).map(flat)
  expect(text[2]).toMatch(/5-hour.*32%.*resets in 3h 43m/)
  expect(text[3]).toMatch(/7-day.*28%.*resets in 4d 9h/)
  expect(flat(await ui.drawn())).not.toMatch(/70%|22%/)
  // the note gets its own last row, right-aligned, apart from the cost
  const rows = await lines(ui)
  expect(flat(rows[4])).toMatch(/^Cost/)
  expect(flat(rows[4])).not.toContain('live')
  expect(rows[5].props.width).toBe(100)
  expect(rows[5].props.justifyContent).toBe('flex-end')
  expect(flat(rows[5])).toBe(`live · ${hhmm(NOW)}`)
  await ui.unmount()
})

test('a window past its reset is never shown with the old figure', async ($, on) => {
  const clock = bottom(on, 'claude-sonnet-5-5', { usage: STALE_USAGE }) // the live fetch fails
  await $.session.start(START)
  await clock.advance(0)

  const ui = await mount($)
  const text = (await lines(ui)).map(flat)
  expect(text[2]).toMatch(/5-hour.*window reset, updating…/)
  expect(text[2]).not.toContain('70%')
  expect(text[3]).toMatch(/7-day.*22%/)
  await ui.press({ key: 'toggle' })
  expect(flat(await ui.drawn())).toContain('7d 22%') // the collapsed line skips the ended window too
  await ui.unmount()
})

test('idle: the limits are re-read every minute, and a running turn is not on the clock', async ($, on) => {
  const clock = bottom(on, 'claude-sonnet-5-5', { live: LIVE_NOW, usage: STALE_USAGE })
  await $.session.start(START)
  await clock.advance(0)
  expect(LIVE.calls).toBe(1)

  await clock.advance(75_000) // the first idle tick falls between 60 and 75 s (a random head start)
  expect(LIVE.calls).toBe(2)
  await clock.advance(60_000)
  expect(LIVE.calls).toBe(3)

  await begin($) // a turn is running: the clock leaves the refresh to its finish
  await clock.advance(10 * 60_000)
  expect(LIVE.calls).toBe(3)

  await finish($) // it finishes: one refresh at once, and the idle minute resumes
  await clock.advance(0)
  expect(LIVE.calls).toBe(4)
  await clock.advance(75_000)
  expect(LIVE.calls).toBeGreaterThan(4)
})

test('during a turn the pane holds its figures; the finish refreshes at once', async ($, on) => {
  const clock = bottom(on, 'claude-sonnet-5-5', { live: LIVE_NOW, usage: STALE_USAGE })
  await $.session.start(START)
  await clock.advance(0)

  await begin($)
  LIVE.body = live(50, '2026-10-12T13:43:00+00:00', 30, '2026-10-16T19:00:00+00:00')
  await clock.advance(10 * 60_000) // ten minutes of a running turn
  let ui = await mount($)
  expect(flat((await lines(ui))[2])).toMatch(/5-hour.*32%/)
  await ui.unmount()

  await finish($)
  await clock.advance(0)
  ui = await mount($)
  const text = (await lines(ui)).map(flat)
  expect(text[2]).toMatch(/5-hour.*50%.*resets in 3h 33m/) // the countdown is worked out at this redraw
  expect(text[3]).toMatch(/7-day.*30%/)
  await ui.unmount()
})

test('every finished conversation, main or subagent, refreshes; a burst ends on fresh figures', async ($, on) => {
  const clock = bottom(on, 'claude-sonnet-5-5', { live: LIVE_NOW, usage: STALE_USAGE })
  await $.session.start(START)
  await clock.advance(0)
  expect(LIVE.calls).toBe(1)

  await clock.advance(30_000)
  await finish($, 'sub-1') // a subagent's conversation finished
  await clock.advance(0)
  expect(LIVE.calls).toBe(2)

  LIVE.body = live(61, '2026-10-12T13:43:00+00:00', 30, '2026-10-16T19:00:00+00:00')
  await Promise.all([finish($, 'sub-2'), finish($), finish($, 'sub-3')]) // three at once, right after a request
  await clock.advance(0)
  expect(LIVE.calls).toBe(2) // none inside the minimum gap...
  await clock.advance(20_000)
  expect(LIVE.calls).toBe(3) // ...one when the gap ends, so the burst still ends on fresh figures
  const ui = await mount($)
  expect(flat((await lines(ui))[2])).toMatch(/5-hour.*61%/)
  await ui.unmount()
})

test('a reply alone does not fetch', async ($, on) => {
  const clock = bottom(on, 'claude-sonnet-5-5', { live: LIVE_NOW, usage: STALE_USAGE })
  await $.session.start(START)
  await clock.advance(0)

  await clock.advance(30_000)
  await $.session.measure(WORKING) // a reply updates context and cost only
  await clock.advance(0)
  expect(LIVE.calls).toBe(1)
})

test('HTTP 429: it honours Retry-After, keeps the last good figures, and resumes afterwards', async ($, on) => {
  const clock = bottom(on, 'claude-sonnet-5-5', { live: LIVE_NOW, usage: STALE_USAGE })
  await $.session.start(START)
  await clock.advance(0)

  await clock.advance(30_000)
  LIVE.status = 429
  LIVE.headers = { 'retry-after': '120' }
  await finish($)
  await clock.advance(0)
  expect(LIVE.calls).toBe(2)
  const pausedUntil = NOW + 30_000 + 120_000

  let ui = await mount($)
  expect(flat((await lines(ui))[2])).toMatch(/5-hour.*32%/) // still the last good reading, no flip to anything else
  expect(flat((await lines(ui))[5])).toBe(`as of ${hhmm(NOW)} · 429, retry ${hhmm(pausedUntil)}`)
  await ui.unmount()

  await clock.advance(60_000) // still inside the pause: a finished turn does not ask
  await finish($)
  await clock.advance(0)
  expect(LIVE.calls).toBe(2)

  LIVE.status = 0 // the endpoint recovers
  await clock.advance(70_000) // past the pause
  await finish($)
  await clock.advance(0)
  expect(LIVE.calls).toBe(3)
  ui = await mount($)
  expect(flat((await lines(ui))[5])).toBe(`live · ${hhmm(NOW + 160_000)}`)
  await ui.unmount()
})

test('HTTP 429 with no Retry-After waits five minutes', async ($, on) => {
  const clock = bottom(on, 'claude-sonnet-5-5', { live: LIVE_NOW, usage: STALE_USAGE })
  await $.session.start(START)
  await clock.advance(0)

  LIVE.status = 429
  await clock.advance(30_000)
  await finish($)
  await clock.advance(0)
  expect(LIVE.calls).toBe(2)

  await clock.advance(4 * 60_000)
  await finish($)
  await clock.advance(0)
  expect(LIVE.calls).toBe(2) // 4 minutes after the 429: still paused

  await clock.advance(90_000)
  await finish($)
  await clock.advance(0)
  expect(LIVE.calls).toBe(3) // past 5 minutes
})

test('a reply with no limits does not wipe what was fetched', async ($, on) => {
  const clock = bottom(on, 'claude-sonnet-5-5', { live: LIVE_NOW, usage: STALE_USAGE })
  await $.session.start(START)
  await clock.advance(0)
  await $.session.measure({ ...(WORKING as object), rateLimits: [], changed: ['context'] } as never)

  const ui = await mount($)
  expect(flat((await lines(ui))[2])).toMatch(/5-hour.*32%/)
  await ui.unmount()
})

test('when live limits cannot be fetched the band says why, without naming where the figures came from', async ($, on) => {
  const clock = bottom(on, 'claude-sonnet-5-5') // the fetch answers 503
  await $.session.start(START)
  await $.session.measure(WORKING)
  await clock.advance(0)

  const ui = await mount($)
  expect(flat((await lines(ui))[5])).toBe('live unavailable · HTTP 503')
  await ui.unmount()
})

test('a recent live reading outranks the session’s own figures; an old one does not', async ($, on) => {
  const clock = bottom(on, 'claude-sonnet-5-5', { live: LIVE_NOW, usage: STALE_USAGE })
  await $.session.start(START)
  await clock.advance(0)
  const replyLimits = { ...(WORKING as object), changed: ['rateLimits'] } as never // five_hour 31, seven_day 78

  await $.session.measure(replyLimits)
  let ui = await mount($)
  expect(flat((await lines(ui))[2])).toMatch(/5-hour.*32%/) // the live 32, not the reply's 31
  await ui.unmount()

  LIVE.body = null // the live source goes away; after 5 minutes the reply's figures stand in
  await clock.advance(6 * 60_000)
  await $.session.measure(replyLimits)
  ui = await mount($)
  expect(flat((await lines(ui))[2])).toMatch(/5-hour.*31%/)
  await ui.unmount()
})

const showsWhy = (auth: 'none' | 'api-key', why: string) => async ($: any, on: any) => {
  const clock = bottom(on, 'claude-sonnet-5-5', { auth })
  await $.session.start(START)
  await $.session.measure(WORKING)
  await clock.advance(0)
  const ui = await mount($)
  expect(flat((await lines(ui))[5])).toBe(`live unavailable · ${why}`)
  await ui.unmount()
}
test('no login: the band says so', showsWhy('none', 'no login'))
test('an API-key login has no plan limits: the band says so', showsWhy('api-key', 'no plan'))
