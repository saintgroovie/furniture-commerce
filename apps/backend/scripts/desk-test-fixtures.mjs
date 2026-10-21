// Synthetic fixtures for a disposable HTTP test database. Never used by a live runtime.
import knex from "knex";
const value = process.env.WOODRIGHT_DESK_TEST_DATABASE_URL;
if (!value) throw new Error("Specify the disposable desk HTTP database");
const url = new URL(value);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/workspace_it_desk_http")
  throw new Error("Fixtures require the local workspace_it_desk_http database");
const db = knex({ client: "pg", connection: value });
try {
  await db.raw(`create table if not exists lead (id text primary key, source text not null, name text null,
    email text null, phone text null, comment text null, payload jsonb null, status text null,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null);
    create table if not exists bespoke_request (id text primary key, lead_id text not null,
    product_id text null, room_set_id text null, dimensions text null, materials text null, budget text null,
    comment text null, status text not null default 'new', internal_notes text null, quoted_at timestamptz null,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null);
    insert into lead (id, source, name, email, comment) values
      ('lead_desk_qa', 'contact', 'Тестовый клиент · проверка интерфейса', 'client@example.test', 'Синтетические данные изолированной проверки') on conflict (id) do nothing;
    insert into bespoke_request (id, lead_id, comment, dimensions, materials) values
      ('request_desk_qa', 'lead_desk_qa', 'Проверка карточки обращения', '120 × 80 см', 'Дуб · тестовый запрос') on conflict (id) do nothing;`);
  console.log("Synthetic desk HTTP fixtures ready. No live connection used.");
} finally { await db.destroy(); }
