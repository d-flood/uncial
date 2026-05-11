export interface WagtailImageChooserResult {
	id: number;
	title: string;
	previewUrl?: string;
	width?: number;
	height?: number;
}

export interface WagtailChooserBridge {
	chooseImage(options?: { selectedId?: number | null }): Promise<WagtailImageChooserResult | null>;
}

declare global {
	interface Window {
		uncialWagtail?: WagtailChooserBridge;
	}
}

export function getChooserBridge(): WagtailChooserBridge | undefined {
	return typeof window === 'undefined' ? undefined : window.uncialWagtail;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
	return Promise.race([
		promise,
		new Promise<null>((resolve) => {
			setTimeout(() => resolve(null), ms);
		})
	]);
}

async function chooseFromFallbackEndpoint(): Promise<WagtailImageChooserResult | null> {
	const response = await fetch('/api/uncial/images/');
	if (!response.ok) return null;
	const payload = (await response.json()) as { images?: WagtailImageChooserResult[] };
	const images = payload.images ?? [];
	if (images.length === 0) {
		window.alert('No Wagtail images are available. Upload one in Images first.');
		return null;
	}

	const choice = window.prompt(
		['Choose a Wagtail image by ID:', ...images.map((image) => `${image.id}: ${image.title}`)].join('\n')
	);
	const id = Number(choice);
	return images.find((image) => image.id === id) ?? null;
}

export async function getWagtailImagePreview(
	imageId: number
): Promise<WagtailImageChooserResult | null> {
	const response = await fetch(`/api/uncial/images/?id=${encodeURIComponent(String(imageId))}`);
	if (!response.ok) return null;
	const payload = (await response.json()) as { images?: WagtailImageChooserResult[] };
	return payload.images?.[0] ?? null;
}

export async function chooseWagtailImage(selectedId?: number | null) {
	const bridgeResult = getChooserBridge()?.chooseImage({ selectedId });
	if (bridgeResult) {
		const result = await withTimeout(bridgeResult, 1500);
		if (result) return result;
	}

	return chooseFromFallbackEndpoint();
}
