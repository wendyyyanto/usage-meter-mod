import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { UsageMeterSnap } from "../types";
import {
	COLORS,
	cells,
	costEquiv,
	countdown,
	effortView,
	longKind,
	modelName,
	PAUSE,
	parseUsage,
	retryDelay,
	shortKind,
	tokens,
	weather,
	zone
} from "./format";

const EMPTY: UsageMeterSnap = { rateLimits: [] };
const snapRef = atom(
	{ plugin: "usage-meter-mod", key: "snap" } as const,
	EMPTY
);
// starts expanded; the person's toggle holds for the rest of the session
const openRef = atom(
	{ plugin: "usage-meter-mod", key: "isOpen" } as const,
	true
);

const patch = ($: EngineInterface, p: Partial<UsageMeterSnap>) =>
	update($, snapRef, (s) => ({ ...(s ?? EMPTY), ...p }));

// a fresh session has a window but no tokens yet: that is 0, not "unknown"
const percentOf = (c: UsageMeterSnap["context"]) =>
	c?.percent ?? (c?.window ? ((c.tokens ?? 0) / c.window) * 100 : undefined);

const TITLE = 9; // cells every row title takes, so bars and numbers start in one column
const BAR = 20; // cells in a bar: 5% a cell

// A session only learns its limits from its own replies, so they go stale while it idles and miss
// what other sessions spend. The account's plan usage is what the real usage pane reads; the engine
// holds the credential and attaches it (the mod never sees it), and only for Anthropic's own host.
// It is asked for when a session starts, each time any turn finishes (main or subagent), and once a
// minute while the session sits idle. A running turn is never on the clock: its finish asks instead.
// Every ask goes through one guard (one request at a time, a minimum gap, a pause after a 429), so many
// open sessions cannot add up to a flood of requests (that is what answered HTTP 429).
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const LIVE_FRESH = 300_000; // a live reading this young outranks the session's own figures
const IDLE_EVERY = 60_000; // an idle session re-reads the limits this often
const IDLE_JITTER = 15_000; // sessions that start together do not all tick together

// a reload starts the module afresh, so all of these start over
let isFetching = false; // one request at a time
let isActive = false; // a main-loop turn is running
let isTrailing = false; // a skipped ask is already waiting for the gap to end
let lastFetch = 0;
let pausedUntil = 0; // after a 429, no request before this

// Any failure leaves the band as it is: the last good figures, or the session's own.
const refreshLimits = async ($: EngineInterface) => {
	if (isFetching) return;
	isFetching = true;
	try {
		const now = await $.clock.now();
		if (now < pausedUntil) return;
		const wait = PAUSE.min - (now - lastFetch);
		if (wait > 0) {
			// too soon after the last request: ask once the gap is over, so a burst of finished turns
			// still ends on fresh figures
			if (!isTrailing) {
				isTrailing = true;
				$.clock.after(wait, () => {
					isTrailing = false;
					refreshLimits($).catch(() => {});
				});
			}
			return;
		}
		lastFetch = now;
		const auth = await $.session.authorize();
		if (auth?.kind !== "bearer") return; // no subscription login: there are no plan limits
		const r = await $.http.fetch(USAGE_URL, {
			auth: auth.handle,
			headers: { "anthropic-beta": "oauth-2025-04-20" }
		});
		if (r.status === 429) {
			pausedUntil = now + retryDelay(r.headers["retry-after"], now);
			return;
		}
		if (!r.ok) return;
		const limits = parseUsage(JSON.parse(r.text));
		if (limits.length)
			await patch($, { rateLimits: limits, rateAt: now, rateSource: "live" });
	} catch {
		// keep what the band already shows
	} finally {
		isFetching = false;
	}
};

// while idle: re-read the limits and redraw, so the countdowns keep counting
const idleTick = async ($: EngineInterface) => {
	if (isActive) return;
	await refreshLimits($);
	await patch($, { tickAt: await $.clock.now() });
};

