-- companies: tenant root
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;

-- nadie lee companies directamente desde el cliente (admins solo necesitan su propia info via JWT claim).
-- política mínima: nadie puede SELECT/INSERT/UPDATE/DELETE desde el cliente.
-- las operaciones sobre companies se hacen desde el flujo de signup (Edge Function o RPC con security definer).

