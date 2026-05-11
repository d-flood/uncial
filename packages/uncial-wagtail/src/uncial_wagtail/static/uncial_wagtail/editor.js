(() => {
	function parseJson(value, fallback) {
		try {
			return value ? JSON.parse(value) : fallback;
		} catch (_error) {
			return fallback;
		}
	}

	function initWidget(widget) {
		const input = widget.querySelector('input[type="hidden"]');
		const mount = widget.querySelector('[data-uncial-editor]');
		if (!input || !mount || widget.dataset.uncialMounted === 'true') return;

		widget.dataset.uncialMounted = 'true';
		mount.dataset.config = JSON.stringify(parseJson(widget.dataset.uncialConfig, {}));
		mount.dataset.value = input.value || '{"type":"doc","content":[]}';
		mount.addEventListener('uncialchange', (event) => {
			input.value = JSON.stringify(event.detail?.doc ?? {});
		});
	}

	document.querySelectorAll('.uncial-wagtail-widget').forEach(initWidget);
	document.addEventListener('w-formset:added', (event) => {
		event.target.querySelectorAll?.('.uncial-wagtail-widget').forEach(initWidget);
	});
})();
