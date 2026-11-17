import type { Site } from './define-site.js';
import { mountEditor } from './mount.js';

const BrowserHTMLElement = globalThis.HTMLElement ?? class {};

/** `<uncial-editor-page>`: an Editor variant for a host without Svelte. Set `site` and `sourcePath`. */
export class UncialEditorPageElement extends BrowserHTMLElement {
	#site: Site | undefined;
	#sourcePath: string | undefined;
	#pagePath: string | undefined;
	#handle: ReturnType<typeof mountEditor> | undefined;

	get site(): Site | undefined {
		return this.#site;
	}
	set site(value: Site | undefined) {
		this.#site = value;
		this.#remount();
	}

	/** Repo-root-relative path of the JSON document. */
	get sourcePath(): string | undefined {
		return this.#sourcePath;
	}
	set sourcePath(value: string | undefined) {
		this.#sourcePath = value;
		this.#remount();
	}

	/** Site-relative page path, named in the commit message. */
	get pagePath(): string | undefined {
		return this.#pagePath;
	}
	set pagePath(value: string | undefined) {
		this.#pagePath = value;
		this.#remount();
	}

	isDirty(): boolean {
		return this.#handle?.isDirty() ?? false;
	}

	connectedCallback(): void {
		this.#remount();
	}

	disconnectedCallback(): void {
		this.#handle?.destroy();
		this.#handle = undefined;
	}

	#remount(): void {
		this.disconnectedCallback();
		const site = this.#site;
		if (!this.isConnected || !site || !this.#sourcePath) return;
		this.#handle = mountEditor(this, {
			site,
			sourcePath: this.#sourcePath,
			pagePath: this.#pagePath,
			autosaveMs: site.autosaveMs
		});
	}
}

if (typeof customElements !== 'undefined' && !customElements.get('uncial-editor-page')) {
	customElements.define('uncial-editor-page', UncialEditorPageElement);
}
