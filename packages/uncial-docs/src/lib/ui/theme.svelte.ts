const STORAGE_KEY = 'uncial-theme';

type ThemeMode = 'system' | 'light' | 'dark';

function createThemeState() {
	let mode = $state<ThemeMode>('system');

	function load(): ThemeMode {
		if (typeof window === 'undefined') return 'system';
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
		return 'system';
	}

	function apply(): void {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		if (mode === 'light') {
			root.dataset.theme = 'vellum';
		} else if (mode === 'dark') {
			root.dataset.theme = 'vellum-dark';
		} else {
			delete root.dataset.theme;
		}
	}

	function save(): void {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(STORAGE_KEY, mode);
	}

	function cycle(): void {
		if (mode === 'system') mode = 'light';
		else if (mode === 'light') mode = 'dark';
		else mode = 'system';
		apply();
		save();
	}

	function init(): void {
		if (typeof window === 'undefined') return;
		mode = load();
		apply();
	}

	return {
		get mode() {
			return mode;
		},
		apply,
		cycle,
		init
	};
}

export const theme = createThemeState();
