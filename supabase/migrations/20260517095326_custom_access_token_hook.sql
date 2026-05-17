-- Supabase Auth Hook tipo custom_access_token.
-- Cada vez que un user de auth.users emite un access token (login, refresh),
-- este hook inyecta company_id como claim custom leyendo desde admin_users.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_claims jsonb;
begin
  select company_id into v_company_id
  from public.admin_users
  where id = (event->>'user_id')::uuid;

  v_claims := event->'claims';

  if v_company_id is not null then
    v_claims := jsonb_set(v_claims, '{company_id}', to_jsonb(v_company_id::text));
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
