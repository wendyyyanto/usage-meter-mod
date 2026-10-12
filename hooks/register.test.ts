import { test, expect, mock } from 'claude-code/testing'

import { COLORS } from './format'

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

const bottom = (on: any, model: string) => {
  on('session.usage', () => ({ value: FRESH }))
  on('session.model', () => ({ value: model }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.measure', (_: unknown, e: any) => ({ changed: e.changed }))
  on('turn.step', async function* (_: unknown, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' } as never
  })
  mock.clock(on, { now: Date.parse('2026-10-12T10:00:00Z') })
}

const flat = (n: any): string => (typeof n === 'string' ? n : (n?.children ?? []).map(flat).join(''))
const all = (n: any, test: (x: any) => boolean): any[] =>
  typeof n === 'string' || !n ? [] : [...(test(n) ? [n] : []), ...(n.children ?? []).flatMap((c: any) => all(c, test))]
const mount = ($: any, surface: 'terminal' | 'desktop' = 'terminal', props: object = PROPS) =>
  $.ui.mount({ plugin: 'usage-meter-mod', surface, component: 'AbovePrompt', props })
// the expanded band: one child per line (model|effort, context, 5-hour, 7-day, cost)
const lines = async (ui: any) => ((await ui.drawn()).children ?? []) as any[]

test('fresh session: opens expanded, no bars yet, Hide collapses it', async ($, on) => {
  bottom(on, 'claude-opus-5-5')
  await $.session.start(START)

  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect((await ui.find({ key: 'toggle' }))?.text).toContain('Hide')
    const rows = (await lines(ui)).map(flat)
    expect(rows.length).toBe(5)
    expect(rows[0]).toMatch(/Model.*Opus 5\.5.*Effort.*–/)
    expect(rows[1]).toContain('– / 200k')
    expect(rows[2]).toMatch(/5-hour.*–/)
    expect(rows[3]).toMatch(/7-day.*–/)
    expect(rows[4]).toContain('$0.00')
    expect(flat(await ui.drawn())).not.toMatch(/[▰▱]/) // no bars before the first response
    expect(flat(await ui.drawn())).not.toMatch(/Sunny|Cloudy|Rainy|Stormy/) // and no weather
    await ui.press({ key: 'toggle' })
    expect((await ui.find({ key: 'toggle' }))?.text).toContain('Details')
    expect(flat(await ui.drawn())).toContain('Opus 5.5')
    await ui.press({ key: 'toggle' })
    await ui.unmount()
  }
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
