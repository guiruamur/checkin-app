-- Issue 2 del final review M2 Fase 0: el test viejo validaba el RPC M1
-- signup_create_company que ya no existe. Reescrito para validar el RPC
-- nuevo create_company_and_admin que es el que la Edge Function usa.
--
-- create_company_and_admin se ejecuta como service_role (Edge Function),
-- no como authenticated. Por eso aquí simulamos esa llamada sin role
-- switching ni JWT claims (el RPC no depende de auth.uid()).

begin;
select plan(5);

-- Setup: dos users en auth.users (la Edge Function los crea via
-- auth.admin.createUser, aquí los insertamos directamente).
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values
  ('11111111-2222-3333-4444-555555555555', 'atomic1@test.com', '', now()),
  ('11111111-2222-3333-4444-666666666666', 'atomic2@test.com', '', now());

-- 1. Caso feliz: el RPC crea las dos rows atómicamente y devuelve company_id
select isnt(
  public.create_company_and_admin(
    '11111111-2222-3333-4444-555555555555',
    'atomic1@test.com',
    'Atomic Test Co',
    'atomic-test-co-1',
    'Atomic Tester'
  ),
  NULL,
  'happy path returns company_id (not null)'
);

select results_eq(
  $$ select count(*)::int from public.companies where slug = 'atomic-test-co-1' $$,
  $$ values (1) $$,
  'company row created on happy path'
);

select results_eq(
  $$ select count(*)::int from public.admin_users
     where id = '11111111-2222-3333-4444-555555555555' $$,
  $$ values (1) $$,
  'admin_user row created on happy path'
);

-- 2. Slug colision: el segundo intento con mismo slug debe lanzar Y NO crear
-- ninguna fila. Esto valida la atomicidad — sin transacción, el INSERT en
-- companies fallaría pero podría haber dejado basura si la implementación
-- fuera secuencial.
select throws_ok(
  $$ select public.create_company_and_admin(
      '11111111-2222-3333-4444-666666666666',
      'atomic2@test.com',
      'Another Co',
      'atomic-test-co-1',
      'Other Tester'
    ) $$,
  '23505',  -- unique_violation
  NULL,
  'rpc rejects duplicate slug with unique_violation'
);

-- Verificar que el segundo intento NO creó admin_user para el user 2
select results_eq(
  $$ select count(*)::int from public.admin_users
     where id = '11111111-2222-3333-4444-666666666666' $$,
  $$ values (0) $$,
  'failed signup leaves zero rows (atomicity proven)'
);

select * from finish();
rollback;