export const register: Register = (on) => {
	// A new session shows the band at once, with its starting figures: the context window at 0, the
	// model it will use, the effort it is set to (before a request says), and the limits as the
	// session reports them until the live ones arrive a moment later. Nothing already known is wiped,
	// so a hot reload keeps what the session has learned.
	on("session.start", async ($, e, next) => {
		const [u, model, settings] = await Promise.all([
			$.session.usage(),
			$.session.model(),
			$.settings.read().catch(() => ({}) as Record<string, unknown>) // the effort default is a nicety: never lose the seed over it
		]);
		const level =
			typeof settings.effortLevel === "string"
				? settings.effortLevel
				: undefined;
		await update($, snapRef, (prev) => {
			const s = prev ?? EMPTY;
			return {
				...s,
				model,
				effort: s.effort === undefined ? level : s.effort,
				context: u.context,
				rateLimits: s.rateLimits.length ? s.rateLimits : u.rateLimits,
				costUsd: u.cost?.usd
			};
		});
		refreshLimits($).catch(() => {});
		// and again every minute while idle; a random head start keeps sessions that began together apart
		$.clock.after(Math.floor(Math.random() * IDLE_JITTER), () => {
			$.clock.every(IDLE_EVERY, () => {
				idleTick($).catch(() => {});
			});
		});
		return next(e);
	});

	on("turn.start", async ($, e, next) => {
		isActive = true;
		return next(e);
	});

	// "a conversation finished": the main loop or any subagent ended a turn
	on("turn.complete", async ($, e, next) => {
		if (e.agentId === undefined) isActive = false;
		refreshLimits($).catch(() => {});
		return next(e);
	});

	on("session.measure", async ($, e, next) => {
		const now = await $.clock.now();
		await update($, snapRef, (prev) => {
			const s = prev ?? EMPTY;
			// the reply's own limits only stand in where there is no recent live reading, and a reply
			// with none (no limits yet, or no subscription) never wipes what was fetched
			const isLiveFresh =
				s.rateSource === "live" &&
				s.rateAt !== undefined &&
				now - s.rateAt < LIVE_FRESH;
			const limits =
				e.rateLimits.length && !isLiveFresh
					? {
							rateLimits: e.rateLimits,
							rateAt: now,
							rateSource: "session" as const
						}
					: {};
			return {
				...s,
				context: e.context,
				costUsd: e.cost?.usd,
				...limits
			};
		});
		return next(e);
	});

	// the only place a mod sees effort; subagent loops carry an agentId and are skipped
	on("turn.step", async function* ($, e, next) {
		if (e.agentId === undefined)
			await patch($, { model: e.model, effort: e.effort ?? null });
		return yield* next(e);
	});

	on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
		if (e.props.hasSurvey) return next(e);

		const s = await read($, snapRef);
		const isOpen = await read($, openRef);
		const now = await $.clock.now();
		const { Box, Button, Text } = $.ui.resolve(e);

		const toggle = (
			<Button
				key="toggle"
				label={isOpen ? "Hide ▾" : "Details ▸"}
				onPress={() => update($, openRef, (v) => !v)}
			/>
		);
		const ctxPct = percentOf(s.context);
		// a window past its reset still holds the figure of the window that ended: never show it
		const isCurrent = (r: UsageMeterSnap["rateLimits"][number]) =>
			!r.resetsAt || Date.parse(r.resetsAt) > now;
		const worst = s.rateLimits
			.filter(isCurrent)
			.reduce<
				UsageMeterSnap["rateLimits"][number] | undefined
			>((a, b) => (a === undefined || b.percentUsed > a.percentUsed ? b : a), undefined);
		const eff =
			s.effort === undefined || s.effort === null
				? undefined
				: effortView(s.effort);

		const val = (str: string, color?: string, isBold = false) => (
			<Text color={color} bold={isBold}>
				{str}
			</Text>
		);
		const muted = (str: string) => val(str, COLORS.muted);

		if (!isOpen) {
			return (
				<Box>
					<Text wrap="truncate-end">
						<Text bold>{s.model ? modelName(s.model) : "–"}</Text>
						{s.effort === null ? null : (
							<Text color={COLORS.muted}>{" | "}</Text>
						)}
						{s.effort === null ? null : (
							<Text color={COLORS.effort}>
								{eff ? eff.label : "default"}
							</Text>
						)}
						<Text color={COLORS.muted}>{" | "}</Text>
						<Text
							color={
								worst ? zone(worst.percentUsed) : COLORS.muted
							}
						>
							{worst
								? `${shortKind(worst.kind)} ${Math.round(worst.percentUsed)}% ${weather(worst.percentUsed).icon}`
								: "5h –"}
						</Text>
						<Text color={COLORS.muted}>{" | "}</Text>
						<Text
							color={
								ctxPct === undefined
									? COLORS.muted
									: zone(ctxPct)
							}
						>
							{ctxPct === undefined
								? "ctx –"
								: `ctx ${Math.round(ctxPct)}% ${weather(ctxPct).icon}`}
						</Text>
					</Text>
					<Box marginLeft={2}>{toggle}</Box>
				</Box>
			);
		}

		// Alignment never leans on runs of spaces or glyph widths (a web-style surface can collapse or
		// widen them): titles, bars and numbers are boxes of exact cell widths, laid out by the surface.
		const title = (str: string) => (
			<Box width={TITLE} flexShrink={0}>
				<Text color={COLORS.title} bold>
					{str}
				</Text>
			</Box>
		);
		const sep = (
			<Box marginX={1} flexShrink={0}>
				{muted("|")}
			</Box>
		);
		// one pill per cell, each in a box one cell wide: the bar is exactly BAR cells whatever the font
		const barView = (pct: number) => {
			const filled = cells(pct, BAR);
			return (
				<Box width={BAR} flexShrink={0}>
					{Array.from({ length: BAR }, (_, i) => (
						<Box
							key={i}
							width={1}
							flexShrink={0}
							justifyContent="center"
						>
							<Text color={i < filled ? zone(pct) : COLORS.empty}>
								{i < filled ? "▰" : "▱"}
							</Text>
						</Box>
					))}
				</Box>
			);
		};
		// a bar only when the figure exists; otherwise the title keeps a placeholder
		const meter = (
			name: string,
			pct: number | undefined,
			extra: unknown,
			missing = "–"
		) => (
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
							<Box marginLeft={1}>
								{val(weather(pct).word, zone(pct))}
							</Box>
						</Box>
						<Box marginLeft={2}>{extra}</Box>
					</Box>
				)}
			</Box>
		);

		const win = s.context?.window;
		const ctxExtra = win
			? `${tokens(s.context?.tokens ?? 0)} / ${tokens(win)}`
			: "";
		const kinds = [
			"five_hour",
			"seven_day",
			...s.rateLimits
				.map((r) => r.kind)
				.filter((k) => k !== "five_hour" && k !== "seven_day")
		];
		const equiv = s.costUsd === undefined ? "" : costEquiv(s.costUsd);
		const paneWidth = Math.max(40, e.props.bodyColumns); // the rows that pin something to the right edge span the pane

		return (
			<Box flexDirection="column">
				<Box width={paneWidth} justifyContent="space-between">
					<Box>
						{title("Model")}
						{s.model
							? val(modelName(s.model), undefined, true)
							: muted("–")}
						{sep}
						<Box marginRight={1}>
							<Text color={COLORS.title} bold>
								Effort
							</Text>
						</Box>
						{s.effort === null ? (
							muted("n/a")
						) : eff === undefined ? (
							muted("default")
						) : (
							<Box>
								{eff.dots ? val(eff.dots, COLORS.effort) : null}
								<Box marginLeft={eff.dots ? 1 : 0}>
									{val(eff.label, COLORS.effort)}
								</Box>
							</Box>
						)}
					</Box>
					{toggle}
				</Box>
				{meter("Context", ctxPct, val(ctxExtra))}
				{kinds.map((k) => {
					const r = s.rateLimits.find((x) => x.kind === k);
					const hasEnded = r !== undefined && !isCurrent(r);
					const resets =
						r && !hasEnded ? countdown(r.resetsAt, now) : "";
					return meter(
						longKind(k),
						hasEnded ? undefined : r?.percentUsed,
						muted(resets ? `resets in ${resets}` : ""),
						hasEnded ? "window reset, updating…" : "–"
					);
				})}
				<Box key="Cost">
					{title("Cost")}
					{s.costUsd === undefined
						? muted("–")
						: val(`$${s.costUsd.toFixed(2)}`, undefined, true)}
					{equiv ? (
						<Box marginLeft={2}>{val(equiv, COLORS.effort)}</Box>
					) : null}
				</Box>
			</Box>
		);
	});
};
