-- Dos asignaciones del mismo worker en el mismo evento son válidas (horario partido).
begin;
select plan(1);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('66666666-6666-6666-6666-666666666666', 'ss@a.com', '', now());
insert into public.companies (id, name, slug) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'SS Co', 'ss-co');
insert into public.admin_users (id, company_id, email, full_name) values
  ('66666666-6666-6666-6666-666666666666', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'ss@a.com', 'SS');
insert into public.clients (id, company_id, name, contact_email) values
  ('c6666666-6666-6666-6666-666666666666', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'Cli', 'c@c.com');
insert into public.workers (id, company_id, email, phone, first_name, last_name, status) values
  ('60000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'w@x.com', '600000003', 'W', 'T', 'approved');
insert into public.events (id, company_id, client_id, name, address, organizer_email, starts_at, ends_at) values
  ('e6666666-6666-6666-6666-666666666666', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'c6666666-6666-6666-6666-666666666666', 'Ev', 'D', 'o@x.com', now(), now() + interval '12 hours');

insert into public.event_assignments (event_id, worker_id, scheduled_start, scheduled_end) values
  ('e6666666-6666-6666-6666-666666666666', '60000000-0000-0000-0000-000000000000', now(), now() + interval '4 hours'),
  ('e6666666-6666-6666-6666-666666666666', '60000000-0000-0000-0000-000000000000', now() + interval '6 hours', now() + interval '10 hours');

select results_eq(
  $$ select count(*)::int from public.event_assignments
     where event_id = 'e6666666-6666-6666-6666-666666666666'
       and worker_id = '60000000-0000-0000-0000-000000000000' $$,
  $$ values (2) $$,
  'same worker can have two assignments in the same event (split shift)'
);

select * from finish();
rollback;
