-- Issue 3 del final review: log_audit_event tiene un bug latente.
-- Caso: trigger en event_assignments (Phase 3+). Si el row es DELETEd como
-- parte de un CASCADE desde events (OLD.event_id ya no existe en events
-- porque events.id se borró en la misma transacción), el lookup
-- "select company_id from events where id = OLD.event_id" devuelve NULL.
-- audit_log.company_id es NOT NULL → el INSERT explota → la transacción
-- entera aborta, incluyendo el DELETE del parent.
--
-- Fix: si no podemos resolver company_id (parent ya borrado), salimos
-- temprano sin auditar este evento cascade. Es la opción correcta porque:
--   1. El parent (events.delete) YA se está auditando, no perdemos info.
--   2. El cascade es consecuencia automática, no acción del admin.
--   3. Evitamos NOT NULL violation.

create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor_id uuid := auth.uid();
  v_entity_id uuid;
  v_diff jsonb;
begin
  if TG_TABLE_NAME = 'event_assignments' then
    select company_id into v_company_id
    from public.events
    where id = coalesce(NEW.event_id, OLD.event_id);
  else
    v_company_id := coalesce(NEW.company_id, OLD.company_id);
  end if;

  -- Si no podemos resolver company_id (cascade post-delete del parent),
  -- saltamos esta entrada. El evento parent ya audita la mutación principal.
  if v_company_id is null then
    return coalesce(NEW, OLD);
  end if;

  v_entity_id := coalesce(NEW.id, OLD.id);

  if TG_OP = 'INSERT' then
    v_diff := jsonb_build_object('after', to_jsonb(NEW));
  elsif TG_OP = 'UPDATE' then
    v_diff := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  elsif TG_OP = 'DELETE' then
    v_diff := jsonb_build_object('before', to_jsonb(OLD));
  end if;

  insert into public.audit_log (company_id, actor_id, action, entity_type, entity_id, diff)
  values (
    v_company_id,
    v_actor_id,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    v_diff
  );

  return coalesce(NEW, OLD);
end;
$$;
