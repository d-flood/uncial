interface TabSelectionState {
	value: string;
	loaded: boolean;
}

const STORAGE_PREFIX = 'uncial-tabs:';
const selections = new Map<string, TabSelection>();

class TabSelection implements TabSelectionState {
	value = $state('');
	loaded = $state(false);
}

export function getTabSelection(group: string): TabSelectionState {
	if (typeof window === 'undefined') {
		return { value: '', loaded: false };
	}

	let selection = selections.get(group);
	if (!selection) {
		selection = new TabSelection();
		selections.set(group, selection);
	}
	return selection;
}

export function loadTabSelection(group: string, selection: TabSelectionState): void {
	if (selection.loaded || typeof window === 'undefined') return;

	selection.loaded = true;
	try {
		const stored = localStorage.getItem(`${STORAGE_PREFIX}${group}`);
		if (stored) selection.value = stored;
	} catch {
		// Tabs still work for readers whose browser denies storage access.
	}
}

export function saveTabSelection(group: string, selection: TabSelectionState): void {
	if (!selection.loaded || typeof window === 'undefined') return;

	try {
		localStorage.setItem(`${STORAGE_PREFIX}${group}`, selection.value);
	} catch {
		// Persistence is an enhancement; storage failures must not disable a tab group.
	}
}
