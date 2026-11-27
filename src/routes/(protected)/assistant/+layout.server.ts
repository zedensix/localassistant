import { AssistantConversationDTO } from "#lib/dto/assistant-conversation.js";
import { assistant } from "#lib/server/assistant/assistant.js";

export const load = async ({ parent, depends }) => {
	const { user } = await parent();
	depends("app:assistant");
	return {
		configured: assistant.configured(),
		conversations: AssistantConversationDTO.forUser(user.id).map(
			(conversation) => conversation.toJSON(),
		),
	};
};
