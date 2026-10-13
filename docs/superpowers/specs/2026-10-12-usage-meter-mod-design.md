# usage-meter-mod: usage limits, context, model and effort above the prompt

## Goal
A band directly above the message input, in every session, that shows at a glance how close the user is to their usage limits and how full the context is, plus the session's model and effort. Expanded by default; one button collapses it.

## Data (all read-only, no network)
| Shown | Source |
|---|---|
| Context tokens, window, percent | `$.session.usage().context`, then `session.measure` |
| 5-hour / 7-day limit: percent used, reset time | live: `GET https://api.anthropic.com/api/oauth/usage` through `$.http.fetch` with the engine's credential handle (`$.session.authorize()`), every 2 min; fallback: `rateLimits` from `$.session.usage()` / `session.measure` (the session's last reply) |
| Cost (USD) | `cost.usd` from the same two |
| Model | `$.session.model()` at `session.start`, then `turn.step` (`e.model`) |
| Effort | `turn.step` (`e.effort`); main loop only (`e.agentId` undefined) |

State lives in `$.state` (`snap`, `isOpen`, default true) so a hot reload keeps it. `session.start` seeds it, so resumed sessions show figures straight away.

## Display (no table: one detail per line)
```
Model     Sonnet 5.5 | Effort ●●●○○ high                          [Hide ▾]
Context   ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱  42%  84k / 1M
5-hour    ▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱  31%  resets in 1h 40m
7-day     ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱  78%  resets in 2d 13h
Cost      $5.08  ≈ 1.1 lattes ☕
```
- Weather: Context, 5-hour and 7-day each get an icon and word after the percent, on the same four zones as the colours: ☀️ Sunny 0-49, ⛅ Cloudy 50-74, 🌧️ Rainy 75-89, ⛈️ Stormy 90+ (the word takes the zone colour). No reading, no weather. The collapsed line carries the icons too.
- Collapsed (after Hide): `Sonnet 5.5 | high | 7d 78% | ctx 42%  [Details ▸]` (the limit slot shows whichever window is highest).
- Any other limit kind present (e.g. a spend limit) gets its own line after 7-day.
- Cost equivalent: the biggest item in a small hard-coded US-price list that the cost covers (gumball, candy bar, McDonald's fries, latte, Big Mac, burrito, movie ticket, pizza, sushi dinner, dinner for two, concert ticket), counted to one decimal. Prices are rough; edit `THINGS` in `format.ts`.

Colours (Claude's palette): row titles clay orange `#D97757` bold, never grey; effort and the cost equivalent Claude blue `#6A9BCC`; separators and reset times Claude's warm grey `#B0AEA5`; values use the theme's own text colour (so light and dark both read). Bars are segmented pills, 20 cells (5% a cell, any use at all fills one), `▰` filled / `▱` empty, each pill in its own one-cell box so the bar is exactly 20 cells whatever the font; fill by zone green `#8BA870` 0-49, yellow `#E5C158` 50-74, orange `#EE8C3A` 75-89, red `#D4574E` 90+; empty pills `#6B6A64`. The percent takes its bar's colour.

Alignment never leans on runs of spaces or glyph widths (a web-style surface can collapse or widen them): titles (9 cells), bars, percents are boxes of exact cell widths.

## Keeping limits current
A session only learns its limits from its own replies, so they go stale while it idles and miss what other sessions spend; the real usage pane reads the account's plan usage. The mod polls that (60 s tick, fetch at most every 120 s, started at `session.start`) and redraws each tick so countdowns move. The engine holds the credential and only attaches it for Anthropic's own host; the mod never sees a token. A window whose `resetsAt` has passed is never shown with its old figure (`window reset, updating…`). A reply with no limits never wipes fetched ones. If the fetch fails, the session's figures show with a `limits as of <age>` note once older than 3 min. Helpers that take `$` must be top-level declarations (the engine refuses the module otherwise).

## Rules for missing data
- A row draws its bar only when it has a reading; otherwise its label stays with a dim `–` (context: `– / 200k`). Fresh sessions therefore show no bars.
- Rate limits are empty off a subscription and before the first response; they stay `–` then.
- Effort is `–` until the first request of the session; if a request carries no effort (model has none), the Effort line and the collapsed effort piece are hidden.
- The band yields to a survey (`e.props.hasSurvey`).

## Files (`usage-meter-mod/`)
`.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx` (events and drawing), `hooks/format.ts` (pure: bar, zone, model name, effort, countdown, token format), `hooks/format.test.ts`, `types/index.d.ts` (state contract). No dependencies.

## Install
Built and tested under the session mods folder (hot-reloaded, this session only). "Every session" = a user-scope install of the same folder via a local marketplace; that changes persistent config, so it needs the user's explicit go-ahead. Running sessions pick it up when restarted or resumed.

## Not in scope
History graphs, threshold notifications, per-model breakdown, a live-ticking reset countdown (it refreshes on redraw).

## Open risk
Whether the desktop app draws the `AbovePrompt` slot is unconfirmed; the first build is the test.
