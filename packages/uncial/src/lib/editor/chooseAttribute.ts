/**
 * A request from the block attributes panel to resolve a custom attribute value
 * through host-provided UI (for example uncial-wagtail's image chooser). The
 * host receives this via the `onChooseAttribute` prop on `BlockAttributesPanel`
 * and writes the chosen value(s) back through `setAttrs`.
 */
export interface ChooseAttributeRequest {
	/** The custom input kind declared on the attribute spec (e.g. `"wagtail-image"`). */
	inputKind: string;
	/** The attribute name being chosen. */
	name: string;
	/** Current draft attribute values for the active block. */
	attrs: Record<string, unknown>;
	/** Write one or more resolved attribute values back into the draft. */
	setAttrs: (attrs: Record<string, unknown>) => void;
}

/**
 * Name of the legacy `window`-level `CustomEvent` used before `onChooseAttribute`
 * existed. `BlockAttributesPanel` still dispatches it as a fallback when no
 * callback is supplied, so existing global listeners keep working for one
 * release, but a `window` channel cross-talks between multiple editors on a
 * page — prefer the `onChooseAttribute` prop.
 *
 * @deprecated Pass `onChooseAttribute` to `BlockAttributesPanel` instead.
 */
export const CHOOSE_ATTRIBUTE_EVENT = 'uncial:choose-attribute';
