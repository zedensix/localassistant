import { command, getRequestEvent, query } from "$app/server";

import { AssistantConversationDTO } from "#lib/dto/assistant-conversation.js";
import { assistant } from "#lib/server/assistant/assistant.js";
import { access } from "#lib/server/auth/access.js";
import { homes } from "#lib/server/house/homes.js";
import {
	assistantQuestionSchema,
	conversationSearchSchema,
} from "#lib/server/validation/assistant.js";

export const askAssistant = command(
	assistantQuestionSchema,
	({ conversationId, text }) => {
		const user = access.requireUser();
		return assistant.converse(
			homes.current(getRequestEvent().cookies),
			{ id: user.id, name: user.name },
			conversationId,
			text,
		);
	},
);

export const searchConversations = query(conversationSearchSchema, ({ term }) =>
	AssistantConversationDTO.search(access.requireUser().id, term),
);
