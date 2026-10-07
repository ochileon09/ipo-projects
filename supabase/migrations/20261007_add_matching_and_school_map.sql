alter table public.student_surveys
  add column if not exists shower_time time not null default '07:40',
  add column if not exists shower_frequency smallint not null default 1 check (shower_frequency between 1 and 3),
  add column if not exists light_sensitivity smallint not null default 3 check (light_sensitivity between 1 and 5),
  add column if not exists ventilation_preference smallint not null default 3 check (ventilation_preference between 1 and 5),
  add column if not exists alarm_sensitivity smallint not null default 3 check (alarm_sensitivity between 1 and 5),
  add column if not exists room_activity smallint not null default 3 check (room_activity between 1 and 5);

alter table public.dormitory_settings
  add column if not exists class_count integer not null default 6 check (class_count between 1 and 9),
  add column if not exists students_per_class integer not null default 16 check (students_per_class between 1 and 30);

alter table public.dormitory_settings drop constraint if exists dormitory_settings_total_capacity_check;
alter table public.dormitory_settings add constraint dormitory_settings_total_capacity_check check (total_capacity between 3 and 810);

update public.dormitory_settings
set class_count = 6,
    students_per_class = 16,
    total_capacity = 288,
    room_capacity = 2,
    updated_at = now()
where id = true;

drop function if exists public.set_dormitory_settings_by_key(text, integer, integer);
drop function if exists public.set_dormitory_settings(integer, integer);
drop function if exists public.get_dormitory_settings_by_key(text);
drop function if exists public.get_dormitory_settings();
drop function if exists public.seed_test_student_surveys_by_key(text, integer);
drop function if exists public.seed_test_student_surveys(integer);

