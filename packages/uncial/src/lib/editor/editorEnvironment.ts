import { getAllContexts, onDestroy } from 'svelte';
import type { BlockPage } from '../core/runtime.js';
import type { AttributeSpec, BlockRegistry } from '../core/types.js';
import { resolveImageSrc } from '../render/resolveImageSrc.js';
import { metaScope, setFieldHost } from '../runtime/fields.js';
import { toStoredValues, type ImagePreviews } from '../shared/imagePreviews.js';
import type { BlockEnvironment } from '../shared/tiptap.js';
import { setFieldEditing } from './fieldEditing.js';
import type { FileSource } from './fileSource.js';
import type { ImageSource } from './imageSource.js';
import type { DocumentMetaCommitResult, DocumentMetaController } from './metaController.js';
import ImageFieldEditor from './ImageFieldEditor.svelte';
import RichTextFieldEditor from './RichTextFieldEditor.svelte';
import TextFieldEditor from './TextFieldEditor.svelte';

/** The host's image source, with thumbnails of root-relative values under `base` unless it draws its own. */
export function withBaseThumbnails(
	source: ImageSource | undefined,
	base: () => string
): ImageSource | undefined {
	return (
		source && { ...source, thumbnail: source.thumbnail ?? ((src) => resolveImageSrc(src, base())) }
	);
}

/** The host's file source, linking root-relative values under `base` unless it links its own. */
export function withBaseLinks(
	source: FileSource | undefined,
	base: () => string
): FileSource | undefined {
	return source && { ...source, href: source.href ?? ((src) => resolveImageSrc(src, base())) };
}

export interface EditorEnvironmentOptions {
	base(): string;
	registry(): BlockRegistry;
	media(): ImageSource | null;
	page(): BlockPage;
	imagePreviews: ImagePreviews;
	metaController(): DocumentMetaController;
	metaFields(): ReadonlyMap<string, AttributeSpec<unknown>>;
	/** Receives the commit of a metadata Field edited in place. */
	onMetaCommit(result: DocumentMetaCommitResult): void;
}

export interface EditorEnvironment extends BlockEnvironment {
	/** Tells the Blocks that `page()` or `media()` may answer differently. */
	notify(): void;
}

/**
 * The Block environment of an editing surface. Created during component initialisation, it also
 * makes the Field components of that component, and of its Blocks, editable, and revokes the image
 * previews when the component is destroyed.
 */
export function createEditorEnvironment(options: EditorEnvironmentOptions): EditorEnvironment {
	const listeners = new Set<() => void>();
	return {
		page: options.page,
		media: options.media,
		base: options.base,
		context: provideFieldEditing(options),
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		notify: () => listeners.forEach((listener) => listener())
	};
}

function provideFieldEditing(options: EditorEnvironmentOptions): Map<unknown, unknown> | undefined {
	const { base, imagePreviews } = options;
	try {
		setFieldHost({
			get base() {
				return base();
			},
			get registry() {
				return options.registry();
			},
			editors: { text: TextFieldEditor, richText: RichTextFieldEditor, image: ImageFieldEditor },
			page: metaScope({
				editing: true,
				base,
				media: options.media,
				values: () => options.page().meta,
				specs: options.metaFields,
				set(name, value) {
					const fields = options.metaFields();
					const stored = toStoredValues(fields, { [name]: value }, imagePreviews, base());
					const controller = options.metaController();
					controller.setDraft(name, stored[name]);
					options.onMetaCommit(controller.commit());
				}
			})
		});
		setFieldEditing({ imagePreviews });
		onDestroy(() => imagePreviews.revokeAll());
		return new Map(getAllContexts());
	} catch {
		// Svelte has context only during component initialisation.
		return undefined;
	}
}
