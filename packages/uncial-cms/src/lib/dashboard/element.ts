import { mount } from 'svelte';
import { UncialElement } from 'uncial/internal';
import Dashboard from './Dashboard.svelte';
import type { DashboardOptions, DashboardProps } from './types.js';

type Props = Partial<DashboardProps>;

export class UncialDashboardElement extends UncialElement<Props> {
	get site(): Props['site'] {
		return this.props.site;
	}
	set site(value: Props['site']) {
		this.setProp('site', value);
	}

	get editorHref(): DashboardOptions['editorHref'] {
		return this.props.editorHref;
	}
	set editorHref(value: DashboardOptions['editorHref']) {
		this.setProp('editorHref', value);
	}

	get can(): DashboardOptions['can'] {
		return this.props.can;
	}
	set can(value: DashboardOptions['can']) {
		this.setProp('can', value);
	}

	get appSections(): DashboardOptions['appSections'] {
		return this.props.appSections;
	}
	set appSections(value: DashboardOptions['appSections']) {
		this.setProp('appSections', value);
	}

	get signOutHref(): DashboardOptions['signOutHref'] {
		return this.props.signOutHref;
	}
	set signOutHref(value: DashboardOptions['signOutHref']) {
		this.setProp('signOutHref', value);
	}

	get theme(): DashboardOptions['theme'] {
		return this.props.theme;
	}
	set theme(value: DashboardOptions['theme']) {
		this.setProp('theme', value);
	}

	get sections(): DashboardProps['sections'] {
		return this.props.sections;
	}
	set sections(value: DashboardProps['sections']) {
		this.setProp('sections', value);
	}

	protected mountComponent(target: ShadowRoot): Record<string, unknown> {
		return mount(Dashboard, { target, props: this.props as DashboardProps });
	}
}

if (typeof customElements !== 'undefined' && !customElements.get('uncial-dashboard')) {
	customElements.define('uncial-dashboard', UncialDashboardElement);
}
