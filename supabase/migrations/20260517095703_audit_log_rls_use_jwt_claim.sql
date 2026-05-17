-- Migra la política RLS de audit_log de la helper function current_company_id()
-- (que hace lookup en admin_users por query) a leer del claim JWT directamente
-- (cero queries adicionales por evaluación de política).

drop policy if exists audit_log_tenant_read on public.audit_log;

create policy audit_log_tenant_read on public.audit_log
  for select to authenticated
  using (company_id = (auth.jwt() ->> 'company_id')::uuid);
