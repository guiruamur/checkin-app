-- Hacer actor_id nullable: las Edge Functions con service_role no tienen
-- auth.uid(), así que sus mutaciones registrarán actor_id = NULL = "sistema".

alter table public.audit_log
  alter column actor_id drop not null;

comment on column public.audit_log.actor_id is
  'admin_user que realizó la acción. NULL = acción del sistema (Edge Function service_role, cron, etc.).';
