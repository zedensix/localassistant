import {
	type AuthInfo,
	bearerAuthChallengeResponse,
	getOAuthProtectedResourceMetadataUrl,
	OAuthError,
	OAuthErrorCode,
	verifyBearerToken,
} from "@modelcontextprotocol/server";
import { verifyJwsAccessToken } from "better-auth/oauth2";

import { AiAppDTO } from "#lib/dto/ai-app.js";
import { authService } from "#lib/server/auth/auth.js";

const jwksCacheKey = {};

/** Checks the access tokens AI apps send to `/mcp`, issued by better-auth's OAuth provider. */
class McpAccessTokens {
	/**
	 * Who `request`'s bearer token for `resource` acts for, or the challenge that sends the AI app through sign-in and
	 * consent when the token is missing, expired, revoked or for an app the person no longer allows.
	 */
	async verify(request: Request, resource: URL): Promise<AuthInfo | Response> {
		const challenge = {
			resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource),
		};
		try {
			return await verifyBearerToken(request.headers.get("authorization"), {
				...challenge,
				expectedResource: resource,
				verifier: {
					verifyAccessToken: (token) => this.#claims(token, resource),
				},
			});
		} catch (error) {
			return bearerAuthChallengeResponse(error, challenge);
		}
	}

	/**
	 * The token's claims as the MCP server reads them, the account it acts for in `extra.userId`.
	 *
	 * @throws An invalid-token error when the signature, issuer or audience is wrong, or the person removed the app.
	 */
	async #claims(token: string, resource: URL): Promise<AuthInfo> {
		const claims = await verifyJwsAccessToken(token, {
			jwksFetch: () => authService.get().api.getJwks(),
			jwksCacheKey,
			verifyOptions: {
				issuer: `${resource.origin}/api/auth`,
				audience: resource.href,
			},
		}).catch(() => {
			throw new OAuthError(OAuthErrorCode.InvalidToken, "Sign in again.");
		});
		const userId = claims.sub;
		const clientId = typeof claims.azp === "string" ? claims.azp : undefined;
		if (!userId || !clientId || !AiAppDTO.allowed(userId, clientId)) {
			throw new OAuthError(OAuthErrorCode.InvalidToken, "Sign in again.");
		}
		return {
			token,
			clientId,
			scopes: typeof claims.scope === "string" ? claims.scope.split(" ") : [],
			expiresAt: claims.exp,
			resource,
			extra: { userId },
		};
	}
}

export const mcpAccessTokens = new McpAccessTokens();
