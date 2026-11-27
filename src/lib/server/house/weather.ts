import type { HomeDTO, HomeLocation } from "#lib/dto/home.js";
import { WeatherDayDTO } from "#lib/dto/weather-day.js";
import { Logger } from "#lib/server/core/logger.js";
import type { Weather, WeatherDay } from "#lib/weather.js";

const logger = new Logger("Weather");

const forecastUrl = "https://api.open-meteo.com/v1/forecast";
const searchUrl = "https://geocoding-api.open-meteo.com/v1/search";
const archiveUrl = "https://archive-api.open-meteo.com/v1/archive";
const timeoutMs = 10_000;
const pastDays = 92;
const archiveDays = 730;
const dailyFields =
	"weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean";
const dayMs = 24 * 60 * 60_000;

interface Forecast {
	utc_offset_seconds: number;
	current: {
		temperature_2m: number;
		apparent_temperature?: number;
		weather_code: number;
		is_day: number;
		wind_speed_10m?: number;
	};
	daily: {
		time: string[];
		weather_code: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		sunrise: string[];
		sunset: string[];
	};
}

interface Past {
	daily: {
		time: string[];
		weather_code: (number | null)[];
		temperature_2m_max: (number | null)[];
		temperature_2m_min: (number | null)[];
		temperature_2m_mean: (number | null)[];
	};
}

interface Found {
	name: string;
	latitude: number;
	longitude: number;
	timezone?: string;
	country?: string;
	admin1?: string;
}

/** Places and weather from Open-Meteo: free, no key, only the home's coordinates leave the server. */
class WeatherService {
	/**
	 * Places matching `query`, in French then English names.
	 *
	 * @throws When Open-Meteo can't be reached.
	 */
	async search(query: string): Promise<HomeLocation[]> {
		const url = new URL(searchUrl);
		url.search = new URLSearchParams({
			name: query,
			count: "6",
			language: "fr",
			format: "json",
		}).toString();
		const body = (await this.#get(url)) as { results?: Found[] };
		return (body.results ?? []).map((found) => ({
			place: [found.name, found.admin1, found.country]
				.filter(Boolean)
				.join(", "),
			latitude: found.latitude,
			longitude: found.longitude,
			timezone: found.timezone ?? "UTC",
		}));
	}

	/**
	 * Today's and tomorrow's weather where `location` is, sunrise and sunset in UTC.
	 *
	 * @throws When Open-Meteo can't be reached.
	 */
	async forecast(location: HomeLocation): Promise<Weather> {
		const url = new URL(forecastUrl);
		url.search = new URLSearchParams({
			latitude: String(location.latitude),
			longitude: String(location.longitude),
			current:
				"temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m",
			daily:
				"weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
			timezone: location.timezone,
			forecast_days: "2",
		}).toString();
		const body = (await this.#get(url)) as Forecast;
		const utc = (local: string) =>
			new Date(
				Date.parse(`${local}Z`) - body.utc_offset_seconds * 1000,
			).toISOString();
		return {
			temperature: body.current.temperature_2m,
			feelsLike: body.current.apparent_temperature ?? null,
			code: body.current.weather_code,
			isDay: body.current.is_day === 1,
			windSpeed: body.current.wind_speed_10m ?? null,
			days: body.daily.time.map((date, index) => ({
				date,
				code: body.daily.weather_code[index] ?? 3,
				min: body.daily.temperature_2m_min[index] ?? 0,
				max: body.daily.temperature_2m_max[index] ?? 0,
				sunrise: utc(body.daily.sunrise[index] ?? `${date}T06:00`),
				sunset: utc(body.daily.sunset[index] ?? `${date}T18:00`),
			})),
		};
	}

	/**
	 * The outside temperatures of each whole local day where `location` is, over the last three months, oldest first;
	 * today, unfinished, is left out.
	 *
	 * @throws When Open-Meteo can't be reached.
	 */
	async past(location: HomeLocation): Promise<WeatherDay[]> {
		const url = new URL(forecastUrl);
		url.search = new URLSearchParams({
			latitude: String(location.latitude),
			longitude: String(location.longitude),
			daily: dailyFields,
			timezone: location.timezone,
			past_days: String(pastDays),
			forecast_days: "1",
		}).toString();
		const body = (await this.#get(url)) as Past;
		const today = body.daily.time.at(-1);
		return this.#days(body).filter((entry) => entry.date !== today);
	}

	/**
	 * Stores the outside temperatures of `home`'s last two years, as long as energy readings are kept: the archive, then
	 * the last three months over it, since the archive runs a few days behind. Returns how many days it stored.
	 *
	 * @throws When `home` has no location or Open-Meteo can't be reached.
	 */
	async backfill(home: HomeDTO, now = new Date()): Promise<number> {
		const location = home.location;
		if (!location) {
			throw new Error("Set the home's location first.");
		}
		const day = (back: number) =>
			new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone }).format(
				new Date(now.getTime() - back * dayMs),
			);
		const url = new URL(archiveUrl);
		url.search = new URLSearchParams({
			latitude: String(location.latitude),
			longitude: String(location.longitude),
			daily: dailyFields,
			timezone: location.timezone,
			start_date: day(archiveDays),
			end_date: day(1),
		}).toString();
		const archived = this.#days((await this.#get(url)) as Past);
		const recent = await this.past(location);
		WeatherDayDTO.record(home.id, archived);
		WeatherDayDTO.record(home.id, recent);
		return new Set([...archived, ...recent].map((entry) => entry.date)).size;
	}

	/**
	 * Reads the weather of `home` and records it, and the past days' temperatures when yesterday isn't stored yet; never
	 * throws, a failed read keeps what was there.
	 */
	async refresh(home: HomeDTO, now = new Date()): Promise<void> {
		const location = home.location;
		if (!location) {
			return;
		}
		try {
			home.saveWeather(await this.forecast(location));
			const yesterday = new Intl.DateTimeFormat("en-CA", {
				timeZone: location.timezone,
			}).format(new Date(now.getTime() - dayMs));
			if ((WeatherDayDTO.latest(home.id) ?? "") < yesterday) {
				WeatherDayDTO.record(home.id, await this.past(location));
			}
		} catch (error) {
			logger.warn("Weather read failed", { home: home.id }, error);
		}
	}

	#days({ daily }: Past): WeatherDay[] {
		return daily.time.flatMap((date, index) => {
			const min = daily.temperature_2m_min[index];
			const max = daily.temperature_2m_max[index];
			const mean = daily.temperature_2m_mean[index];
			return typeof min === "number" &&
				typeof max === "number" &&
				typeof mean === "number"
				? [{ date, min, mean, max, code: daily.weather_code[index] ?? 3 }]
				: [];
		});
	}

	async #get(url: URL): Promise<unknown> {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!response.ok) {
			throw new Error(`Open-Meteo answered ${response.status}.`);
		}
		return response.json();
	}
}

export const weatherService = new WeatherService();
