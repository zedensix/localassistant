import type { LinkyState } from "#lib/devices.js";
import {
	definePlugin,
	type FoundDevice,
	type Plugin,
	type PluginContext,
	type PluginDevice,
} from "#lib/plugin-sdk.js";
import type { PluginValues } from "#lib/plugins.js";

const tokenPage = "https://conso.boris.sh";
const apiUrl = `${tokenPage}/api/consommation_quotidienne`;
const requestTimeoutMs = 20_000;
const retryEveryMs = 60 * 60_000;
const dayMs = 24 * 60 * 60_000;
const windowDays = 365;
const staleDays = 3;
const timeZone = "Europe/Paris";

interface DailyAnswer {
	grandeur?: { unite?: string; points?: { v: string | null; d: string }[] }[];
}

interface ErrorAnswer {
	message?: string;
	error?: { error?: string; error_description?: string };
}

interface DailyUse {
	date: string;
	kilowattHours: number;
}

/**
 * A Linky meter read online: Enedis's daily consumption through conso.boris.sh, with the PRM and the token its site
 * hands out. No hardware; the data is a day behind.
 */
class Linky implements Plugin {
	#attempts = new Map<string, { at: number; failure: unknown }>();

	/** The meter the form describes, known by its PRM. */
	add(values: PluginValues): FoundDevice {
		return { kind: "linky", externalId: String(values.prm) };
	}

	/**
	 * Fetches the last year of daily use for the form's PRM and token without storing anything; says up to which day.
	 *
	 * @throws When the token is refused, the service can't be reached, or Enedis has sent nothing lately.
	 */
	async test(values: PluginValues): Promise<string> {
		const now = new Date();
		const days = await this.#fetch(
			String(values.prm),
			String(values.token ?? ""),
			now,
		);
		const last = this.#latest(days, now);
		return `Enedis has readings up to ${last.date}: ${this.#round(last.kilowattHours)} kWh that day.`;
	}

	/**
	 * Fetches the last year of daily use, stores it as the meter's counter, and returns the latest day; skips the fetch
	 * while yesterday is already in, and retries a late or failed one at most hourly for the same PRM and token.
	 *
	 * @throws When the token is refused, the service can't be reached, or Enedis has sent nothing for three days.
	 */
	async read(
		device: PluginDevice,
		context: PluginContext,
		now = new Date(),
	): Promise<LinkyState> {
		const { state } = device;
		if (
			state?.type === "linky" &&
			state.day !== null &&
			state.day >= this.#localDay(now, 1)
		) {
			return state;
		}
		const token = device.secret("token") ?? "";
		const key = `${device.externalId}:${token}`;
		const attempt = this.#attempts.get(key);
		if (attempt && now.getTime() - attempt.at < retryEveryMs) {
			if (attempt.failure) {
				throw attempt.failure;
			}
			if (state?.type === "linky") {
				return state;
			}
		}
		try {
			const days = await this.#fetch(device.externalId, token, now);
			this.#record(device, context, days);
			const last = this.#latest(days, now);
			this.#attempts.set(key, { at: now.getTime(), failure: null });
			return {
				type: "linky",
				day: last.date,
				kilowattHours: this.#round(last.kilowattHours),
			};
		} catch (failure) {
			this.#attempts.set(key, { at: now.getTime(), failure });
			throw failure;
		}
	}

	#record(
		device: PluginDevice,
		context: PluginContext,
		days: DailyUse[],
	): void {
		const start = days[0];
		if (!start) {
			return;
		}
		const before = context.energy
			.readings(device)
			.filter((reading) => reading.hour < this.#hourOf(start.date));
		let total = before.at(-1)?.total ?? 0;
		for (const day of days) {
			total += day.kilowattHours;
			context.energy.record(
				device,
				this.#hourOf(day.date),
				Math.round(total * 1000) / 1000,
			);
		}
	}

	#latest(days: DailyUse[], now: Date): DailyUse {
		const last = days.at(-1);
		if (!last) {
			throw new Error(
				`Enedis has no readings for this PRM: check its consent on ${tokenPage} and paste a new token.`,
			);
		}
		if (last.date < this.#localDay(now, staleDays)) {
			throw new Error(
				`Enedis has sent nothing since ${last.date}: check the consent on ${tokenPage} and paste a new token.`,
			);
		}
		return last;
	}

	#localDay(now: Date, daysBefore: number): string {
		return new Date(now.getTime() - daysBefore * dayMs).toLocaleDateString(
			"sv-SE",
			{
				timeZone,
			},
		);
	}

	#round(kilowattHours: number): number {
		return Math.round(kilowattHours * 100) / 100;
	}

	#hourOf(date: string): Date {
		return new Date(`${date}T12:00:00Z`);
	}

	async #refusal(response: Response): Promise<string> {
		const body = (await response.json().catch(() => ({}))) as ErrorAnswer;
		if (body.error?.error === "ADAM-DC-0007") {
			return `Enedis says this account doesn't hold that PRM anymore: give consent for it again on ${tokenPage}.`;
		}
		const reason = body.error?.error_description ?? body.message;
		const answered = reason
			? `conso.boris.sh answered ${response.status}: ${reason}`
			: `conso.boris.sh answered ${response.status}.`;
		return `${answered} If it lasts, get a new token on ${tokenPage}.`;
	}

	async #fetch(prm: string, token: string, now: Date): Promise<DailyUse[]> {
		if (!token) {
			throw new Error(`This Linky has no token: get one on ${tokenPage}.`);
		}
		const day = (offset: number) =>
			new Date(now.getTime() - offset * dayMs).toISOString().slice(0, 10);
		const query = new URLSearchParams({
			pointId: prm,
			dateDebut: day(windowDays),
			dateFin: day(0),
		});
		let response: Response;
		try {
			response = await fetch(`${apiUrl}?${query}`, {
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/json",
					"User-Agent": "LocalAssistant",
				},
				signal: AbortSignal.timeout(requestTimeoutMs),
			});
		} catch (error) {
			throw new Error("conso.boris.sh can't be reached right now.", {
				cause: error,
			});
		}
		if (response.status === 401 || response.status === 403) {
			throw new Error(
				`conso.boris.sh refused the token: get a new one for this PRM on ${tokenPage}.`,
			);
		}
		if (!response.ok) {
			throw new Error(await this.#refusal(response));
		}
		const body = (await response.json()) as DailyAnswer;
		return (body.grandeur?.[0]?.points ?? [])
			.flatMap((point) =>
				point.v === null
					? []
					: [
							{
								date: point.d.slice(0, 10),
								kilowattHours: Number(point.v) / 1000,
							},
						],
			)
			.filter((reading) => Number.isFinite(reading.kilowattHours))
			.toSorted((first, second) => first.date.localeCompare(second.date));
	}
}

export default definePlugin(new Linky());
