export const contentStoreMigrations: Array<{ id: string; sql: string }> = [
	{
		id: '0001_content_store.sql',
		sql: `
			create table uncial_content (
				id uuid primary key default gen_random_uuid(),
				kind text not null,
				path text not null unique check (path ~ '^/(.+/)?$'),
				draft jsonb,
				published jsonb,
				etag text not null default gen_random_uuid()::text,
				published_at timestamptz,
				updated_at timestamptz not null default now(),
				updated_by text not null
			);

			create table uncial_content_versions (
				id bigint generated always as identity primary key,
				content_id uuid not null references uncial_content (id) on delete cascade,
				doc jsonb not null,
				created_at timestamptz not null default now(),
				created_by text not null
			);

			create index uncial_content_versions_content_id on uncial_content_versions (content_id, id desc);
		`
	}
];
