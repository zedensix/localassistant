import {
	afterEach,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	spyOn,
	test,
} from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import { secrets } from "#lib/server/core/secrets.js";
import { devices } from "#lib/server/devices/devices.js";
import { energy } from "#lib/server/house/energy.js";
import { pluginSetup } from "#lib/server/plugins/setup.js";
import {
	addDeviceSchema,
	editDeviceSchema,
} from "#lib/server/validation/plugins.js";

import { homeId, resetDatabase } from "../database.js";
import { addDevice, hosted, seen } from "./support.js";

const plugin = hosted("linky");
const linky = {
	read: (device: DeviceDTO, now?: Date) =>
		(
			plugin.plugin as {
				read(device: unknown, context: unknown, now?: Date): Promise<unknown>;
			}
		).read(seen(device), plugin.context, now),
};
const fields = plugin.manifest.device?.fields ?? [];
const linkySchema = addDeviceSchema(fields);
const editLinkySchema = editDeviceSchema(fields);

let answer: () => Response | Promise<Response>;
const urls: string[] = [];
const hourMs = 60 * 60_000;
let token = "";

function addLinky(withToken = true) {
	token = `token-${crypto.randomUUID()}`;
	return addDevice({
		kind: "linky",
		name: "Linky",
		externalId: "12345678901234",
		fields: { prm: "12345678901234" },
		secrets: withToken ? { token } : undefined,
	});
}

const daily = (values: [string, number | null][]) =>
	Response.json({
		idPrm: "12345678901234",
		grandeur: [
			{
				unite: "Wh",
				points: values.map(([d, value]) => ({
					d,
					v: value === null ? null : String(value),
				})),
			},
		],
	});

beforeEach(() => {
	setSystemTime(new Date("2026-10-28T10:00:00Z"));
	resetDatabase();
	urls.length = 0;
	spyOn(globalThis, "fetch").mockImplementation((async (input: string) => {
		urls.push(input);
		return answer();
	}) as unknown as typeof fetch);
});

afterEach(() => {
	setSystemTime();
	(globalThis.fetch as unknown as { mockRestore: () => void }).mockRestore();
});

