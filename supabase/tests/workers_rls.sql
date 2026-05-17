-- Verifica que un admin de Empresa A NO ve workers de Empresa B.
-- Crítico para multi-tenant: si esta regla se rompe, leak entre empresas cliente.

begin;
select plan(2);

-- Setup: 2 companies + 2 admin_users + 2 workers (uno por company)
insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'admina@a.com', '', now()),
  ('22222222-2222-2222-2222-222222222222', 'adminb@b.com', '', now());

insert into public.companies (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Empresa A', 'empresa-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Empresa B', 'empresa-b');

insert into public.admin_users (id, company_id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admina@a.com', 'Admin A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'adminb@b.com', 'Admin B');

insert into public.workers (company_id, email, phone, first_name, last_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'worker_a@x.com', '600000001', 'WA', 'Test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'worker_b@x.com', '600000002', 'WB', 'Test');

-- Impersonar Admin A (JWT con company_id de Empresa A)
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

-- Test 1: Admin A solo ve SU worker
select results_eq(
  $$ select count(*)::int from public.workers $$,
  $$ values (1) $$,
  'admin A only sees own company workers'
);

-- Test 2: Admin A no puede SELECT específico de worker B
select results_eq(
  $$ select count(*)::int from public.workers where email = 'worker_b@x.com' $$,
  $$ values (0) $$,
  'admin A cannot see admin B specific worker by email lookup'
);

select * from finish();
rollback;
