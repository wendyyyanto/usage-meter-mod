import { test, expect } from "claude-code/testing";

import {
	cells,
	zone,
	COLORS,
	modelName,
	effortView,
	tokens,
	countdown,
	costEquiv,
	parseUsage,
	retryDelay,
	weather
} from "./format";

test("bar cells: proportional, at least one for any use, clamped", async () => {
	expect(cells(31, 20)).toBe(6);
	expect(cells(50, 20)).toBe(10);
	expect(cells(0, 20)).toBe(0);
	expect(cells(0.4, 20)).toBe(1);
	expect(cells(100, 20)).toBe(20);
	expect(cells(250, 20)).toBe(20);
	expect(cells(Number.NaN, 20)).toBe(0);
});

test("weather follows the same four zones", async () => {
	expect(weather(0).word).toBe("Sunny");
	expect(weather(49.9)).toEqual({ icon: "☀️", word: "Sunny" });
	expect(weather(50)).toEqual({ icon: "⛅", word: "Cloudy" });
	expect(weather(75)).toEqual({ icon: "🌧️", word: "Rainy" });
	expect(weather(90)).toEqual({ icon: "⛈️", word: "Stormy" });
	expect(weather(100).word).toBe("Stormy");
});

test("zones switch at 50, 75 and 90", async () => {
	expect(zone(49.9)).toBe(COLORS.green);
	expect(zone(50)).toBe(COLORS.yellow);
	expect(zone(75)).toBe(COLORS.orange);
	expect(zone(90)).toBe(COLORS.red);
});

test("model ids are shortened, unknown ones kept", async () => {
	expect(modelName("claude-sonnet-5-5")).toBe("Sonnet 5.5");
	expect(modelName("claude-opus-4-1-20250805")).toBe("Opus 4.1");
	expect(modelName("claude-opus-4-7[1m]")).toBe("Opus 4.7 1M");
	expect(modelName("claude-fable-5-1")).toBe("Fable 5.1");
	expect(modelName("my-gateway-model")).toBe("my-gateway-model");
});

test("effort levels become dots, numbers stay plain", async () => {
	expect(effortView("high")).toEqual({ label: "high", dots: "●●●○○" });
	expect(effortView("max").dots).toBe("●●●●●");
	expect(effortView(8000)).toEqual({ label: "8000", dots: "" });
});

test("tokens and countdown read well", async () => {
	expect(tokens(950)).toBe("950");
	expect(tokens(84321)).toBe("84k");
	expect(tokens(200000)).toBe("200k");
	expect(tokens(1500000)).toBe("1.5M");
	const now = Date.parse("2026-10-12T10:00:00Z");
	expect(countdown("2026-10-12T12:10:30Z", now)).toBe("2h 10m");
	expect(countdown("2026-10-16T13:00:00Z", now)).toBe("4d 3h");
	expect(countdown("2026-10-12T10:00:20Z", now)).toBe("1m");
	expect(countdown("2026-10-12T09:00:00Z", now)).toBe("now");
	expect(countdown(undefined, now)).toBe("");
});

test("cost equivalents pick the biggest thing the cost covers", async () => {
	expect(costEquiv(0)).toBe("");
	expect(costEquiv(0.1)).toBe("≈ less than a gumball 🍬");
	expect(costEquiv(0.6)).toBe("≈ 2.4 gumballs 🍬");
	expect(costEquiv(1.5)).toBe("≈ 1 candy bar 🍫");
	expect(costEquiv(5.08)).toBe("≈ 1.1 lattes ☕");
	expect(costEquiv(12)).toBe("≈ 1.2 burritos 🌯");
	expect(costEquiv(200)).toBe("≈ 1.3 concert tickets 🎤");
	expect(costEquiv(5000)).toBe("≈ 33 concert tickets 🎤");
});

test("the plan-usage reply is read in the session’s shape", async () => {
	const body = {
		five_hour: {
			utilization: 43.0,
			resets_at: "2026-10-12T12:20:00.337907+00:00",
			limit_dollars: null
		},
		seven_day: {
			utilization: 29.4,
			resets_at: "2026-10-14T19:00:00.337929+00:00"
		},
		seven_day_opus: null,
		iguana_necktie: {
			utilization: 0.0,
			resets_at: "2026-11-05T07:59:00+00:00"
		}
	};
	expect(parseUsage(body)).toEqual([
		{
			kind: "five_hour",
			percentUsed: 43,
			resetsAt: "2026-10-12T12:20:00.337907+00:00"
		},
		{
			kind: "seven_day",
			percentUsed: 29.4,
			resetsAt: "2026-10-14T19:00:00.337929+00:00"
		}
	]);
	expect(
		parseUsage({ five_hour: null, seven_day: { utilization: "x" } })
	).toEqual([]);
	expect(parseUsage(null)).toEqual([]);
	expect(parseUsage("nope")).toEqual([]);
	expect(Date.parse("2026-10-12T12:20:00.337907+00:00")).toBeGreaterThan(0); // microsecond stamps parse
});

test("Retry-After is seconds or a date, bounded", async () => {
	const now = Date.parse("2026-10-13T08:00:00Z");
	expect(retryDelay("120", now)).toBe(120_000);
	expect(retryDelay("5", now)).toBe(20_000); // never under the minimum gap
	expect(retryDelay("999999", now)).toBe(3_600_000); // never over an hour
	expect(retryDelay("Tue, 13 Oct 2026 08:03:00 GMT", now)).toBe(180_000);
	expect(retryDelay(undefined, now)).toBe(300_000); // none given: five minutes
	expect(retryDelay("soon", now)).toBe(300_000);
	expect(retryDelay("", now)).toBe(300_000);
});
