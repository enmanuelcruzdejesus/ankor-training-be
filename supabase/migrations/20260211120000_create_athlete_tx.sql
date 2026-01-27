create or replace function public.create_athlete_tx(
  p_user_id uuid,
  p_org_id uuid,
  p_first_name text,
  p_last_name text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_cell_number text,
  p_graduation_year smallint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_athlete_id uuid;
begin
  v_full_name := nullif(trim(coalesce(p_full_name, '')), '');
  if v_full_name is null then
    v_full_name := nullif(trim(concat_ws(' ', p_first_name, p_last_name)), '');
  end if;

  insert into public.profiles (
    id,
    user_id,
    full_name,
    default_org_id,
    phone,
    first_name,
    last_name,
    email,
    role
  )
  values (
    p_user_id,
    p_user_id,
    v_full_name,
    p_org_id,
    coalesce(p_phone, p_cell_number),
    p_first_name,
    p_last_name,
    p_email,
    'athlete'
  );

  insert into public.org_memberships (org_id, user_id, role, is_active)
  values (p_org_id, p_user_id, 'athlete', true)
  on conflict (org_id, user_id) do update
    set role = excluded.role,
        is_active = true;

  insert into public.athletes (
    org_id,
    user_id,
    first_name,
    last_name,
    full_name,
    email,
    phone,
    cell_number,
    graduation_year
  )
  values (
    p_org_id,
    p_user_id,
    p_first_name,
    p_last_name,
    v_full_name,
    p_email,
    p_phone,
    p_cell_number,
    p_graduation_year
  )
  returning id into v_athlete_id;

  return v_athlete_id;
end;
$$;
