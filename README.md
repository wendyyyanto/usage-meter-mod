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

## Notes

- **Limits need a subscription.** The 5-hour and 7-day figures come from the account's rate-limit windows, which Claude reports only on a subscription and only after the first response. Until then those rows show `–`, with no bar.
- **Effort appears after the first request.** A mod can only read the effort when a request is sent. A model with no effort setting shows `n/a`.
- **Cost equivalents are rough.** They use a small hard-coded list of US prices in USD. Edit `THINGS` in `hooks/format.ts` for your own.
- **Colours.** Titles use Claude's clay orange, effort Claude's blue, and the bars green, yellow, orange and red by zone. It was built mainly against the desktop app's Code tab; other surfaces may draw the emoji or box widths a little differently.

## Develop

The mod is one hooks module (`hooks/register.tsx`) plus pure helpers (`hooks/format.ts`).

```
claude plugin validate .
claude plugin test .
```

If you installed it from a local folder, edit the files and run `/reload-plugins`.

## License

[MIT](LICENSE)
