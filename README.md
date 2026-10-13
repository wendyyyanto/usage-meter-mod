# usage-meter-mod

A band above the message input that shows, at a glance, how close you are to your usage limits and how full the context is. It is a mod for Claude Code and the Claude desktop app's Code tab.

<img width="764" height="115" alt="image" src="https://github.com/user-attachments/assets/84530bfc-21aa-445a-b4d0-7846641e999d" />

## What it shows

- **Model and effort** of the current session.
- **Context** used against the model's window, with a progress bar and percent.
- **5-hour and 7-day limits** with a progress bar, percent and reset countdown.
- **Weather** next to each bar, on the same four zones as the bar colour: ☀️ Sunny under 50%, ⛅ Cloudy 50-74%, 🌧️ Rainy 75-89%, ⛈️ Stormy 90% and over.
- **Session cost** and a rough equivalent (a latte, a Big Mac, a burrito...).

Click `[Hide ▾]` to collapse it to one line: `Sonnet 5.5 | high | 7d 78% 🌧️ | ctx 42% ☀️  [Details ▸]`. It starts expanded in every session.

## Install

In a terminal session of Claude Code, add the marketplace, then install the mod:

```
/plugin marketplace add wendyyyanto/usage-meter-mod
/plugin install usage-meter-mod@yanto-mods
```

Pick the **user** scope. From then on it loads in every session you start or resume, including the desktop app's Code tab. Sessions that are already open pick it up when restarted or resumed.

The `/plugin` command is a terminal command; the desktop app's Code tab says it isn't available there. Install from a terminal once and the desktop app loads it too.

To remove it:

```
claude plugin uninstall usage-meter-mod@yanto-mods
```

## What it costs you

- **No model tokens.** The mod never asks Claude anything and adds nothing to your prompt or your conversation. It only reads numbers the engine already has and draws them.
- **One small network call.** When a session starts, when a conversation starts, each time a conversation finishes (the main one or a subagent's), and every 5 seconds while the session sits idle, it asks `https://api.anthropic.com/api/oauth/usage` for your account's plan usage, the same figures the usage pane in the app shows. While a turn is running the clock stays out of it: its start and its finishes do the asking. All asks go through one guard: one request at a time, never more than one every 5 seconds (a burst of finishes ends with one request when the gap is over), and if Anthropic answers `HTTP 429` (too many requests) it stops asking until the time given in `Retry-After` (or 5 minutes) has passed. This is a plain metadata request, not a model request. The engine attaches your login to it itself, so the mod never sees your token, and the call can only go to Anthropic's own host.

## Limitations

**Where it works**

- **Terminal and desktop app only.** The band uses the slot above the prompt, which only those two surfaces draw. It does not appear in VS Code or on mobile.
- **Not tested everywhere.** It was built mainly against the desktop app's Code tab. It has not been tested on API-key accounts, VS Code or mobile, and other surfaces may draw the emoji or box widths a little differently.
- **Installed per machine.** User-scope install applies to your own sessions on that computer. Sessions that are already open pick it up when restarted or resumed.

**Data**

- **Limits need a subscription.** The 5-hour and 7-day figures are plan limits. On an API key or a third-party provider those rows show `–`, with no bar.
- **The live source is not a documented API.** Anthropic's plan-usage endpoint could change or disappear. If the call fails, the band falls back to the figures from the session's last reply.
- **The band does not say where its limits came from, or why a refresh failed.** There is no status line: if the live call fails (no subscription login, a `429`, a network error), the band quietly keeps showing the last good figures, or the session's own figures if it never had any. A `429` pauses that session's requests until the time Anthropic gives (or 5 minutes), then it tries again.
- **When it updates.** On a new session the band appears at once with starting figures (see below). While a session is idle (open, with no conversation running) it refreshes every 5 seconds. While a turn is running it holds its figures, and refreshes when the conversation starts and when any conversation, main or subagent, finishes. A reply (not a finished conversation) updates only context and cost. Reset countdowns such as `resets in 2h 43m` are worked out whenever the pane redraws, so while a turn is running they stand still until the next refresh.
- **A new session starts with default figures.** Context at 0 of the model's window, the model it will use, the effort from your `effortLevel` setting (or `default` if you have none, and corrected after the first request), and the limits as soon as the first live reading arrives, a moment after the session starts.
- **A fresh live reading outranks the session's own figures.** For 5 minutes after a successful fetch, the limits a reply reports do not replace it.
- **Idle sessions ask often, so a 429 is likely.** Each idle session asks every 5 seconds (12 requests a minute; a random head start keeps sessions that began together apart), on top of the asks at conversation starts and finishes. The guard keeps each session within its own limits, but sessions do not coordinate with each other, so several idle sessions together can easily exceed what Anthropic allows. When it answers `429`, the affected sessions pause until the time it gives (or 5 minutes), and their limits stand still meanwhile. If you see that, lengthen `IDLE_EVERY` in `hooks/register.tsx`.
- **A window that has reset is never shown with its old number.** Past its reset time a row reads `window reset, updating…` until fresh figures arrive.
- **If your organisation blocks non-essential traffic,** the live call is refused and only the fallback figures are used.
- **Effort is a best guess until the first request.** A mod can only read the effort a session really uses when a request is sent. Until then the band shows your `effortLevel` setting (or `default`), which can differ if you changed effort in the app for that session. A model with no effort setting shows `n/a` after the first request.
- **Cost equivalents are rough.** They use a small hard-coded list of US prices in USD, and the weather icons are only a metaphor for how full each limit is. Edit `THINGS` in `hooks/format.ts` for your own prices.

**Display**

- **It steps aside for surveys,** and the engine's own `[-]` mark can hide the whole band.
- **Very narrow panes clip the line** instead of wrapping it.
- **Emoji and bar glyphs depend on your font.** If one renders as a flat symbol or a box, that is the font.
- **Colours.** Titles use Claude's clay orange, effort Claude's blue, and the bars green, yellow, orange and red by zone.

## Develop

The mod is one hooks module (`hooks/register.tsx`) plus pure helpers (`hooks/format.ts`).

```
claude plugin validate .
claude plugin test .
```

If you installed it from a local folder, edit the files and run `/reload-plugins`.

## License

[MIT](LICENSE)
