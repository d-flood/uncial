<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import '../styles/uncial.css';

	export let editor: Editor | null = null;

	function toggleBold(): void {
		editor?.chain().focus().toggleBold().run();
	}

	function toggleItalic(): void {
		editor?.chain().focus().toggleItalic().run();
	}

	function setLink(): void {
		if (!editor) return;
		const href = window.prompt('Link URL');
		if (!href) return;
		editor.chain().focus().setLink({ href }).run();
	}

	function unsetLink(): void {
		editor?.chain().focus().unsetLink().run();
	}
</script>

<div class="uncial-toolbar">
	<button type="button" class:is-active={editor?.isActive('bold')} on:click={toggleBold}
		>Bold</button
	>
	<button type="button" class:is-active={editor?.isActive('italic')} on:click={toggleItalic}
		>Italic</button
	>
	<button type="button" class:is-active={editor?.isActive('link')} on:click={setLink}>Link</button>
	<button type="button" on:click={unsetLink}>Unlink</button>
</div>
