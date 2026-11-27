<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CheckIcon from "@lucide/svelte/icons/check";
	import MessagesSquareIcon from "@lucide/svelte/icons/messages-square";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import SquarePenIcon from "@lucide/svelte/icons/square-pen";

	import ConversationList from "#lib/components/assistant/conversation-list.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { enhanceToast } from "#lib/toast.js";

	const { children, data } = $props();

	let listOpen = $state(false);
	let renaming = $state<{ id: string; title: string } | undefined>();
	let renameOpen = $state(false);
	let errors = $state<Record<string, string[]>>({});

	const currentId = $derived(page.params.conversationId ?? null);
	const current = $derived(
		data.conversations.find((conversation) => conversation.id === currentId),
	);

	setPageTitle(() => current?.title ?? "Assistant");

	function rename(conversation: { id: string; title: string }) {
		listOpen = false;
		renaming = conversation;
		errors = {};
		renameOpen = true;
	}
</script>

<div class="flex h-full">
	{#if data.configured}
		<aside
			class="bg-chrome hidden w-72 shrink-0 flex-col border-r pt-safe-top md:flex"
		>
			<ConversationList
				conversations={data.conversations}
				{currentId}
				onRename={rename}
			/>
		</aside>
	{/if}
	<div class="flex min-w-0 flex-1 flex-col">
		<header
			class="bg-chrome flex shrink-0 items-center gap-2 border-b px-2 pt-safe-top backdrop-blur-2xl md:px-6"
		>
			<div class="flex h-14 w-full items-center gap-2 md:h-16">
				<IconButton
					label="Back to Home"
					icon={ArrowLeftIcon}
					href={resolve("/(protected)")}
					class="md:hidden"
				/>
				<SparklesIcon class="text-primary hidden size-5 shrink-0 md:block" />
				<h1 class="flex-1 truncate font-semibold">
					{current?.title ?? "Assistant"}
				</h1>
				{#if data.configured}
					<IconButton
						label="Conversations"
						icon={MessagesSquareIcon}
						class="md:hidden"
						onclick={() => (listOpen = true)}
					/>
					{#if currentId}
						<IconButton
							label="New conversation"
							icon={SquarePenIcon}
							href={resolve("/(protected)/assistant")}
						/>
					{/if}
				{/if}
			</div>
		</header>

		{#if data.configured}
			{@render children()}
		{:else}
			<div class="flex flex-1 items-center justify-center p-6">
				<div class="flex max-w-sm flex-col items-center gap-4 text-center">
					<SparklesIcon class="text-primary size-10" />
					<h2 class="text-lg font-semibold">The assistant is off</h2>
					<p class="text-muted-foreground text-sm">
						{data.isAdmin
							? "Add a Claude API key to turn it on: then everyone can ask about the house and have it drive devices."
							: "Ask an admin to turn it on in Admin, AI."}
					</p>
					{#if data.isAdmin}
						<Button
							class="h-11 rounded-xl px-5"
							href={resolve("/(protected)/admin/ai")}>Turn it on</Button
						>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<ResponsiveSheet bind:open={listOpen} title="Conversations">
	<div class="flex max-h-[70dvh] flex-col">
		<ConversationList
			conversations={data.conversations}
			{currentId}
			onNavigate={() => (listOpen = false)}
			onRename={rename}
		/>
	</div>
</ResponsiveSheet>

<ResponsiveSheet bind:open={renameOpen} title="Rename conversation">
	{#if renaming}
		<form
			method="POST"
			action="{resolve('/(protected)/assistant')}?/rename"
			class="flex flex-col gap-4 pb-6"
			use:enhance={enhanceToast({
				loading: "Renaming",
				success: "Renamed.",
				onFailure: (result) => {
					errors = (result?.errors as Record<string, string[]>) ?? {};
				},
				onSuccess: () => {
					renameOpen = false;
				},
			})}
		>
			<input type="hidden" name="conversationId" value={renaming.id} />
			<Field.Field>
				<Field.Label for="rename-conversation">Name</Field.Label>
				<Input
					id="rename-conversation"
					name="title"
					value={renaming.title}
					maxlength={80}
					required
					class="h-11"
				/>
				<Field.Error errors={errors.title?.map((message) => ({ message }))} />
			</Field.Field>
			<Button type="submit" class="h-11 self-start rounded-xl px-5"
				><CheckIcon />Save</Button
			>
		</form>
	{/if}
</ResponsiveSheet>
