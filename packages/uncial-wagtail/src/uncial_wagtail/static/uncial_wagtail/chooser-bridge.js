(() => {
	window.uncialWagtail = window.uncialWagtail || {};
	window.uncialWagtail.chooseImage = ({ selectedId } = {}) => {
		return new Promise((resolve) => {
			const chooser = window.ImageChooserModal || window.IMAGE_CHOOSER_MODAL_ONLOAD_HANDLERS;
			if (!chooser || typeof window.ModalWorkflow !== 'function') {
				resolve(null);
				return;
			}

			window.ModalWorkflow({
				url: window.uncialWagtail?.imageChooserUrl || '/admin/images/chooser/',
				urlParams: selectedId ? { selected_id: selectedId } : {},
				onload: chooser,
				responses: {
					imageChosen(image) {
						resolve({
							id: Number(image.id),
							title: image.title || '',
							previewUrl: image.preview?.url || image.url,
							width: image.width,
							height: image.height
						});
					}
				}
			});
		});
	};
})();
