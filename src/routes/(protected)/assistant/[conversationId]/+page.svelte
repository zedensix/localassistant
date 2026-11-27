<script lang="ts">
	import AssistantChat from "#lib/components/assistant/assistant-chat.svelte";

	const { data } = $props();
</script>

{#key data.conversation.id}
	<AssistantChat
		conversationId={data.conversation.id}
		messages={data.messages}
		firstName={data.user.name.split(" ")[0] ?? ""}
	/>
{/key}
