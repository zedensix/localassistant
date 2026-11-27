import { resolve } from "$app/paths";
import { fail, redirect } from "@sveltejs/kit";

import { AssistantConversationDTO } from "#lib/dto/assistant-conversation.js";
import {
	conversationRemoveSchema,
	conversationRenameSchema,
} from "#lib/server/validation/assistant.js";
import { parseForm } from "#lib/server/validation/form.js";

export const actions = {
	rename: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(
			conversationRenameSchema,
			await request.formData(),
		);
		if (!parsed.success) {
			return fail(400, {
				errors: parsed.errors,
				error: Object.values(parsed.errors).flat()[0],
			});
		}
		const conversation = AssistantConversationDTO.find(
			parsed.data.conversationId,
			locals.user.id,
		);
		if (!conversation) {
			return fail(404, { error: "That conversation is gone." });
		}
		conversation.rename(parsed.data.title);
		return { renamed: true };
	},
	remove: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(
			conversationRemoveSchema,
			await request.formData(),
		);
		if (!parsed.success) {
			return fail(400, { error: "That conversation is gone." });
		}
		AssistantConversationDTO.find(
			parsed.data.conversationId,
			locals.user.id,
		)?.delete();
		if (parsed.data.current) {
			redirect(303, resolve("/(protected)/assistant"));
		}
		return { removed: true };
	},
};
