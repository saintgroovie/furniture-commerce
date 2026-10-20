export const DESK_SCHEMA = `
  do $$ begin
    if current_database() !~ '^workspace_it[a-zA-Z0-9_]*$' then
      raise exception 'desk migration requires a disposable workspace_it database';
    end if;
  end $$;
  create table if not exists woodright_follow_up (
    id text primary key, entity_type text not null, entity_id text not null,
    assignee_id text null, due_at timestamptz not null, summary text not null,
    status text not null default 'open', created_by text null,
    version integer not null default 1,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null
  );
  alter table woodright_follow_up add column if not exists version integer not null default 1;
  create index if not exists idx_wr_follow_up_due on woodright_follow_up (status, due_at, id) where deleted_at is null;
  create index if not exists idx_wr_follow_up_entity on woodright_follow_up (entity_type, entity_id) where deleted_at is null;
  create table if not exists woodright_private_attachment (
    id text primary key, entity_type text not null, entity_id text not null,
    filename text not null, mime_type text not null, size integer not null,
    sha256 text not null, storage_key text not null unique, uploaded_by text not null,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null
  );
  create index if not exists idx_wr_attachment_entity on woodright_private_attachment (entity_type, entity_id) where deleted_at is null;
  create table if not exists woodright_desk_operation (
    id text primary key, actor_id text not null, fingerprint text not null, result jsonb not null,
    created_at timestamptz not null default now()
  );
  create table if not exists woodright_desk_event (
    id text primary key, actor_id text not null, entity_type text not null, entity_id text not null,
    action text not null, details jsonb not null, created_at timestamptz not null default now()
  );
  create index if not exists idx_wr_desk_event_entity on woodright_desk_event (entity_type, entity_id, created_at);
`;
