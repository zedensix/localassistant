import { asc, eq } from "drizzle-orm";

import type { AssistantMessageLine, AssistantRole } from "#lib/assistant.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { assistantMessage } from "#lib/server/db/schema.js";

/** The turns of every assistant conversation, oldest first; there's no row object, only finders. */
export class AssistantMessageDTO {
	/** Every turn of `conversationId`, oldest first. */
	static inConversation(conversationId: string): AssistantMessageLine[] {
		return databaseConnection
			.get()
			.select({
				id: assistantMessage.id,
				role: assistantMessage.role,
				text: assistantMessage.text,
				thinking: assistantMessage.thinking,
				actions: assistantMessage.actions,
				createdAt: assistantMessage.createdAt,
			})
			.from(assistantMessage)
			.where(eq(assistantMessage.conversationId, conversationId))
			.orderBy(asc(assistantMessage.id))
			.all()
			.map((row) => ({
				...row,
				actions: (row.actions as string[] | null) ?? [],
			}));
	}

	/** Appends one turn to `conversationId`. */
	static add(
		conversationId: string,
		turn: {
			role: AssistantRole;
			text: string;
			thinking?: string | null;
			actions?: string[];
		},
		at = new Date(),
	): void {
		databaseConnection
			.get()
			.insert(assistantMessage)
			.values({
				conversationId,
				role: turn.role,
				text: turn.text,
				thinking: turn.thinking ?? null,
				actions: turn.actions && turn.actions.length > 0 ? turn.actions : null,
				createdAt: at,
			})
			.run();
	}
}
