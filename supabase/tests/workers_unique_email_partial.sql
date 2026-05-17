-- Verifica que el UNIQUE(company_id, lower(email)) WHERE archived_at IS NULL
-- bloquea duplicados en estados activos pero permite re-registro tras archivar.

begin;
select plan(3);

-- Setup
insert into public.companies (id, name, slug) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Unique Co', 'unique-co');

-- Test 1: insert inicial OK
insert into public.workers (id, company_id, email, phone, first_name, last_name) values
  ('55555555-5555-5555-5555-555555555555',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'dup@x.com', '600000010', 'W1', 'Test');

select results_eq(
  $$ select count(*)::int from public.workers where email = 'dup@x.com' $$,
  $$ values (1) $$,
  'first insert with email succeeds'
);

-- Test 2: insert duplicado mismo email + mismo company falla
select throws_ok(
  $$ insert into public.workers (company_id, email, phone, first_name, last_name)
     values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dup@x.com', '600000011', 'W2', 'Test') $$,
  '23505',
  NULL,
  'duplicate email in same company while active raises unique_violation'
);

-- Test 3: archivar primero, luego insert con mismo email funciona
update public.workers set archived_at = now()
  where id = '55555555-5555-5555-5555-555555555555';

insert into public.workers (company_id, email, phone, first_name, last_name) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dup@x.com', '600000012', 'W3', 'Test');

select results_eq(
  $$ select count(*)::int from public.workers where email = 'dup@x.com' and archived_at is null $$,
  $$ values (1) $$,
  'after archiving original, re-registration with same email succeeds'
);

select * from finish();
rollback;
