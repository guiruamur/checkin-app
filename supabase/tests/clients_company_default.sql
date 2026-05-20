-- Verifica que el default de company_id rellena el valor desde el claim
-- JWT cuando el INSERT no lo especifica (caso del SPA admin).

begin;
select plan(1);

-- Setup como superuser
insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('33333333-3333-3333-3333-333333333333', 'def@a.com', '', now());

insert into public.companies (id, name, slug) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Default Co', 'default-co-cli');

insert into public.admin_users (id, company_id, email, full_name) values
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'def@a.com', 'Def');

-- Impersonar admin de Default Co
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","company_id":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';

-- INSERT sin company_id -> el default lo rellena del claim
insert into public.clients (name, contact_email) values ('Sin Company', 's@s.com');

select results_eq(
  $$ select company_id from public.clients where contact_email = 's@s.com' $$,
  $$ values ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid) $$,
  'company_id default fills from JWT claim on INSERT without company_id'
);

select * from finish();
rollback;
