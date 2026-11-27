import { and, asc, eq, gte, lte, max } from "drizzle-orm";

import { databaseConnection } from "#lib/server/db/database.js";
import { weatherDay } from "#lib/server/db/schema.js";
import type { WeatherDay } from "#lib/weather.js";

const columns = {
	date: weatherDay.date,
	min: weatherDay.min,
	mean: weatherDay.mean,
	max: weatherDay.max,
	code: weatherDay.code,
};

/** Each home's outside temperatures, one row per local day; there's no row object, only finders. */
export class WeatherDayDTO {
	/** Stores `days` for `homeId`, replacing what it held for those dates. */
	static record(homeId: string, days: WeatherDay[]): void {
		if (days.length === 0) {
			return;
		}
		const database = databaseConnection.get();
		database.transaction((transaction) => {
			for (const day of days) {
				transaction
					.insert(weatherDay)
					.values({ homeId, ...day })
					.onConflictDoUpdate({
						target: [weatherDay.homeId, weatherDay.date],
						set: { min: day.min, mean: day.mean, max: day.max, code: day.code },
					})
					.run();
			}
		});
	}

	/** The latest day stored for `homeId`, `YYYY-MM-DD`, or `null` before any. */
	static latest(homeId: string): string | null {
		return (
			databaseConnection
				.get()
				.select({ latest: max(weatherDay.date) })
				.from(weatherDay)
				.where(eq(weatherDay.homeId, homeId))
				.get()?.latest ?? null
		);
	}

	/** The days of `homeId` from `from` to `to`, both `YYYY-MM-DD` and included, oldest first. */
	static between(homeId: string, from: string, to: string): WeatherDay[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(weatherDay)
			.where(
				and(
					eq(weatherDay.homeId, homeId),
					gte(weatherDay.date, from),
					lte(weatherDay.date, to),
				),
			)
			.orderBy(asc(weatherDay.date))
			.all();
	}

	/** Removes every day of `homeId`, when it moved somewhere else. */
	static forget(homeId: string): void {
		databaseConnection
			.get()
			.delete(weatherDay)
			.where(eq(weatherDay.homeId, homeId))
			.run();
	}
}
