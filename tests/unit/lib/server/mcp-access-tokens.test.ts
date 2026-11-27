import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import * as oauth from "better-auth/oauth2";

import { AiAppDTO } from "#lib/dto/ai-app.js";

const claimsFor = new Map<string, Record<string, unknown>>();
const realVerify = oauth.verifyJwsAccessToken;

mock.module("better-auth/oauth2", () => ({
	...oauth,
	verifyJwsAccessToken: (
		token: string,
		...rest: Parameters<typeof realVerify> extends [unknown, ...infer Tail]
			? Tail
			: never
	) => {
		const claims = claimsFor.get(token);
		return claims ? Promise.resolve(claims) : realVerify(token, ...rest);
	},
}));

const { mcpAccessTokens } = await import("#lib/server/mcp/access-tokens.js");

const resource = new URL("https://home.example/mcp");

function request(token: string) {
	return new Request(resource, {
		method: "POST",
		headers: { authorization: `Bearer ${token}` },
	});
}

describe("MCP access tokens", () => {
	afterEach(() => claimsFor.clear());

	test("a valid token for an allowed app acts for its account", async () => {
		const allowed = spyOn(AiAppDTO, "allowed").mockReturnValue(true);
		claimsFor.set("good", {
			sub: "nico",
			azp: "claude",
			scope: "openid profile",
			exp: 4_000_000_000,
		});
		expect(
			await mcpAccessTokens.verify(request("good"), resource),
		).toMatchObject({
			token: "good",
			clientId: "claude",
			scopes: ["openid", "profile"],
			expiresAt: 4_000_000_000,
			resource,
			extra: { userId: "nico" },
		});
		expect(allowed).toHaveBeenCalledWith("nico", "claude");
		allowed.mockRestore();
	});

	test("a forged token, a removed app or missing claims get the sign-in challenge", async () => {
		const allowed = spyOn(AiAppDTO, "allowed").mockReturnValue(false);
		claimsFor.set("removed", {
			sub: "nico",
			azp: "claude",
			exp: 4_000_000_000,
		});
		claimsFor.set("anonymous", { exp: 4_000_000_000 });
		for (const token of ["forged", "removed", "anonymous"]) {
			const answer = await mcpAccessTokens.verify(request(token), resource);
			expect(answer).toBeInstanceOf(Response);
			expect((answer as Response).status).toBe(401);
		}
		allowed.mockRestore();
	});
});
