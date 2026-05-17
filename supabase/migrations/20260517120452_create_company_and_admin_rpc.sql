-- Issue 1 del final review M1+M2 Fase 0: signup-admin Edge Function hacía 3
-- llamadas HTTP secuenciales (createUser + 2 INSERTs) sin transacción.
-- Si el proceso muere entre INSERTs, queda basura inconsistente.
--
-- Fix: extraer los 2 INSERTs (companies + admin_users) a un RPC plpgsql
-- (transacción real, atómica por construcción). La Edge Function llama:
--   1. auth.admin.createUser
--   2. create_company_and_admin RPC (transacción)
--   3. Si el RPC falla, deleteUser (única compensación necesaria)
--
-- Reduce el blast radius de fallos: en vez de 2 escenarios de orfandad,
-- solo queda 1 (auth.user huérfano si crashea la Edge Function entre
-- pasos 1 y 2 o 3). Ese caso edge se aborda en milestones futuros con
-- cleanup job o re-registro idempotente.

create or replace function public.create_company_and_admin(
  p_user_id uuid,
  p_email text,
  p_company_name text,
  p_company_slug text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  insert into public.companies (name, slug)
  values (p_company_name, p_company_slug)
  returning id into v_company_id;

  insert into public.admin_users (id, company_id, email, full_name)
  values (p_user_id, v_company_id, p_email, p_full_name);

  return v_company_id;
end;
$$;

revoke execute on function public.create_company_and_admin(uuid, text, text, text, text)
  from authenticated, anon, public;
grant execute on function public.create_company_and_admin(uuid, text, text, text, text)
  to service_role;

-- Eliminamos el RPC viejo de M1 que ya no usa nadie (la Edge Function lo
-- reemplaza). Issue 5 del final review (dead code en types/database.ts) se
-- resuelve regenerando los tipos después de aplicar esta migración.

drop function if exists public.signup_create_company(text, text, text);
