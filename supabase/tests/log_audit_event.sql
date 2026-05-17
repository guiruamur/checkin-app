-- Issue 3 del final review M2 Fase 0: log_audit_event ship sin tests pese a
-- ser la función trigger que las Fases 1-3 van a adjuntar a TODAS las
-- tablas (workers, clients, events, event_assignments).
--
-- Validamos en una tabla temporal de test (no contamina el schema):
--   1. INSERT triggers audit row con diff.after
--   2. UPDATE triggers audit row con diff.before + diff.after
--   3. DELETE triggers audit row con diff.before
--   4. NULL company_id NO crashea (NULL guard del fix Issue 3)
--   5. action = '<tabla>.<operación>'

begin;
select plan(5);

-- Setup mínimo: una company existente (FK target del audit_log)
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values ('99999999-9999-9999-9999-999999999999', 'auditest@test.com', '', now());

insert into public.companies (id, name, slug) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Audit Test Co', 'audit-test-co');

insert into public.admin_users (id, company_id, email, full_name) values
  ('99999999-9999-9999-9999-999999999999',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'auditest@test.com',
   'Auditest');

-- Tabla temporal para ejercitar el trigger sin esperar a las tablas de Fases 1-3.
-- company_id nullable a propósito, para probar el NULL guard.
create temp table audit_smoke_table (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  payload text
) on commit drop;

create trigger audit_smoke_trigger
  after insert or update or delete on audit_smoke_table
  for each row execute function public.log_audit_event();

-- Test 1: INSERT con company_id válido crea audit row con diff.after
insert into audit_smoke_table (id, company_id, payload)
values ('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'hello');

select results_eq(
  $$ select action from public.audit_log
     where entity_id = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and action like '%.insert' $$,
  $$ values ('audit_smoke_table.insert') $$,
  'INSERT triggers audit row with action <table>.insert'
);

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and action = 'audit_smoke_table.insert'
      and diff ? 'after'
      and diff -> 'after' ->> 'payload' = 'hello'
  ),
  'INSERT audit diff contains after with row data'
);

-- Test 2: UPDATE crea audit row con diff.before y diff.after
update audit_smoke_table
set payload = 'world'
where id = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and action = 'audit_smoke_table.update'
      and diff ? 'before' and diff ? 'after'
      and diff -> 'before' ->> 'payload' = 'hello'
      and diff -> 'after' ->> 'payload' = 'world'
  ),
  'UPDATE audit diff contains before+after with values'
);

-- Test 3: DELETE crea audit row con diff.before
delete from audit_smoke_table
where id = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and action = 'audit_smoke_table.delete'
      and diff ? 'before'
      and diff -> 'before' ->> 'payload' = 'world'
  ),
  'DELETE audit diff contains before with last known value'
);

-- Test 4: NULL guard — INSERT sin company_id NO debe crashear ni crear audit row
insert into audit_smoke_table (id, company_id, payload)
values ('22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NULL, 'orphan');

select results_eq(
  $$ select count(*)::int from public.audit_log
     where entity_id = '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  $$ values (0) $$,
  'NULL company_id is skipped silently (no NOT NULL violation)'
);

select * from finish();
rollback;
