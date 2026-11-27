<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import SearchIcon from "@lucide/svelte/icons/search";
	import SquarePenIcon from "@lucide/svelte/icons/square-pen";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import type { AssistantSearchHit } from "#lib/assistant.js";
	import ItemMenu, { type MenuAction } from "#lib/components/item-menu.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { searchConversations } from "#lib/remote/assistant.remote.js";
	import { toastError } from "#lib/toast.js";
	import { cn } from "#lib/utils.js";

	interface Conversation {
		id: string;
		title: string;
		updatedAt: Date;
	}

	interface Props {
		conversations: Conversation[];
		currentId: string | null;
		onNavigate?: () => void;
		onRename: (conversation: Conversation) => void;
	}

	const { conversations, currentId, onNavigate, onRename }: Props = $props();

	const dayMs = 24 * 60 * 60_000;
	const monthFormat = new Intl.DateTimeFormat(undefined, {
		month: "long",
		year: "numeric",
	});

	let term = $state("");
	let results = $state<AssistantSearchHit[] | null>(null);
	let searching = $state(false);
	let searchError = $state<string | null>(null);

	const groups = $derived.by(() => {
		const startOf = (date: Date) =>
			new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
		const today = startOf(new Date());
		const labelled: { label: string; items: Conversation[] }[] = [];
		for (const conversation of conversations) {
			const days = Math.round(
				(today - startOf(conversation.updatedAt)) / dayMs,
			);
			const label =
				days <= 0
					? "Today"
					: days === 1
						? "Yesterday"
						: days < 7
							? "Previous 7 days"
							: days < 30
								? "Previous 30 days"
								: monthFormat.format(conversation.updatedAt);
			const last = labelled.at(-1);
			if (last?.label === label) {
				last.items.push(conversation);
			} else {
				labelled.push({ label, items: [conversation] });
			}
		}
		return labelled;
	});

	async function search(query: string) {
		searching = true;
		try {
			const found = await searchConversations({ term: query });
			if (term.trim() === query) {
				results = found;
				searchError = null;
			}
		} catch (error) {
			searchError = toastError(error);
		} finally {
			searching = false;
		}
	}

	$effect(() => {
		const query = term.trim();
		if (!query) {
			results = null;
			searchError = null;
			return;
		}
		const timer = setTimeout(() => void search(query), 250);
		return () => clearTimeout(timer);
	});

	function actionsFor(conversation: Conversation): MenuAction[] {
		return [
			{
				label: "Rename",
				icon: PencilIcon,
				onSelect: () => onRename(conversation),
			},
			{
				label: "Delete",
				icon: Trash2Icon,
				destructive: true,
				form: {
					action: `${resolve("/(protected)/assistant")}?/remove`,
					fields: {
						conversationId: conversation.id,
						current: String(conversation.id === currentId),
					},
					loading: "Deleting",
					success: "Conversation deleted.",
					confirm: {
						title: `Delete ${conversation.title}?`,
						description: "It goes for good, with everything said in it.",
						confirmLabel: "Delete",
					},
				},
			},
		];
	}
</script>

{#snippet row(conversation: Conversation, snippet: string | null)}
	<ItemMenu
		title={conversation.title}
		actions={actionsFor(conversation)}
		class={cn(
			"hover:bg-accent/50 rounded-xl pr-1",
			conversation.id === currentId && "bg-accent",
		)}
	>
		<a
			href={resolve("/(protected)/assistant/[conversationId]", {
				conversationId: conversation.id,
			})}
			class="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-2 pl-3"
			aria-current={conversation.id === currentId ? "page" : undefined}
			onclick={() => onNavigate?.()}
		>
			<span class="truncate text-sm">{conversation.title}</span>
			{#if snippet}
				<span class="text-muted-foreground line-clamp-2 text-xs">{snippet}</span
				>
			{/if}
		</a>
	</ItemMenu>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col gap-3">
	<div class="flex flex-col gap-2 px-3 pt-3">
		<Button
			href={resolve("/(protected)/assistant")}
			variant="outline"
			class="h-11 justify-start rounded-xl px-3"
			onclick={() => onNavigate?.()}><SquarePenIcon />New conversation</Button
		>
		<div class="relative">
			<SearchIcon
				class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
			/>
			<Input
				bind:value={term}
				type="search"
				aria-label="Search conversations"
				placeholder="Search conversations"
				class="h-11 pl-9"
			/>
			{#if searching}
				<Spinner
					class="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
				/>
			{/if}
		</div>
	</div>
	<nav
		class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4"
		aria-label="Conversations"
	>
		{#if searchError}
			<p class="text-destructive px-3 py-2 text-sm" role="alert">
				{searchError}
			</p>
		{:else if results}
			{#each results as hit (hit.id)}
				{@render row(hit, hit.snippet)}
			{:else}
				<p class="text-muted-foreground px-3 py-2 text-sm">
					Nothing said matches "{term.trim()}".
				</p>
			{/each}
		{:else}
			{#each groups as group (group.label)}
				<p class="text-muted-foreground px-3 pt-3 pb-1 text-xs font-medium">
					{group.label}
				</p>
				{#each group.items as conversation (conversation.id)}
					{@render row(conversation, null)}
				{/each}
			{:else}
				<p class="text-muted-foreground px-3 py-2 text-sm">
					Your conversations show up here.
				</p>
			{/each}
		{/if}
	</nav>
</div>
