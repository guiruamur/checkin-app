-- Verifica que el trigger log_audit_event audita mutaciones en clients
-- con action correcto, diff coherente y actor_id poblado desde el claim.

begin;
select plan(4);

-- Setup como superuser
insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('55555555-5555-5555-5555-555555555555', 'audit-cli@a.com', '', now());

insert into public.companies (id, name, slug) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Audit Cli Co', 'audit-cli-co');

insert into public.admin_users (id, company_id, email, full_name) values
  ('55555555-5555-5555-5555-555555555555', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'audit-cli@a.com', 'Audit');

-- Impersonar el admin (para que auth.uid() pueble actor_id)
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","company_id":"dddddddd-dddd-dddd-dddd-dddddddddddd"}';

-- INSERT
insert into public.clients (id, name, contact_email)
values ('66666666-6666-6666-6666-666666666666', 'Audit Cliente', 'ac@x.com');

select results_eq(
  $$ select action from public.audit_log
     where entity_id = '66666666-6666-6666-6666-666666666666'
       and action like 'clients.%'
     order by created_at $$,
  $$ values ('clients.insert'::text) $$,
  'INSERT on clients produces clients.insert audit row'
);

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '66666666-6666-6666-6666-666666666666'
      and action = 'clients.insert'
      and diff -> 'after' ->> 'contact_email' = 'ac@x.com'
      and actor_id = '55555555-5555-5555-5555-555555555555'
  ),
  'INSERT audit captures email and actor_id from claim'
);

-- UPDATE
update public.clients set name = 'Renombrado' where id = '66666666-6666-6666-6666-666666666666';

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '66666666-6666-6666-6666-666666666666'
      and action = 'clients.update'
      and diff -> 'before' ->> 'name' = 'Audit Cliente'
      and diff -> 'after' ->> 'name' = 'Renombrado'
  ),
  'UPDATE audit captures name change'
);

-- DELETE
delete from public.clients where id = '66666666-6666-6666-6666-666666666666';

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '66666666-6666-6666-6666-666666666666'
      and action = 'clients.delete'
  ),
  'DELETE on clients produces clients.delete audit row'
);

select * from finish();
rollback;
