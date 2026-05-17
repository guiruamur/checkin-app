-- admin_users: una fila por cada user de auth.users que es admin de una empresa
create table public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  full_name text not null,
  created_at timestamptz not null default now()
);

create index admin_users_company_idx on public.admin_users (company_id);

alter table public.admin_users enable row level security;

create policy admin_users_self_read on public.admin_users
  for select to authenticated
  using (id = auth.uid());

-- helper function: extraer company_id del usuario actual
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.admin_users where id = auth.uid();
$$;

grant execute on function public.current_company_id() to authenticated;

-- RPC para el signup: crea company + admin_user atómicamente
-- el usuario ya existe en auth.users (creado por supabase.auth.signUp)
-- esta RPC añade su company y admin_user
create or replace function public.signup_create_company(
  p_company_name text,
  p_company_slug text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_company_id uuid;
begin
  if v_user_id is null then
    raise exception 'must be authenticated';
  end if;

  if exists (select 1 from public.admin_users where id = v_user_id) then
    raise exception 'user already has an admin profile';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  insert into public.companies (name, slug)
  values (p_company_name, p_company_slug)
  returning id into v_company_id;

  insert into public.admin_users (id, company_id, email, full_name)
  values (v_user_id, v_company_id, v_email, p_full_name);

  return v_company_id;
end;
$$;

grant execute on function public.signup_create_company(text, text, text) to authenticated;
