import { mount } from 'svelte';
import { UncialElement } from 'uncial/web-components';
import Dashboard from './Dashboard.svelte';
import type { DashboardOptions, DashboardProps } from './types.js';

type Props = Partial<DashboardProps>;

export class UncialDashboardElement extends UncialElement<Props> {
	get config(): Props['config'] {
		return this.props.config;
	}
	set config(value: Props['config']) {
		this.setProp('config', value);
	}

	get blocks(): unknown {
		return this.props.blocks;
	}
	set blocks(value: unknown) {
		this.setProp('blocks', value);
	}

	get schema(): unknown {
		return this.props.schema;
	}
	set schema(value: unknown) {
		this.setProp('schema', value);
	}

	get globals(): DashboardOptions['globals'] {
		return this.props.globals;
	}
	set globals(value: DashboardOptions['globals']) {
		this.setProp('globals', value);
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

	get basePath(): DashboardOptions['basePath'] {
		return this.props.basePath;
	}
	set basePath(value: DashboardOptions['basePath']) {
		this.setProp('basePath', value);
	}

	get theme(): DashboardOptions['theme'] {
		return this.props.theme;
	}
	set theme(value: DashboardOptions['theme']) {
		this.setProp('theme', value);
	}

	get sessionProvider(): DashboardOptions['sessionProvider'] {
		return this.props.sessionProvider;
	}
	set sessionProvider(value: DashboardOptions['sessionProvider']) {
		this.setProp('sessionProvider', value);
	}

	get mapPathToSource(): DashboardOptions['mapPathToSource'] {
		return this.props.mapPathToSource;
	}
	set mapPathToSource(value: DashboardOptions['mapPathToSource']) {
		this.setProp('mapPathToSource', value);
	}

	get mapSourceToPath(): DashboardOptions['mapSourceToPath'] {
		return this.props.mapSourceToPath;
	}
	set mapSourceToPath(value: DashboardOptions['mapSourceToPath']) {
		this.setProp('mapSourceToPath', value);
	}

	get editorStylesheets(): DashboardOptions['editorStylesheets'] {
		return this.props.editorStylesheets;
	}
	set editorStylesheets(value: DashboardOptions['editorStylesheets']) {
		this.setProp('editorStylesheets', value);
	}

	get staticDir(): DashboardOptions['staticDir'] {
		return this.props.staticDir;
	}
	set staticDir(value: DashboardOptions['staticDir']) {
		this.setProp('staticDir', value);
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
