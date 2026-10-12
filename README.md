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

In a terminal session of Claude Code, run:

```
/plugin install usage-meter-mod --marketplace wendyyyanto/usage-meter-mod
```

Answer `y` to add the marketplace, then pick the **user** scope. From then on it loads in every session you start or resume, including the desktop app's Code tab. Sessions that are already open pick it up when restarted or resumed.

The `/plugin` command is a terminal command; the desktop app's Code tab says it isn't available there. Install from a terminal once and the desktop app loads it too.

To remove it:

```
claude plugin uninstall usage-meter-mod@yanto-mods
```

## What it costs you

- **No model tokens.** The mod never asks Claude anything and adds nothing to your prompt or your conversation. It only reads numbers the engine already has and draws them.
- **One small network call.** About every two minutes, per open session, it asks `https://api.anthropic.com/api/oauth/usage` for your account's plan usage, the same figures the usage pane in the app shows. This is a plain metadata request, not a model request. The engine attaches your login to it itself, so the mod never sees your token, and the call can only go to Anthropic's own host.

## Limitations

**Where it works**

- **Terminal and desktop app only.** The band uses the slot above the prompt, which only those two surfaces draw. It does not appear in VS Code or on mobile.
- **Not tested everywhere.** It was built mainly against the desktop app's Code tab. It has not been tested on API-key accounts, VS Code or mobile, and other surfaces may draw the emoji or box widths a little differently.
- **Installed per machine.** User-scope install applies to your own sessions on that computer. Sessions that are already open pick it up when restarted or resumed.

**Data**

- **Limits need a subscription.** The 5-hour and 7-day figures are plan limits. On an API key or a third-party provider those rows show `–`, with no bar.
- **The live source is not a documented API.** Anthropic's plan-usage endpoint could change or disappear. If the call fails, the band falls back to the figures from the session's last reply.
- **The band says where its limits came from.** The Cost row ends with a muted line: `limits live · just now` when the figures are fresh from your account, or `limits from last reply (HTTP 503) · 4m ago` with the reason when the live call failed (`no login`, `no subscription login`, `HTTP <status>`, `unexpected reply` or `fetch failed`). If a session shows no such line, it is running an older version of the mod; restart or resume it.
- **A fresh live reading outranks the session's own figures.** For 5 minutes after a successful fetch, the limits a reply reports do not replace it. A reply also triggers a fresh fetch within a minute.
- **Figures can lag a little.** Limits refresh at least every 2 minutes, and countdowns move once a minute.
- **Many open sessions mean many calls.** Every open session polls on its own, and there is no back-off if the endpoint starts refusing requests.
- **A window that has reset is never shown with its old number.** Past its reset time a row reads `window reset, updating…` until fresh figures arrive.
- **If your organisation blocks non-essential traffic,** the live call is refused and only the fallback figures are used.
- **Effort appears after the first request.** A mod can only read the effort when a request is sent, so a fresh session shows `–` until then. A model with no effort setting shows `n/a`.
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
