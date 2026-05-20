-- Aislamiento tenant en events + WITH CHECK rechaza company_id ajeno.
begin;
select plan(3);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'ea@a.com', '', now()),
  ('22222222-2222-2222-2222-222222222222', 'eb@b.com', '', now());

insert into public.companies (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Empresa A', 'empresa-a-ev'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Empresa B', 'empresa-b-ev');

insert into public.admin_users (id, company_id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ea@a.com', 'A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'eb@b.com', 'B');

insert into public.clients (id, company_id, name, contact_email) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cli A', 'a@cli.com'),
  ('c2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Cli B', 'b@cli.com');

insert into public.events (id, company_id, client_id, name, address, organizer_email, starts_at, ends_at) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Ev A', 'Dir', 'o@a.com', now(), now() + interval '1 hour'),
  ('e2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c2222222-2222-2222-2222-222222222222', 'Ev B', 'Dir', 'o@b.com', now(), now() + interval '1 hour');

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

select results_eq(
  $$ select count(*)::int from public.events $$,
  $$ values (1) $$,
  'admin A only sees own company events'
);

select results_eq(
  $$ select count(*)::int from public.events where name = 'Ev B' $$,
  $$ values (0) $$,
  'admin A cannot see company B event'
);

select throws_ok(
  $$ insert into public.events (company_id, client_id, name, address, organizer_email, starts_at, ends_at)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c2222222-2222-2222-2222-222222222222', 'Intruso', 'D', 'o@x.com', now(), now() + interval '1 hour') $$,
  '42501',
  'new row violates row-level security policy for table "events"',
  'WITH CHECK blocks INSERT with foreign company_id'
);

select * from finish();
rollback;
