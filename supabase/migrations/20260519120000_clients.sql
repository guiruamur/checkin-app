-- Fase 2: tabla clients (catálogo de clientes finales por tenant).
--
-- CRUD puro de admin: INSERT/UPDATE vienen del SPA autenticado (no de
-- service_role como workers), por eso:
--   - company_id tiene default que lo rellena del claim JWT.
--   - la policy lleva WITH CHECK explícito (impide insertar/actualizar
--     con company_id ajeno aunque el cliente manipule el payload).
-- El trigger genérico log_audit_event (Fase 0) audita toda mutación.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default (auth.jwt() ->> 'company_id')::uuid
    references public.companies (id) on delete cascade,
  name text not null,
  contact_email text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index clients_company_idx on public.clients (company_id)
  where archived_at is null;

alter table public.clients enable row level security;

create policy clients_tenant on public.clients
  for all to authenticated
  using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create trigger clients_audit
  after insert or update or delete on public.clients
  for each row execute function public.log_audit_event();
