create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_id uuid not null references public.admin_users (id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_company_created_idx on public.audit_log (company_id, created_at desc);

alter table public.audit_log enable row level security;

create policy audit_log_tenant_read on public.audit_log
  for select to authenticated
  using (company_id = public.current_company_id());

-- audit_log se rellena via INSERT directo desde código (no permitido al cliente)
-- o via triggers en otras tablas (M2+). No damos INSERT a authenticated.
