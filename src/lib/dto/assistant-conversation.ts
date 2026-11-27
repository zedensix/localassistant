import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { AssistantSearchHit } from "#lib/assistant.js";
import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import {
	assistantConversation,
	assistantMessage,
} from "#lib/server/db/schema.js";

export interface AssistantConversationRow {
	id: string;
	userId: string;
	title: string;
	createdAt: Date;
	updatedAt: Date;
}

const columns = {
	id: assistantConversation.id,
	userId: assistantConversation.userId,
	title: assistantConversation.title,
	createdAt: assistantConversation.createdAt,
	updatedAt: assistantConversation.updatedAt,
};

const snippetBefore = 40;
const snippetAfter = 100;

function contains(column: SQLiteColumn, needle: string): SQL {
	return sql`instr(lower(${column}), ${needle}) > 0`;
}

function snippet(text: string, needle: string): string {
	const flat = text.replaceAll(/\s+/g, " ").trim();
	const at = Math.max(0, flat.toLowerCase().indexOf(needle));
	const space = flat.indexOf(" ", Math.max(0, at - snippetBefore));
	const start =
		at > snippetBefore && space !== -1 && space < at ? space + 1 : 0;
	const end = Math.min(flat.length, at + needle.length + snippetAfter);
	return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/** One person's conversation with the in-app assistant; nobody else reads it. */
export class AssistantConversationDTO extends BaseDTO<AssistantConversationRow> {
	/** The conversations of `userId`, the latest first. */
	static forUser(userId: string, limit = 500): AssistantConversationDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(assistantConversation)
			.where(eq(assistantConversation.userId, userId))
			.orderBy(desc(assistantConversation.updatedAt))
			.limit(limit)
			.all()
			.map((row) => new AssistantConversationDTO(row));
	}

	/** The conversation with `id` when it belongs to `userId`. */
	static find(
		id: string,
		userId: string,
	): AssistantConversationDTO | undefined {
		const row = databaseConnection
			.get()
			.select(columns)
			.from(assistantConversation)
			.where(
				and(
					eq(assistantConversation.id, id),
					eq(assistantConversation.userId, userId),
				),
			)
			.get();
		return row ? new AssistantConversationDTO(row) : undefined;
	}

	/** Starts a conversation for `userId`. */
	static create(userId: string, title: string): AssistantConversationDTO {
		const row = databaseConnection
			.get()
			.insert(assistantConversation)
			.values({ userId, title })
			.returning(columns)
			.get();
		return new AssistantConversationDTO(row);
	}

	/**
	 * The conversations of `userId` whose title or any turn holds `term`, ignoring case, the latest first; each with the
	 * first matching turn around the term when a turn matched.
	 */
	static search(
		userId: string,
		term: string,
		limit = 50,
	): AssistantSearchHit[] {
		const needle = term.toLowerCase();
		const database = databaseConnection.get();
		const titled = database
			.select(columns)
			.from(assistantConversation)
			.where(
				and(
					eq(assistantConversation.userId, userId),
					contains(assistantConversation.title, needle),
				),
			)
			.all();
		const said = database
			.select({ ...columns, text: assistantMessage.text })
			.from(assistantMessage)
			.innerJoin(
				assistantConversation,
				eq(assistantMessage.conversationId, assistantConversation.id),
			)
			.where(
				and(
					eq(assistantConversation.userId, userId),
					contains(assistantMessage.text, needle),
				),
			)
			.orderBy(assistantMessage.id)
			.limit(1000)
			.all();
		const hits = new Map<string, AssistantSearchHit>();
		for (const row of said) {
			if (!hits.has(row.id) && row.text.trim() !== row.title) {
				hits.set(row.id, {
					id: row.id,
					title: row.title,
					updatedAt: row.updatedAt,
					snippet: snippet(row.text, needle),
				});
			}
		}
		for (const row of titled) {
			if (!hits.has(row.id)) {
				hits.set(row.id, {
					id: row.id,
					title: row.title,
					updatedAt: row.updatedAt,
					snippet: null,
				});
			}
		}
		return [...hits.values()]
			.toSorted(
				(first, second) =>
					second.updatedAt.getTime() - first.updatedAt.getTime(),
			)
			.slice(0, limit);
	}

	get id(): string {
		return this.row.id;
	}

	get title(): string {
		return this.row.title;
	}

	/** Renames the conversation. */
	rename(title: string): void {
		databaseConnection
			.get()
			.update(assistantConversation)
			.set({ title, updatedAt: this.row.updatedAt })
			.where(eq(assistantConversation.id, this.row.id))
			.run();
		this.row.title = title;
	}

	/** Moves the conversation to the top of its owner's list. */
	touch(at = new Date()): void {
		databaseConnection
			.get()
			.update(assistantConversation)
			.set({ updatedAt: at })
			.where(eq(assistantConversation.id, this.row.id))
			.run();
		this.row.updatedAt = at;
	}

	/** Deletes the conversation and every turn in it. */
	delete(): void {
		databaseConnection
			.get()
			.delete(assistantConversation)
			.where(eq(assistantConversation.id, this.row.id))
			.run();
	}
}