create function public.get_dormitory_settings()
returns table (
  total_capacity integer,
  room_capacity integer,
  class_count integer,
  students_per_class integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    settings.total_capacity,
    settings.room_capacity,
    settings.class_count,
    settings.students_per_class,
    settings.updated_at
  from public.dormitory_settings settings
  where settings.id = true;
$$;

create function public.set_dormitory_settings(
  p_room_capacity integer,
  p_class_count integer,
  p_students_per_class integer
)
returns table (
  total_capacity integer,
  room_capacity integer,
  class_count integer,
  students_per_class integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  calculated_capacity integer;
begin
  if p_room_capacity < 1 or p_room_capacity > 6 then
    raise exception '방 정원은 1명 이상 6명 이하여야 합니다.';
  end if;
  if p_class_count not between 1 and 9 then
    raise exception '반 수는 1개 이상 9개 이하여야 합니다.';
  end if;
  if p_students_per_class not between 1 and 30 then
    raise exception '반당 학생 수는 1명 이상 30명 이하여야 합니다.';
  end if;

  calculated_capacity := 3 * p_class_count * p_students_per_class;

  update public.dormitory_settings settings set
    total_capacity = calculated_capacity,
    room_capacity = p_room_capacity,
    class_count = p_class_count,
    students_per_class = p_students_per_class,
    updated_at = now()
  where settings.id = true;

  return query select * from public.get_dormitory_settings();
end;
$$;

create function public.get_dormitory_settings_by_key(p_admin_key text)
returns table (
  total_capacity integer,
  room_capacity integer,
  class_count integer,
  students_per_class integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then
    raise exception '관리자 인증키가 올바르지 않습니다.' using errcode = '28000';
  end if;
  return query select * from public.get_dormitory_settings();
end;
$$;

create function public.set_dormitory_settings_by_key(
  p_admin_key text,
  p_room_capacity integer,
  p_class_count integer,
  p_students_per_class integer
)
returns table (
  total_capacity integer,
  room_capacity integer,
  class_count integer,
  students_per_class integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then
    raise exception '관리자 인증키가 올바르지 않습니다.' using errcode = '28000';
  end if;
  return query select * from public.set_dormitory_settings(
    p_room_capacity,
    p_class_count,
    p_students_per_class
  );
end;
$$;

create function public.seed_test_student_surveys()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  delete from public.student_surveys where coalesce(roommate_preference like '[TEST]%', false);

  with grade_settings as (
    select grade, settings.class_count, settings.students_per_class
    from public.dormitory_settings settings
    cross join generate_series(1, 3) as grade
    where settings.id = true
  ), school_roster as (
    select
      config.grade,
      class_no,
      seat_no,
      row_number() over (order by config.grade, class_no, seat_no) as roster_no,
      config.grade::text || class_no::text || lpad(seat_no::text, 2, '0') as student_id
    from grade_settings config
    cross join lateral generate_series(1, config.class_count) as class_no
    cross join lateral generate_series(1, config.students_per_class) as seat_no
  )
  insert into public.student_surveys (
    student_id, student_name, grade, wake_time, sleep_time,
    shower_time, shower_frequency, tidiness, noise_sensitivity,
    preferred_temperature, light_sensitivity, ventilation_preference,
    alarm_sensitivity, room_activity, roommate_preference, accessibility_needs
  )
  select
    roster.student_id,
    '테스트학생' || roster.student_id,
    roster.grade::smallint,
    (time '06:30' + ((roster.roster_no * 7) % 91) * interval '1 minute')::time,
    (time '22:30' + ((roster.roster_no * 11) % 181) * interval '1 minute')::time,
    (time '06:20' + ((roster.roster_no * 37) % 1081) * interval '1 minute')::time,
    (((roster.roster_no - 1) % 3) + 1)::smallint,
    (((roster.roster_no - 1) % 5) + 1)::smallint,
    (((roster.roster_no + 1) % 5) + 1)::smallint,
    (20 + ((roster.roster_no - 1) % 6))::smallint,
    (((roster.roster_no + 2) % 5) + 1)::smallint,
    (((roster.roster_no + 3) % 5) + 1)::smallint,
    (((roster.roster_no + 4) % 5) + 1)::smallint,
    (((roster.roster_no + 1) % 5) + 1)::smallint,
    '[TEST] 학교 명단 기반 자동 생성 학생',
    null
  from school_roster roster
  where not exists (
    select 1 from public.student_surveys existing
    where existing.student_id = roster.student_id
      and not coalesce(existing.roommate_preference like '[TEST]%', false)
  );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create function public.seed_test_student_surveys_by_key(p_admin_key text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then
    raise exception '관리자 인증키가 올바르지 않습니다.' using errcode = '28000';
  end if;
  return public.seed_test_student_surveys();
end;
$$;

drop function if exists public.get_student_surveys_for_admin_by_key(text);
drop function if exists public.get_student_surveys_for_admin();

create function public.get_student_surveys_for_admin()
returns table (
  id uuid, student_id text, student_name text, grade smallint,
  wake_time time, sleep_time time, shower_time time, shower_frequency smallint,
  tidiness smallint, noise_sensitivity smallint, preferred_temperature smallint,
  light_sensitivity smallint, ventilation_preference smallint,
  alarm_sensitivity smallint, room_activity smallint,
  is_test boolean, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    survey.id, survey.student_id, survey.student_name, survey.grade,
    survey.wake_time, survey.sleep_time, survey.shower_time, survey.shower_frequency,
    survey.tidiness, survey.noise_sensitivity, survey.preferred_temperature,
    survey.light_sensitivity, survey.ventilation_preference,
    survey.alarm_sensitivity, survey.room_activity,
    coalesce(survey.roommate_preference like '[TEST]%', false), survey.created_at
  from public.student_surveys survey
  order by survey.created_at desc;
$$;

create function public.get_student_surveys_for_admin_by_key(p_admin_key text)
returns table (
  id uuid, student_id text, student_name text, grade smallint,
  wake_time time, sleep_time time, shower_time time, shower_frequency smallint,
  tidiness smallint, noise_sensitivity smallint, preferred_temperature smallint,
  light_sensitivity smallint, ventilation_preference smallint,
  alarm_sensitivity smallint, room_activity smallint,
  is_test boolean, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then
    raise exception '관리자 인증키가 올바르지 않습니다.' using errcode = '28000';
  end if;
  return query select * from public.get_student_surveys_for_admin();
end;
$$;

revoke all on function public.get_dormitory_settings() from public;
revoke all on function public.get_dormitory_settings_by_key(text) from public;
revoke all on function public.set_dormitory_settings(integer, integer, integer) from public;
revoke all on function public.set_dormitory_settings_by_key(text, integer, integer, integer) from public;
revoke all on function public.seed_test_student_surveys() from public;
revoke all on function public.seed_test_student_surveys_by_key(text) from public;
revoke all on function public.get_student_surveys_for_admin() from public;
revoke all on function public.get_student_surveys_for_admin_by_key(text) from public;

grant execute on function public.get_dormitory_settings_by_key(text) to anon, authenticated;
grant execute on function public.set_dormitory_settings_by_key(text, integer, integer, integer) to anon, authenticated;
grant execute on function public.seed_test_student_surveys_by_key(text) to anon, authenticated;
grant execute on function public.get_student_surveys_for_admin_by_key(text) to anon, authenticated;

