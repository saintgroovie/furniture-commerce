export const MANGO_SCHEMA = `
  do $$ begin
    if current_database() !~ '^workspace_it[a-zA-Z0-9_]*$' then
      raise exception 'mango migration requires a disposable workspace_it database';
    end if;
  end $$;
  create table if not exists woodright_mango_call (
    id text primary key, tenant text not null, provider_call_id text not null, entry_id text not null,
    seq integer not null, state text not null, location text not null, provider_timestamp bigint not null,
    from_number text not null, to_number text not null, from_extension text not null, to_extension text not null,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null,
    unique (tenant, provider_call_id)
  );
  create index if not exists idx_wr_mango_entry on woodright_mango_call (tenant, entry_id);
  create table if not exists woodright_mango_event (
    id text primary key, call_id text not null, seq integer not null, fingerprint text not null, payload jsonb not null,
    received_at timestamptz not null default now(), unique (call_id, seq)
  );
`;