describe("Linky online", () => {
	test("stores the daily use as a counter the energy charts read, and keeps it until the next day is due", async () => {
		const meter = addLinky();
		const now = new Date("2026-10-28T10:00:00Z");
		answer = () =>
			daily([
				["2026-10-27", 12_500],
				["2026-10-26", 10_000],
				["2026-10-25", Number.NaN],
				["2026-10-24", null],
			]);
		await devices.refresh(meter);
		expect(urls[0]).toContain("/api/consommation_quotidienne?");
		expect(urls[0]).toContain("pointId=12345678901234");
		expect(DeviceDTO.find(meter.id)?.state).toEqual({
			type: "linky",
			day: "2026-10-27",
			kilowattHours: 12.5,
		});
		expect(
			EnergyReadingDTO.since([meter.id], new Date(0)).map(
				(reading) => reading.toJSON().total,
			),
		).toEqual([10, 22.5]);
		const report = energy.report(
			homeId(),
			"Europe/Paris",
			{ from: "2026-10-27", to: "2026-10-28" },
			now,
		);
		expect(report.house.metered).toBe(true);
		expect(report.house.total).toBe(12.5);
		expect(report.profile.hours).toBeNull();
		const summary = energy.summaries(homeId(), "Europe/Paris", now)[meter.id];
		expect(summary?.days).toHaveLength(7);
		expect(summary?.days.at(-2)).toEqual({
			key: "2026-10-27",
			kilowattHours: 12.5,
		});
		expect(summary?.thisMonth).toBe(12.5);

		answer = () => daily([["2026-10-28", 9000]]);
		const fresh = DeviceDTO.find(meter.id) as DeviceDTO;
		expect(
			await linky.read(fresh, new Date("2026-10-28T20:00:00Z")),
		).toMatchObject({ day: "2026-10-27" });
		expect(urls).toHaveLength(1);
		expect(
			await linky.read(fresh, new Date("2026-10-29T10:00:00Z")),
		).toMatchObject({ day: "2026-10-28" });
		expect(urls).toHaveLength(2);
		expect(
			EnergyReadingDTO.since([meter.id], new Date(0)).at(-1)?.toJSON().total,
		).toBe(31.5);
	});

	test("a late day is fetched again hourly, never every poll, and a failure stays until then", async () => {
		const meter = addLinky();
		meter.saveState({ type: "linky", day: "2026-10-26", kilowattHours: 10 });
		const at = (hours: number) => new Date(Date.now() + hours * hourMs);
		answer = () => daily([["2026-10-26", 10_000]]);
		expect(
			await linky.read(DeviceDTO.find(meter.id) as DeviceDTO, at(0)),
		).toMatchObject({ day: "2026-10-26" });
		expect(
			await linky.read(DeviceDTO.find(meter.id) as DeviceDTO, at(0.5)),
		).toMatchObject({ day: "2026-10-26" });
		expect(urls).toHaveLength(1);
		answer = () => new Response("", { status: 401 });
		await expect(
			linky.read(DeviceDTO.find(meter.id) as DeviceDTO, at(1)),
		).rejects.toThrow("refused the token");
		await expect(
			linky.read(DeviceDTO.find(meter.id) as DeviceDTO, at(1.5)),
		).rejects.toThrow("refused the token");
		expect(urls).toHaveLength(2);
	});

	test("days without anything new from Enedis put the meter in error, with where to get a token", async () => {
		const meter = addLinky();
		answer = () => daily([["2026-10-20", 8000]]);
		await devices.refresh(meter);
		const stale = DeviceDTO.find(meter.id)?.toJSON();
		expect(stale?.stateError).toBe(
			"Enedis has sent nothing since 2026-10-20: check the consent on https://conso.boris.sh and paste a new token.",
		);
		expect(
			EnergyReadingDTO.since([meter.id], new Date(0)).at(-1)?.toJSON().total,
		).toBe(8);
		answer = () => daily([]);
		await expect(linky.read(addLinky())).rejects.toThrow(
			"Enedis has no readings for this PRM",
		);
	});

	test("checks the form's PRM and token, and an added meter, against conso.boris.sh at once", async () => {
		answer = () => daily([["2026-10-27", 12_340]]);
		expect(
			await plugin.plugin.test?.(
				{ prm: "12345678901234", token: "t".repeat(30) },
				plugin.context,
			),
		).toBe("Enedis has readings up to 2026-10-27: 12.34 kWh that day.");
		const meter = addLinky();
		meter.saveState({ type: "linky", day: "2026-10-27", kilowattHours: 12 });
		expect(await devices.check(meter)).toContain("up to 2026-10-27");
		expect(urls.at(-1)).toContain("pointId=12345678901234");
		answer = () => new Response("", { status: 403 });
		await expect(devices.check(meter)).rejects.toThrow(
			"get a new one for this PRM on https://conso.boris.sh",
		);
		expect(DeviceDTO.find(meter.id)?.toJSON().stateError).toContain(
			"refused the token",
		);
	});

	test("explains a refused token, an outage and a missing token", async () => {
		answer = () => new Response("", { status: 403 });
		expect(linky.read(addLinky())).rejects.toThrow("refused the token");
		answer = () => new Response("", { status: 500 });
		expect(linky.read(addLinky())).rejects.toThrow("answered 500");
		answer = () =>
			Response.json(
				{
					status: 400,
					message: "The Enedis API returned an error",
					error: {
						error: "ADAM-DC-0007",
						error_description:
							"Le client n'est pas titulaire du point demandé.",
					},
				},
				{ status: 400 },
			);
		expect(linky.read(addLinky())).rejects.toThrow(
			"Enedis says this account doesn't hold that PRM anymore",
		);
		answer = () =>
			Response.json(
				{ status: 400, message: "The Enedis API returned an error" },
				{ status: 400 },
			);
		expect(linky.read(addLinky())).rejects.toThrow(
			"conso.boris.sh answered 400: The Enedis API returned an error",
		);
		answer = () => Promise.reject(new Error("offline"));
		expect(linky.read(addLinky())).rejects.toThrow("can't be reached");
		resetDatabase();
		expect(linky.read(addLinky(false))).rejects.toThrow(
			"no token: get one on https://conso.boris.sh",
		);
	});

	test("another PRM or token reads the meter again at once, an empty token keeps the old one", async () => {
		const meter = addLinky();
		meter.saveState({ type: "linky", day: "2026-10-27", kilowattHours: 12 });
		await pluginSetup.editDevice(
			plugin,
			meter,
			{ name: "Meter", roomId: null },
			{ prm: "99999999999999" },
		);
		const relinked = DeviceDTO.find(meter.id);
		expect(relinked?.toJSON()).toMatchObject({
			name: "Meter",
			externalId: "99999999999999",
			state: null,
			stateAt: null,
		});
		expect(secrets.decrypt(relinked?.encryptedSecrets().token ?? "")).toBe(
			token,
		);
		expect(relinked?.toJSON().fields).toEqual({ prm: "99999999999999" });
		expect(
			editLinkySchema.parse({
				id: meter.id,
				name: "Meter",
				"value:prm": "99999999999999",
				"value:token": "",
			}).values.token,
		).toBeUndefined();
		expect(
			editLinkySchema.safeParse({
				id: meter.id,
				name: "Meter",
				"value:prm": "99999999999999",
				"value:token": "short",
			}).success,
		).toBe(false);
	});

	test("the form wants a 14-digit PRM and a token", () => {
		expect(
			linkySchema.safeParse({
				plugin: "linky",
				name: "Linky",
				"value:prm": "12345678901234",
				"value:token": "t".repeat(30),
			}).success,
		).toBe(true);
		expect(
			linkySchema.safeParse({
				plugin: "linky",
				name: "Linky",
				"value:prm": "1234",
				"value:token": "t".repeat(30),
			}).success,
		).toBe(false);
	});
});
