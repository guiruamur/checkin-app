-- El default de company_id rellena el valor desde el claim al insertar sin él.
begin;
select plan(1);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('33333333-3333-3333-3333-333333333333', 'ed@a.com', '', now());
insert into public.companies (id, name, slug) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Def Co', 'def-co-ev');
insert into public.admin_users (id, company_id, email, full_name) values
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'ed@a.com', 'D');
insert into public.clients (id, company_id, name, contact_email) values
  ('c3333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Cli', 'c@cli.com');

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","company_id":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';

insert into public.events (client_id, name, address, organizer_email, starts_at, ends_at)
values ('c3333333-3333-3333-3333-333333333333', 'Sin Company', 'Dir', 'o@x.com', now(), now() + interval '1 hour');

select results_eq(
  $$ select company_id from public.events where name = 'Sin Company' $$,
  $$ values ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid) $$,
  'events.company_id default fills from JWT claim'
);

select * from finish();
rollback;
