begin;
select plan(4);

-- Setup: crear dos companies y dos admin_users en auth.users
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', 'admin1@a.com', '', now()),
  ('22222222-2222-2222-2222-222222222222', 'admin2@b.com', '', now());

insert into public.companies (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Empresa A', 'empresa-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Empresa B', 'empresa-b');

insert into public.admin_users (id, company_id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin1@a.com', 'Admin A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin2@b.com', 'Admin B');

insert into public.audit_log (company_id, actor_id, action, entity_type) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'test.A', 'test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'test.B', 'test');

-- Simular sesión como Admin A
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Test 1: Admin A ve solo SU audit_log
select results_eq(
  $$ select count(*)::int from public.audit_log $$,
  $$ values (1) $$,
  'admin A only sees own company audit_log rows'
);

-- Test 2: Admin A ve solo su admin_user
select results_eq(
  $$ select count(*)::int from public.admin_users $$,
  $$ values (1) $$,
  'admin A only sees own admin_users row'
);

-- Test 3: Admin A ve CERO filas de companies (default-deny, sin policy)
select results_eq(
  $$ select count(*)::int from public.companies $$,
  $$ values (0) $$,
  'companies table is invisible to authenticated users (default-deny)'
);

-- Test 4: current_company_id() devuelve la empresa correcta
select is(
  public.current_company_id(),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'current_company_id returns admin A company'
);

select * from finish();
rollback;
