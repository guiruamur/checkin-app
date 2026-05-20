-- Fase 3a: tablas events + event_assignments.
--
-- events: company_id por default del claim JWT + RLS WITH CHECK (mismo patron
--   que clients, INSERT viene del SPA autenticado).
-- event_assignments: sin company_id propio; RLS y audit lo resuelven via el
--   evento padre. La funcion log_audit_event (Fase 0) ya soporta esta tabla.
-- Sin UNIQUE en (event_id, worker_id) -> permite horario partido.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default (auth.jwt() ->> 'company_id')::uuid
    references public.companies (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null,
  address text not null,
  organizer_email text not null,
  access_token uuid not null unique default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  last_confirmation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (ends_at > starts_at)
);

create index events_company_starts_idx on public.events (company_id, starts_at desc);

alter table public.events enable row level security;

create policy events_tenant on public.events
  for all to authenticated
  using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create trigger events_audit
  after insert or update or delete on public.events
  for each row execute function public.log_audit_event();

create table public.event_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  worker_id uuid not null references public.workers (id) on delete restrict,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  created_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);

create index event_assignments_event_idx on public.event_assignments (event_id, scheduled_start);

alter table public.event_assignments enable row level security;

create policy event_assignments_tenant on public.event_assignments
  for all to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_assignments.event_id
      and e.company_id = (auth.jwt() ->> 'company_id')::uuid
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = event_assignments.event_id
      and e.company_id = (auth.jwt() ->> 'company_id')::uuid
  ));

create trigger event_assignments_audit
  after insert or update or delete on public.event_assignments
  for each row execute function public.log_audit_event();
