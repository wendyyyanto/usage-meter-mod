import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { UsageMeterSnap } from '../types'
import {
  COLORS,
  cells,
  costEquiv,
  countdown,
  effortView,
  longKind,
  modelName,
  shortKind,
  tokens,
  weather,
  zone,
} from './format'

const EMPTY: UsageMeterSnap = { rateLimits: [] }
const snapRef = atom({ plugin: 'usage-meter-mod', key: 'snap' } as const, EMPTY)
// starts expanded; the person's toggle holds for the rest of the session
const openRef = atom({ plugin: 'usage-meter-mod', key: 'isOpen' } as const, true)

const patch = ($: EngineInterface, p: Partial<UsageMeterSnap>) =>
  update($, snapRef, s => ({ ...(s ?? EMPTY), ...p }))

const percentOf = (c: UsageMeterSnap['context']) =>
  c?.percent ?? (c?.tokens !== undefined && c.window ? (c.tokens / c.window) * 100 : undefined)

const TITLE = 9 // cells every row title takes, so bars and numbers start in one column
const BAR = 20 // cells in a bar: 5% a cell

export const register: Register = on => {
  // seeds the figures so a resumed session (or a hot reload) shows them before its next response
  on('session.start', async ($, e, next) => {
    const [u, model] = await Promise.all([$.session.usage(), $.session.model()])
    await patch($, { model, context: u.context, rateLimits: u.rateLimits, costUsd: u.cost?.usd })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await patch($, { context: e.context, rateLimits: e.rateLimits, costUsd: e.cost?.usd })
    return next(e)
  })

  // the only place a mod sees effort; subagent loops carry an agentId and are skipped
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) await patch($, { model: e.model, effort: e.effort ?? null })
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const s = await read($, snapRef)
    const isOpen = await read($, openRef)
    const now = await $.clock.now()
    const { Box, Button, Text } = $.ui.resolve(e)

    const toggle = (
      <Button key="toggle" label={isOpen ? 'Hide ▾' : 'Details ▸'} onPress={() => update($, openRef, v => !v)} />
    )
    const ctxPct = percentOf(s.context)
    const worst = s.rateLimits.reduce<UsageMeterSnap['rateLimits'][number] | undefined>(
      (a, b) => (a === undefined || b.percentUsed > a.percentUsed ? b : a),
      undefined,
    )
    const eff = s.effort === undefined || s.effort === null ? undefined : effortView(s.effort)

    const val = (str: string, color?: string, isBold = false) => (
      <Text color={color} bold={isBold}>
        {str}
      </Text>
    )
    const muted = (str: string) => val(str, COLORS.muted)

    if (!isOpen) {
      return (
        <Box>
          <Text wrap="truncate-end">
            <Text bold>{s.model ? modelName(s.model) : '–'}</Text>
            {s.effort === null ? null : <Text color={COLORS.muted}>{' | '}</Text>}
            {s.effort === null ? null : <Text color={COLORS.effort}>{eff ? eff.label : '–'}</Text>}
            <Text color={COLORS.muted}>{' | '}</Text>
            <Text color={worst ? zone(worst.percentUsed) : COLORS.muted}>
              {worst ? `${shortKind(worst.kind)} ${Math.round(worst.percentUsed)}% ${weather(worst.percentUsed).icon}` : '5h –'}
            </Text>
            <Text color={COLORS.muted}>{' | '}</Text>
            <Text color={ctxPct === undefined ? COLORS.muted : zone(ctxPct)}>
              {ctxPct === undefined ? 'ctx –' : `ctx ${Math.round(ctxPct)}% ${weather(ctxPct).icon}`}
            </Text>
          </Text>
          <Box marginLeft={2}>{toggle}</Box>
        </Box>
      )
    }

    // Alignment never leans on runs of spaces or glyph widths (a web-style surface can collapse or
    // widen them): titles, bars and numbers are boxes of exact cell widths, laid out by the surface.
    const title = (str: string) => (
      <Box width={TITLE} flexShrink={0}>
        <Text color={COLORS.title} bold>
          {str}
        </Text>
      </Box>
    )
    const sep = (
      <Box marginX={1} flexShrink={0}>
        {muted('|')}
      </Box>
    )
    // one pill per cell, each in a box one cell wide: the bar is exactly BAR cells whatever the font
    const barView = (pct: number) => {
      const filled = cells(pct, BAR)
      return (
        <Box width={BAR} flexShrink={0}>
          {Array.from({ length: BAR }, (_, i) => (
            <Box key={i} width={1} flexShrink={0} justifyContent="center">
              <Text color={i < filled ? zone(pct) : COLORS.empty}>{i < filled ? '▰' : '▱'}</Text>
            </Box>
          ))}
        </Box>
      )
    }
    // a bar only when the figure exists; otherwise the title keeps a placeholder
    const meter = (name: string, pct: number | undefined, extra: unknown, missing = '–') => (
      <Box key={name}>
        {title(name)}
        {pct === undefined ? (
          muted(missing)
        ) : (
          <Box>
            {barView(pct)}
            <Box width={4} marginLeft={1} flexShrink={0}>
              {val(`${Math.round(pct)}%`, zone(pct), true)}
            </Box>
            <Box width={10} marginLeft={2} flexShrink={0}>
              <Box width={2} flexShrink={0}>
                <Text>{weather(pct).icon}</Text>
              </Box>
              <Box marginLeft={1}>{val(weather(pct).word, zone(pct))}</Box>
            </Box>
            <Box marginLeft={2}>{extra}</Box>
          </Box>
        )}
      </Box>
    )

    const win = s.context?.window
    const ctxExtra = s.context?.tokens !== undefined && win ? `${tokens(s.context.tokens)} / ${tokens(win)}` : ''
    const kinds = ['five_hour', 'seven_day', ...s.rateLimits.map(r => r.kind).filter(k => k !== 'five_hour' && k !== 'seven_day')]
    const equiv = s.costUsd === undefined ? '' : costEquiv(s.costUsd)

    return (
      <Box flexDirection="column">
        <Box width={Math.max(40, e.props.bodyColumns)} justifyContent="space-between">
          <Box>
            {title('Model')}
            {s.model ? val(modelName(s.model), undefined, true) : muted('–')}
            {sep}
            <Box marginRight={1}>
              <Text color={COLORS.title} bold>
                Effort
              </Text>
            </Box>
            {s.effort === null ? (
              muted('n/a')
            ) : eff === undefined ? (
              muted('–')
            ) : (
              <Box>
                {eff.dots ? val(eff.dots, COLORS.effort) : null}
                <Box marginLeft={eff.dots ? 1 : 0}>{val(eff.label, COLORS.effort)}</Box>
              </Box>
            )}
          </Box>
          {toggle}
        </Box>
        {meter('Context', ctxPct, val(ctxExtra), win ? `– / ${tokens(win)}` : '–')}
        {kinds.map(k => {
          const r = s.rateLimits.find(x => x.kind === k)
          const resets = r ? countdown(r.resetsAt, now) : ''
          return meter(longKind(k), r?.percentUsed, muted(resets ? `resets in ${resets}` : ''))
        })}
        <Box key="Cost">
          {title('Cost')}
          {s.costUsd === undefined ? muted('–') : val(`$${s.costUsd.toFixed(2)}`, undefined, true)}
          {equiv ? <Box marginLeft={2}>{val(equiv, COLORS.effort)}</Box> : null}
        </Box>
      </Box>
    )
  })
}
