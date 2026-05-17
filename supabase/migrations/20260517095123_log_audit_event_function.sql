-- Trigger genérico que registra toda mutación DML en audit_log.
-- Cada fase posterior adjunta este trigger a sus tablas (workers, clients,
-- events, event_assignments).
--
-- Para event_assignments el company_id se resuelve desde la tabla events
-- (event_assignments no tiene company_id directo).

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
