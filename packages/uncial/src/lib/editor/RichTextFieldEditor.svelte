<script lang="ts">
	import type { RichTextFeatureSelection } from '../core/types.js';
	import type { FieldEditorProps } from '../runtime/fields.js';
	import RichTextAttributeEditor from './RichTextAttributeEditor.svelte';

	let { scope, name, features }: FieldEditorProps & { features?: RichTextFeatureSelection } =
		$props();

	const spec = $derived(scope.spec(name));
	const committed = $derived(scope.value(name));
	let draft: unknown;

	function commit(event: FocusEvent): void {
		const wrapper = event.currentTarget as HTMLElement;
		if (wrapper.contains(event.relatedTarget as Node | null) || draft === undefined) return;
		const next = draft;
		draft = undefined;
		if (JSON.stringify(next) !== JSON.stringify(committed)) scope.set(name, next);
	}
</script>

<div class="uncial-richtext-field" data-uncial-field onfocusout={commit}>
	<RichTextAttributeEditor
		value={committed}
		features={features ?? spec?.richText?.features}
		placeholder={spec?.richText?.placeholder ?? spec?.placeholder ?? name}
		inline
		onChange={(value) => (draft = value)}
	/>
</div>
