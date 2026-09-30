create extension if not exists pgcrypto with schema extensions;

create or replace function public.verify_school_admin_key(p_admin_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select encode(extensions.digest(convert_to(coalesce(p_admin_key, ''), 'UTF8'), 'sha256'), 'hex')
    = '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5';
$$;

create or replace function public.get_student_surveys_for_admin_by_key(p_admin_key text)
returns table (
  id uuid,
  student_id text,
  student_name text,
  grade smallint,
  wake_time time,
  sleep_time time,
  tidiness smallint,
  noise_sensitivity smallint,
  preferred_temperature smallint,
  is_test boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then
    raise exception '학교 인증키가 올바르지 않습니다.' using errcode = '28000';
  end if;

  return query select * from public.get_student_surveys_for_admin();
end;
$$;

create or replace function public.get_dormitory_settings_by_key(p_admin_key text)
returns table (total_capacity integer, room_capacity integer, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then
    raise exception '학교 인증키가 올바르지 않습니다.' using errcode = '28000';
  end if;

  return query select * from public.get_dormitory_settings();
end;
$$;

create or replace function public.set_dormitory_settings_by_key(
  p_admin_key text,
  p_total_capacity integer,
  p_room_capacity integer
)
returns table (total_capacity integer, room_capacity integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then
    raise exception '학교 인증키가 올바르지 않습니다.' using errcode = '28000';
  end if;

  return query
    select * from public.set_dormitory_settings(p_total_capacity, p_room_capacity);
end;
$$;

create or replace function public.seed_test_student_surveys_by_key(
  p_admin_key text,
  p_count integer
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then
    raise exception '학교 인증키가 올바르지 않습니다.' using errcode = '28000';
  end if;

  return public.seed_test_student_surveys(p_count);
end;
$$;

revoke all on function public.verify_school_admin_key(text) from public;
revoke all on function public.get_student_surveys_for_admin_by_key(text) from public;
revoke all on function public.get_dormitory_settings_by_key(text) from public;
revoke all on function public.set_dormitory_settings_by_key(text, integer, integer) from public;
revoke all on function public.seed_test_student_surveys_by_key(text, integer) from public;

grant execute on function public.verify_school_admin_key(text) to anon, authenticated;
grant execute on function public.get_student_surveys_for_admin_by_key(text) to anon, authenticated;
grant execute on function public.get_dormitory_settings_by_key(text) to anon, authenticated;
grant execute on function public.set_dormitory_settings_by_key(text, integer, integer) to anon, authenticated;
grant execute on function public.seed_test_student_surveys_by_key(text, integer) to anon, authenticated;
