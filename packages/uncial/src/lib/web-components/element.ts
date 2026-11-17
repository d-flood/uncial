import { unmount } from 'svelte';
import { reactiveProps } from './reactiveProps.svelte.js';

const BrowserHTMLElement = globalThis.HTMLElement ?? class {};

const STYLESHEET_ATTRIBUTE = 'stylesheet';

export abstract class UncialElement<
	Props extends Record<string, unknown>
> extends BrowserHTMLElement {
	static readonly observedAttributes = [STYLESHEET_ATTRIBUTE];

	/**
	 * `$state`-backed props shared with the mounted Svelte component. Mutating
	 * this object updates the component in place; the component is mounted once
	 * per connection instead of being destroyed and recreated per property set.
	 */
	protected readonly props: Props = reactiveProps({} as Props);
	private instance: Record<string, unknown> | null = null;
	private readonly root = this.attachShadow({ mode: 'open' });
	private stylesheetLinks: HTMLLinkElement[] = [];

	connectedCallback(): void {
		if (this.instance) return;
		this.instance = this.mountComponent(this.root);
	}

	disconnectedCallback(): void {
		if (!this.instance) return;
		void unmount(this.instance);
		this.instance = null;
	}

	attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
		if (name !== STYLESHEET_ATTRIBUTE || oldValue === newValue) return;
		this.renderStylesheetLinks(newValue);
	}

	/**
	 * One or more whitespace-separated stylesheet URLs rendered as
	 * `<link rel="stylesheet">` elements inside the shadow root.
	 */
	get stylesheet(): string | null {
		return this.getAttribute(STYLESHEET_ATTRIBUTE);
	}

	set stylesheet(value: string | null | undefined) {
		if (value == null || value === '') {
			this.removeAttribute(STYLESHEET_ATTRIBUTE);
			return;
		}

		this.setAttribute(STYLESHEET_ATTRIBUTE, value);
	}

	protected setProp<Key extends keyof Props>(key: Key, value: Props[Key]): void {
		this.props[key] = value;
	}

	protected emit(type: string, detail: unknown): void {
		this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
	}

	protected abstract mountComponent(target: ShadowRoot): Record<string, unknown>;

	private renderStylesheetLinks(value: string | null): void {
		for (const link of this.stylesheetLinks) {
			link.remove();
		}

		const hrefs = (value ?? '').split(/\s+/).filter(Boolean);
		this.stylesheetLinks = hrefs.map((href) => {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = href;
			return link;
		});

		this.root.prepend(...this.stylesheetLinks);
	}
}
