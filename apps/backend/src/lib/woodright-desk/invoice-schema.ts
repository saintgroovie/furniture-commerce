export const INVOICE_SCHEMA = `
do $$ begin
  if current_database() !~ '^workspace_it[a-zA-Z0-9_]*$'
    and not (current_database() = 'woodright_public_production'
      and coalesce(current_setting('woodright.desk_schema_release', true), '') = 'desk-invoice-v1-20261023') then
    raise exception 'invoice migration requires an isolated database or targeted release';
  end if;
end $$;
alter table woodright_private_attachment add column if not exists visibility text not null default 'business'
  check (visibility in ('business','assigned'));
create table woodright_invoice (
  id text primary key,
  source_type text not null check (source_type in ('request','order')), source_id text not null,
  company_id text null references woodright_company(id),
  payer jsonb not null, lines jsonb not null, total_minor bigint not null check (total_minor between 0 and 9000000000000),
  currency text not null default 'RUB' check (currency = 'RUB'), notes text not null default '',
  status text not null default 'draft' check (status in ('draft','registered','archived')),
  accounting_number text null, accounting_date date null, accounting_ref text null,
  pdf_attachment_id text null unique references woodright_private_attachment(id),
  registration_source text null check (registration_source = 'manual_1c'),
  registered_by text null, registered_at timestamptz null,
  version integer not null default 1, created_by text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null,
  constraint wr_invoice_status_document check (
    (status <> 'registered' or registered_at is not null) and (status <> 'draft' or registered_at is null)
  ),
  constraint wr_invoice_registration_complete check (
    (accounting_number is null and accounting_date is null and pdf_attachment_id is null and registration_source is null and registered_by is null and registered_at is null)
    or (accounting_number is not null and accounting_date is not null and pdf_attachment_id is not null and registration_source is not null and registered_by is not null and registered_at is not null)
  )
);
create unique index idx_wr_invoice_accounting_number on woodright_invoice(accounting_number, accounting_date) where accounting_number is not null;
create unique index idx_wr_invoice_accounting_ref on woodright_invoice(accounting_ref) where accounting_ref is not null;
create index idx_wr_invoice_source on woodright_invoice(source_type,source_id);
create index idx_wr_invoice_company on woodright_invoice(company_id,created_at);
`;
