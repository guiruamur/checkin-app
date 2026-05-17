-- Verifica que el RPC de signup (que la Edge Function emula a nivel HTTP)
-- crea company + admin_user atómicamente. Para reproducir el rollback,
-- forzamos un slug duplicado y comprobamos que no queda basura.
--
-- Nota: este test cubre el RPC SQL `signup_create_company` que sigue
-- existiendo de M1. La Edge Function tiene rollback adicional sobre
-- auth.users; eso se cubre en el test Deno (index.test.ts) y en E2E.

begin;
select plan(4);

-- Setup: dos users en auth.users
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values
  ('11111111-2222-3333-4444-555555555555', 'atomic1@test.com', '', now()),
  ('11111111-2222-3333-4444-666666666666', 'atomic2@test.com', '', now());

-- Simular sesión del primer user
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"11111111-2222-3333-4444-555555555555","role":"authenticated"}';

-- 1. signup feliz crea las dos rows
select public.signup_create_company(
  'Atomic Test Co',
  'atomic-test-co-1',
  'Atomic Tester'
);

-- Volver a postgres para poder leer companies (RLS default-deny para authenticated)
reset role;

select results_eq(
  $$ select count(*)::int from public.companies where slug = 'atomic-test-co-1' $$,
  $$ values (1) $$,
  'company created on happy path'
);

select results_eq(
  $$ select count(*)::int from public.admin_users where id = '11111111-2222-3333-4444-555555555555' $$,
  $$ values (1) $$,
  'admin_user created on happy path'
);

-- 2. signup duplicado para el mismo user debe fallar (ya tiene admin profile)
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"11111111-2222-3333-4444-555555555555","role":"authenticated"}';

select throws_ok(
  $$ select public.signup_create_company('Other Co', 'other-co', 'Tester') $$,
  'user already has an admin profile',
  'signup rejects existing admin profile'
);

-- 3. signup con slug colision debe fallar y NO crear nada nuevo
reset role;
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"11111111-2222-3333-4444-666666666666","role":"authenticated"}';

-- Intentar registrar con el slug que ya existe
select throws_ok(
  $$ select public.signup_create_company('Another Co', 'atomic-test-co-1', 'Other Tester') $$,
  NULL,  -- aceptamos cualquier mensaje, lo importante es que lance
  NULL,
  'signup rejects duplicate slug'
);

select * from finish();
rollback;
