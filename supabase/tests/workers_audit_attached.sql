-- Verifica que el trigger log_audit_event está pegado a workers y genera
-- entradas en audit_log con action correcto y diff coherente.

begin;
select plan(4);

-- Setup
insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('33333333-3333-3333-3333-333333333333', 'audit@a.com', '', now());

insert into public.companies (id, name, slug) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Audit Co', 'audit-co');

insert into public.admin_users (id, company_id, email, full_name) values
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'audit@a.com', 'Audit');

-- INSERT
insert into public.workers (id, company_id, email, phone, first_name, last_name)
values ('44444444-4444-4444-4444-444444444444',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'wt@x.com', '600000003', 'WT', 'Test');

select results_eq(
  $$ select action from public.audit_log
     where entity_id = '44444444-4444-4444-4444-444444444444'
       and action like 'workers.%'
     order by created_at $$,
  $$ values ('workers.insert'::text) $$,
  'INSERT on workers produces workers.insert audit row'
);

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '44444444-4444-4444-4444-444444444444'
      and action = 'workers.insert'
      and diff -> 'after' ->> 'email' = 'wt@x.com'
  ),
  'INSERT audit diff captures inserted email'
);

-- UPDATE (cambio de estado)
update public.workers set status = 'approved' where id = '44444444-4444-4444-4444-444444444444';

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '44444444-4444-4444-4444-444444444444'
      and action = 'workers.update'
      and diff -> 'before' ->> 'status' = 'pending'
      and diff -> 'after' ->> 'status' = 'approved'
  ),
  'UPDATE audit diff captures status change'
);

-- DELETE
delete from public.workers where id = '44444444-4444-4444-4444-444444444444';

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '44444444-4444-4444-4444-444444444444'
      and action = 'workers.delete'
  ),
  'DELETE on workers produces workers.delete audit row'
);

select * from finish();
rollback;
