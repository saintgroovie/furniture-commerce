export const TEAM_SCHEMA = `
do $$ begin
  if current_database() !~ '^workspace_it[a-zA-Z0-9_]*$'
    and not (current_database() = 'woodright_public_production'
      and coalesce(current_setting('woodright.desk_schema_release', true), '') = 'desk-team-v1-20261021') then
    raise exception 'team migration requires an isolated test database or the targeted production release';
  end if;
end $$;
create table woodright_company (
  id text primary key, name text not null, legal_name text not null default '',
  tax_id text not null default '', kpp text not null default '',
  email text not null default '', phone text not null default '', address text not null default '',
  notes text not null default '', status text not null default 'active' check (status in ('active','archived')),
  version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null
);
create index idx_wr_company_name on woodright_company (lower(name), id) where deleted_at is null;
create table woodright_desk_record (
  entity_type text not null check (entity_type in ('person','request','order','company')),
  entity_id text not null, company_id text null references woodright_company(id), assignee_id text null,
  version integer not null default 1, updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);
create index idx_wr_record_company on woodright_desk_record (company_id, entity_type, entity_id);
create index idx_wr_record_assignee on woodright_desk_record (assignee_id, entity_type, entity_id);
`;
