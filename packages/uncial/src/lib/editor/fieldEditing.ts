import { getContext, setContext } from 'svelte';
import type { ImagePreviews } from '../shared/imagePreviews.js';

const FIELD_EDITING = Symbol('uncial.fieldEditing');

export interface FieldEditing {
	imagePreviews?: ImagePreviews;
}

export function setFieldEditing(editing: FieldEditing): void {
	setContext(FIELD_EDITING, editing);
}

export function getFieldEditing(): FieldEditing {
	return getContext<FieldEditing | undefined>(FIELD_EDITING) ?? {};
}
