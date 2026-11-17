<script lang="ts">
	import { inferAttributeInputKind } from '../core/attributes.js';
	import type { FieldEditorProps } from '../runtime/fields.js';

	let { scope, name }: FieldEditorProps = $props();

	const spec = $derived(scope.spec(name));
	const multiline = $derived(spec ? inferAttributeInputKind(spec) === 'textarea' : false);
	const committed = $derived.by(() => {
		const value = scope.value(name);
		return typeof value === 'string' ? value : value == null ? '' : String(value);
	});
	let draft = $derived(committed);
	let element = $state<HTMLElement>();

	function commit(): void {
		const next = multiline ? draft.replace(/\n$/, '') : draft.replace(/\s*\n\s*/g, ' ');
		if (next !== committed) scope.set(name, next);
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			draft = committed;
			element?.blur();
		} else if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			element?.blur();
		}
	}
</script>

<!-- Makes the field its own editing host inside a container Block's editable content. -->
<span contenteditable="false"
	><span
		bind:this={element}
		bind:textContent={draft}
		class={['uncial-text-field', multiline && 'uncial-text-field--multiline']}
		contenteditable="plaintext-only"
		role="textbox"
		tabindex="0"
		aria-label={`Edit ${name}`}
		aria-multiline={multiline}
		data-uncial-field
		{onkeydown}
		onblur={commit}
	></span></span
>
