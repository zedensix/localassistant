<script lang="ts">
	import AssistantChat from "#lib/components/assistant/assistant-chat.svelte";

	const { data } = $props();
</script>

<AssistantChat
	conversationId={null}
	messages={[]}
	firstName={data.user.name.split(" ")[0] ?? ""}
/>
