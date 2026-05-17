begin;
select plan(2);

-- Setup: company + admin_user + user en auth.users
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'phase0test@a.com', '', now());

insert into public.companies (id, name, slug) values
  ('bbbbbbbb-1111-1111-1111-111111111111', 'Phase0 Co', 'phase0-co');

insert into public.admin_users (id, company_id, email, full_name) values
  ('aaaaaaaa-1111-1111-1111-111111111111',
   'bbbbbbbb-1111-1111-1111-111111111111',
   'phase0test@a.com',
   'Phase0 Tester');

-- Llamar al hook como lo llamaría Supabase Auth
select is(
  public.custom_access_token_hook(
    jsonb_build_object(
      'user_id', 'aaaaaaaa-1111-1111-1111-111111111111',
      'claims', '{}'::jsonb
    )
  ) -> 'claims' ->> 'company_id',
  'bbbbbbbb-1111-1111-1111-111111111111',
  'hook injects company_id from admin_users into claims'
);

-- Caso de user sin admin_users row: claims sin company_id
delete from public.admin_users where id = 'aaaaaaaa-1111-1111-1111-111111111111';

select ok(
  (public.custom_access_token_hook(
    jsonb_build_object(
      'user_id', 'aaaaaaaa-1111-1111-1111-111111111111',
      'claims', '{}'::jsonb
    )
  ) -> 'claims') ? 'company_id' is false,
  'hook does not add company_id when user has no admin_users row'
);

select * from finish();
rollback;
