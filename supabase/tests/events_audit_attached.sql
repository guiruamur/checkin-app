-- El trigger audita mutaciones en events con action correcto.
begin;
select plan(3);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('77777777-7777-7777-7777-777777777777', 'au@a.com', '', now());
insert into public.companies (id, name, slug) values
  ('a7777777-7777-7777-7777-777777777777', 'Audit Ev Co', 'audit-ev-co');
insert into public.admin_users (id, company_id, email, full_name) values
  ('77777777-7777-7777-7777-777777777777', 'a7777777-7777-7777-7777-777777777777', 'au@a.com', 'Au');
insert into public.clients (id, company_id, name, contact_email) values
  ('c7777777-7777-7777-7777-777777777777', 'a7777777-7777-7777-7777-777777777777', 'Cli', 'c@c.com');

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated","company_id":"a7777777-7777-7777-7777-777777777777"}';

insert into public.events (id, client_id, name, address, organizer_email, starts_at, ends_at)
values ('e7777777-7777-7777-7777-777777777777', 'c7777777-7777-7777-7777-777777777777', 'Ev Audit', 'D', 'o@x.com', now(), now() + interval '1 hour');

select results_eq(
  $$ select action from public.audit_log where entity_id = 'e7777777-7777-7777-7777-777777777777' and action like 'events.%' order by created_at $$,
  $$ values ('events.insert'::text) $$,
  'INSERT on events produces events.insert audit row'
);

update public.events set name = 'Renombrado' where id = 'e7777777-7777-7777-7777-777777777777';
select ok(
  exists(select 1 from public.audit_log where entity_id = 'e7777777-7777-7777-7777-777777777777'
    and action = 'events.update' and diff -> 'after' ->> 'name' = 'Renombrado'),
  'UPDATE on events audits name change'
);

delete from public.events where id = 'e7777777-7777-7777-7777-777777777777';
select ok(
  exists(select 1 from public.audit_log where entity_id = 'e7777777-7777-7777-7777-777777777777' and action = 'events.delete'),
  'DELETE on events produces events.delete audit row'
);

select * from finish();
rollback;
