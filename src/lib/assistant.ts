export const assistantRoles = ["user", "assistant"] as const;
export type AssistantRole = (typeof assistantRoles)[number];

export interface AssistantTurn {
	role: AssistantRole;
	text: string;
}

export interface AssistantMessageLine extends AssistantTurn {
	id: number;
	thinking: string | null;
	actions: string[];
	createdAt: Date;
}

export interface AssistantSearchHit {
	id: string;
	title: string;
	updatedAt: Date;
	snippet: string | null;
}
