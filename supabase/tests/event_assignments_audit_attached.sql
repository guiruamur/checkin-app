-- El trigger audita event_assignments resolviendo company_id via el evento padre.
begin;
select plan(2);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('88888888-8888-8888-8888-888888888888', 'aua@a.com', '', now());
insert into public.companies (id, name, slug) values
  ('a8888888-8888-8888-8888-888888888888', 'Audit EA Co', 'audit-ea-co');
insert into public.admin_users (id, company_id, email, full_name) values
  ('88888888-8888-8888-8888-888888888888', 'a8888888-8888-8888-8888-888888888888', 'aua@a.com', 'Aua');
insert into public.clients (id, company_id, name, contact_email) values
  ('c8888888-8888-8888-8888-888888888888', 'a8888888-8888-8888-8888-888888888888', 'Cli', 'c@c.com');
insert into public.workers (id, company_id, email, phone, first_name, last_name, status) values
  ('80000000-0000-0000-0000-000000000000', 'a8888888-8888-8888-8888-888888888888', 'w@x.com', '600000004', 'W', 'T', 'approved');
insert into public.events (id, company_id, client_id, name, address, organizer_email, starts_at, ends_at) values
  ('e8888888-8888-8888-8888-888888888888', 'a8888888-8888-8888-8888-888888888888', 'c8888888-8888-8888-8888-888888888888', 'Ev', 'D', 'o@x.com', now(), now() + interval '2 hours');

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated","company_id":"a8888888-8888-8888-8888-888888888888"}';

insert into public.event_assignments (id, event_id, worker_id, scheduled_start, scheduled_end)
values ('aa888888-8888-8888-8888-888888888888', 'e8888888-8888-8888-8888-888888888888', '80000000-0000-0000-0000-000000000000', now(), now() + interval '2 hours');

select results_eq(
  $$ select action from public.audit_log where entity_id = 'aa888888-8888-8888-8888-888888888888' and action like 'event_assignments.%' $$,
  $$ values ('event_assignments.insert'::text) $$,
  'INSERT on event_assignments produces audit row'
);

select results_eq(
  $$ select company_id from public.audit_log where entity_id = 'aa888888-8888-8888-8888-888888888888' and action = 'event_assignments.insert' $$,
  $$ values ('a8888888-8888-8888-8888-888888888888'::uuid) $$,
  'audit company_id resolved from parent event'
);

select * from finish();
rollback;
