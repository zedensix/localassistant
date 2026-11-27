import { error } from "@sveltejs/kit";

import { AssistantConversationDTO } from "#lib/dto/assistant-conversation.js";
import { AssistantMessageDTO } from "#lib/dto/assistant-message.js";

export const load = async ({ parent, params }) => {
	const { user } = await parent();
	const conversation = AssistantConversationDTO.find(
		params.conversationId,
		user.id,
	);
	if (!conversation) {
		error(404, "That conversation is gone.");
	}
	return {
		conversation: conversation.toJSON(),
		messages: AssistantMessageDTO.inConversation(conversation.id),
	};
};
