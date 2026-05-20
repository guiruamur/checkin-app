-- Verifica aislamiento multi-tenant en clients:
-- 1) Admin A solo ve sus clientes.
-- 2) El WITH CHECK rechaza INSERT con company_id ajeno.

begin;
select plan(3);

-- Setup como superuser (antes de impersonar)
insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'admina@a.com', '', now()),
  ('22222222-2222-2222-2222-222222222222', 'adminb@b.com', '', now());

insert into public.companies (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Empresa A', 'empresa-a-cli'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Empresa B', 'empresa-b-cli');

insert into public.admin_users (id, company_id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admina@a.com', 'Admin A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'adminb@b.com', 'Admin B');

insert into public.clients (company_id, name, contact_email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cliente A', 'a@cli.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Cliente B', 'b@cli.com');

-- Impersonar Admin A
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

-- Test 1: Admin A solo ve su cliente
select results_eq(
  $$ select count(*)::int from public.clients $$,
  $$ values (1) $$,
  'admin A only sees own company clients'
);

-- Test 2: Admin A no ve el cliente de B por email
select results_eq(
  $$ select count(*)::int from public.clients where contact_email = 'b@cli.com' $$,
  $$ values (0) $$,
  'admin A cannot see company B client'
);

-- Test 3: WITH CHECK rechaza INSERT con company_id ajeno
select throws_ok(
  $$ insert into public.clients (company_id, name, contact_email)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Intruso', 'x@x.com') $$,
  '42501',
  'new row violates row-level security policy for table "clients"',
  'WITH CHECK blocks INSERT with foreign company_id'
);

select * from finish();
rollback;
