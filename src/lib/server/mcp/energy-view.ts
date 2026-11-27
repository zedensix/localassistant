import type { z } from "zod";

import type { HomeDTO } from "#lib/dto/home.js";
import { getSetting } from "#lib/dto/setting.js";
import { automations } from "#lib/server/automations/automations.js";
import { energy, type EnergyChoice } from "#lib/server/house/energy.js";
import type { energyQuestionSchema } from "#lib/server/validation/energy.js";

const weekdays = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
];

/** The house's electricity use as AI apps and the in-app assistant read it. */
class EnergyView {
	readonly description =
		"Electricity used over a span, in kWh: the house per bucket (hours for a day or three, days up to three months, months beyond) with its total, the same span before, the daily average, the peak and quietest buckets and the projection, the average per weekday and per hour, and each metered appliance's total, share and buckets, and the outside temperature of each day (min, mean and max in °C) to tell heating from habits. The house is the Linky when there is one; a Linky online only has whole days and is a day behind: ask for four days or more to compare days, and today has nothing from it yet.";

	/**
	 * `home`'s use over the span `question` asks for, this month when it asks for none: the house, its averages per
	 * weekday and hour, each appliance an admin didn't hide from AI, and the outside temperature of each day.
	 */
	answer(home: HomeDTO, question: z.infer<typeof energyQuestionSchema>) {
		const { preset, month, from, to } = question;
		const choice: EnergyChoice =
			from && to
				? { from, to }
				: month
					? { month }
					: { preset: preset ?? "this-month" };
		const report = energy.report(home.id, automations.timeZoneOf(home), choice);
		const hidden = new Set(getSetting("aiHiddenDevices"));
		return {
			range: report.range,
			today: report.today,
			house: report.house,
			averagePerWeekday: Object.fromEntries(
				weekdays.map((day, index) => [day, report.profile.weekdays[index]]),
			),
			averagePerHour: report.profile.hours,
			outside: report.weather.map(({ date, min, mean, max }) => ({
				date,
				min,
				mean,
				max,
			})),
			appliances: report.appliances
				.filter((appliance) => !hidden.has(appliance.deviceId))
				.map(({ deviceId, name, total, share, buckets }) => ({
					deviceId,
					name,
					total,
					share,
					buckets,
				})),
		};
	}
}

export const energyView = new EnergyView();
