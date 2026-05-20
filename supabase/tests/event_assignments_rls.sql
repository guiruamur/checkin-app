-- RLS de event_assignments via evento padre: admin A no ve ni inserta
-- asignaciones de eventos de B.
begin;
select plan(2);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('44444444-4444-4444-4444-444444444444', 'aa@a.com', '', now());
insert into public.companies (id, name, slug) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Comp A', 'comp-a-ea'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Comp B', 'comp-b-ea');
insert into public.admin_users (id, company_id, email, full_name) values
  ('44444444-4444-4444-4444-444444444444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'aa@a.com', 'A');
insert into public.clients (id, company_id, name, contact_email) values
  ('c4444444-4444-4444-4444-444444444444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Cli A', 'a@c.com'),
  ('c5555555-5555-5555-5555-555555555555', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Cli B', 'b@c.com');
insert into public.workers (id, company_id, email, phone, first_name, last_name, status) values
  ('40000000-0000-0000-0000-000000000000', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'wa@x.com', '600000001', 'WA', 'T', 'approved'),
  ('50000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'wb@x.com', '600000002', 'WB', 'T', 'approved');
insert into public.events (id, company_id, client_id, name, address, organizer_email, starts_at, ends_at) values
  ('e4444444-4444-4444-4444-444444444444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'c4444444-4444-4444-4444-444444444444', 'Ev A', 'D', 'o@a.com', now(), now() + interval '2 hours'),
  ('e5555555-5555-5555-5555-555555555555', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'c5555555-5555-5555-5555-555555555555', 'Ev B', 'D', 'o@b.com', now(), now() + interval '2 hours');
insert into public.event_assignments (event_id, worker_id, scheduled_start, scheduled_end) values
  ('e4444444-4444-4444-4444-444444444444', '40000000-0000-0000-0000-000000000000', now(), now() + interval '2 hours'),
  ('e5555555-5555-5555-5555-555555555555', '50000000-0000-0000-0000-000000000000', now(), now() + interval '2 hours');

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","company_id":"dddddddd-dddd-dddd-dddd-dddddddddddd"}';

select results_eq(
  $$ select count(*)::int from public.event_assignments $$,
  $$ values (1) $$,
  'admin A only sees assignments of own events'
);

select throws_ok(
  $$ insert into public.event_assignments (event_id, worker_id, scheduled_start, scheduled_end)
     values ('e5555555-5555-5555-5555-555555555555', '40000000-0000-0000-0000-000000000000', now(), now() + interval '1 hour') $$,
  '42501',
  'new row violates row-level security policy for table "event_assignments"',
  'cannot insert assignment into another tenant event'
);

select * from finish();
rollback;
