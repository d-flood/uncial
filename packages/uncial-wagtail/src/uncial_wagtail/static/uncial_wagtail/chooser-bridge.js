/**
 * Bridge between the Uncial admin bundle and Wagtail's image chooser modal.
 *
 * Installs `window.uncialWagtail.chooseImage()` which resolves with:
 * - `{id, title, previewUrl, width, height}` when the user chooses an image;
 * - `{cancelled: true}` when the user closes the open modal without choosing;
 * - `null` when the modal could not be opened at all (ModalWorkflow or the
 *   image chooser scripts are missing) — only this signals callers to use
 *   their own fallback UI.
 *
 * The chooser modal URL is read from `window.uncialWagtail.imageChooserUrl`
 * (set by the admin bundle from the widget config's `apiUrls.chooserModal`)
 * and defaults to the standard `/admin/images/chooser/` path.
 */
(() => {
	window.uncialWagtail = window.uncialWagtail || {};

	function getOnloadHandlers() {
		// Wagtail's image-chooser-modal.js exposes the onload handler dict
		// directly; keep instantiating the ImageChooserModal class as a backstop
		// (its instances carry the same handlers).
		if (window.IMAGE_CHOOSER_MODAL_ONLOAD_HANDLERS) {
			return window.IMAGE_CHOOSER_MODAL_ONLOAD_HANDLERS;
		}
		if (typeof window.ImageChooserModal === 'function') {
			try {
				return new window.ImageChooserModal().onloadHandlers || null;
			} catch (error) {
				return null;
			}
		}
		return null;
	}

	function toResult(image) {
		const preview = image.preview || {};
		return {
			id: Number(image.id),
			title: image.title || '',
			previewUrl: preview.url || image.url || '',
			width: preview.width,
			height: preview.height
		};
	}

	window.uncialWagtail.chooseImage = ({ selectedId } = {}) => {
		return new Promise((resolve) => {
			const onload = getOnloadHandlers();
			if (!onload || typeof window.ModalWorkflow !== 'function') {
				// The Wagtail chooser cannot be opened on this page.
				resolve(null);
				return;
			}

			let settled = false;
			const settle = (value) => {
				if (settled) return;
				settled = true;
				resolve(value);
			};
			const chosen = (image) => settle(toResult(image));

			let modal;
			try {
				modal = window.ModalWorkflow({
					url: window.uncialWagtail.imageChooserUrl || '/admin/images/chooser/',
					urlParams: selectedId ? { selected_id: selectedId } : {},
					onload,
					responses: {
						// Wagtail >= 5 responds with "chosen"; keep the legacy
						// "imageChosen" name for older chooser scripts.
						chosen,
						imageChosen: chosen
					}
				});
			} catch (error) {
				settle(null);
				return;
			}

			// ModalWorkflow has no cancel callback. Its bootstrap modal container
			// fires "hidden.bs.modal" whenever the modal closes; a successful
			// choice responds "chosen" before closing, so the first settle wins
			// and a close without a choice resolves as a user cancellation.
			if (modal && modal.container && typeof modal.container.on === 'function') {
				modal.container.on('hidden.bs.modal', () => settle({ cancelled: true }));
			}
		});
	};
})();
