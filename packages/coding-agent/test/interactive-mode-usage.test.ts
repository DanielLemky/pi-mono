import { Container } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

function renderedText(container: Container): string {
	return container.children
		.flatMap((child) => child.render(160))
		.join("\n")
		.replace(/\u001b\[[0-9;]*m/g, "")
		.split("\n")
		.map((line) => line.trim())
		.join("\n")
		.trim();
}

function friendlyDate(timestamp: number): string {
	const date = new Date(timestamp * 1000);
	const options: Intl.DateTimeFormatOptions = {
		weekday: "long",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	};
	if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
	return new Intl.DateTimeFormat(undefined, options).format(date);
}

describe("InteractiveMode /usage", () => {
	beforeAll(() => initTheme("dark"));

	it("shows a clear message before a usage snapshot arrives", () => {
		const fakeThis = {
			session: { getSubscriptionUsage: () => undefined },
			showStatus: vi.fn(),
		};
		const prototype = InteractiveMode as unknown as {
			prototype: { handleUsageCommand(this: typeof fakeThis): void };
		};

		prototype.prototype.handleUsageCommand.call(fakeThis);

		expect(fakeThis.showStatus).toHaveBeenCalledWith(
			"No current subscription usage available. Send an OpenAI Codex request first.",
		);
	});

	it("renders remaining allowances, local reset times, and meaningful optional sections", () => {
		const resetAt = 1786465200;
		const promoExpiresAt = 1786551600;
		const chatContainer = new Container();
		type Window = { usedPercent: number; windowMinutes?: number; resetAfterSeconds?: number; resetAt?: number };
		const fakeThis = {
			session: {
				getSubscriptionUsage: () => ({
					provider: "openai-codex" as const,
					planType: "plus",
					allowed: false,
					primary: { usedPercent: 7, windowMinutes: 300, resetAt },
					secondary: { usedPercent: 23, windowMinutes: 10080, resetAt: resetAt + 86400 },
					promo: {
						title: "Double limits",
						message: "Twice the included Codex usage during the promotion.",
						multiplier: 2,
						expiresAt: promoExpiresAt,
					},
					credits: { hasCredits: true, unlimited: false, balance: "25" },
				}),
			},
			chatContainer,
			ui: { requestRender: vi.fn() },
			formatUsageReset(timestamp: number) {
				return prototype.formatUsageReset.call(fakeThis, timestamp);
			},
			formatUsageWindow(window: Window, kind: "primary" | "secondary") {
				return prototype.formatUsageWindow.call(fakeThis, window, kind);
			},
		};
		const prototype = (
			InteractiveMode as unknown as {
				prototype: {
					handleUsageCommand(this: typeof fakeThis): void;
					formatUsageReset(this: typeof fakeThis, timestamp: number): string;
					formatUsageWindow(this: typeof fakeThis, window: Window, kind: "primary" | "secondary"): string;
				};
			}
		).prototype;

		prototype.handleUsageCommand.call(fakeThis);

		const output = renderedText(chatContainer);
		expect(output).toContain("OpenAI Codex Usage\n\nPlan\nPlus\n\nAllowances");
		expect(output).toContain(`5-hour allowance: 93% remaining\nResets ${friendlyDate(resetAt)}`);
		expect(output).toContain(`Weekly allowance: 77% remaining\nResets ${friendlyDate(resetAt + 86400)}`);
		expect(output).toContain(
			"Promotion\nDouble limits\nTwice the included Codex usage during the promotion.\n2× usage limits",
		);
		expect(output).toContain(`Available through ${friendlyDate(promoExpiresAt)}`);
		expect(output).toContain("Credits\n25");
		expect(output).toContain("Requests are currently blocked by your subscription limit.");
	});

	it("clamps remaining percentages and hides empty credits", () => {
		type Window = { usedPercent: number };
		const fakeThis = {
			formatUsageReset: vi.fn(),
		};
		const prototype = (
			InteractiveMode as unknown as {
				prototype: {
					formatUsageWindow(this: typeof fakeThis, window: Window, kind: "primary" | "secondary"): string;
				};
			}
		).prototype;

		expect(prototype.formatUsageWindow.call(fakeThis, { usedPercent: -20 }, "primary")).toBe(
			"Primary allowance: 100% remaining",
		);
		expect(prototype.formatUsageWindow.call(fakeThis, { usedPercent: 120 }, "secondary")).toBe(
			"Secondary allowance: 0% remaining",
		);
	});
});
