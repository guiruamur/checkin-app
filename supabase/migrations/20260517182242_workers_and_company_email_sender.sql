-- Fase 1a: tabla workers + columnas white-label sender en companies + trigger audit.
--
-- workers: agenda de candidatos por tenant. Aprobación gestionada por admin.
-- companies: 3 columnas nullable para white-label sender (vacías por defecto,
--   fallback a noreply@notify.ruanodev.com en el helper de Resend).
-- audit: el trigger log_audit_event (Fase 0) se adjunta a workers para
--   registrar toda mutación.

-- 1. White-label sender columns on companies
alter table public.companies
  add column email_sender_domain text,
  add column email_sender_address text,
  add column email_sender_verified_at timestamptz;

comment on column public.companies.email_sender_domain is
  'Dominio verificado en Resend para envío desde este tenant. NULL = usa el shared (notify.ruanodev.com).';
comment on column public.companies.email_sender_address is
  'Dirección remitente completa (ej. noreply@cliente.com). NULL = usa noreply@notify.ruanodev.com.';
comment on column public.companies.email_sender_verified_at is
  'Cuándo Resend confirmó la verificación DNS. NULL = no verificado; se rellena cuando admin lo configure.';

-- 2. workers table
create table public.workers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  phone text not null,
  first_name text not null,
  last_name text not null,
  postal_code text,
  languages text[] not null default '{}',
  experience_summary text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'archived')),
  approved_at timestamptz,
  approved_by uuid references public.admin_users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- UNIQUE parcial: permite re-registro tras archivar, bloquea email duplicado en estados activos.
create unique index workers_company_email_unique
  on public.workers (company_id, lower(email))
  where archived_at is null;

create index workers_company_status_idx
  on public.workers (company_id, status);

alter table public.workers enable row level security;

create policy workers_tenant on public.workers
  for all to authenticated
  using (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- 3. Attach generic audit trigger
create trigger workers_audit
  after insert or update or delete on public.workers
  for each row execute function public.log_audit_event();
