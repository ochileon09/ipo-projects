begin;

alter table public.student_surveys add column if not exists updated_at timestamptz;
alter table public.student_surveys add column if not exists superseded_at timestamptz;
update public.student_surveys set updated_at = created_at where updated_at is null;
alter table public.student_surveys alter column updated_at set default now();
alter table public.student_surveys alter column updated_at set not null;

-- Preserve older duplicate submissions for recovery, but serve only the latest live row.
with ranked as (
  select id, row_number() over (
    partition by btrim(student_id), btrim(student_name)
    order by updated_at desc, created_at desc, id desc
  ) as position
  from public.student_surveys where not is_test_data and superseded_at is null
)
update public.student_surveys s set superseded_at = now()
from ranked r where s.id = r.id and r.position > 1;
update public.student_surveys set student_id = btrim(student_id), student_name = btrim(student_name)
where not is_test_data and superseded_at is null;

create unique index if not exists student_surveys_one_active_identity
on public.student_surveys(student_id, student_name)
where not is_test_data and superseded_at is null;

create or replace function public.submit_student_survey(p_survey jsonb)
returns table(survey_id uuid, submitted_at timestamptz, was_updated boolean, matches_school_roster boolean)
language plpgsql security definer set search_path = public as $$
declare
  submitted_id text := btrim(p_survey->>'student_id');
  submitted_name text := btrim(p_survey->>'student_name');
begin
  if coalesce(submitted_id, '') !~ '^[1-3][1-9](0[1-9]|[12][0-9]|30)$' then
    raise exception '학년·반·번호 순서의 네 자리 학번을 입력해 주세요.' using errcode = '22023';
  end if;
  if coalesce(char_length(submitted_name), 0) not between 1 and 30 then
    raise exception '이름은 공백을 제외하고 1~30자로 입력해 주세요.' using errcode = '22023';
  end if;
  return query
  insert into public.student_surveys as s (
    student_id, student_name, grade, wake_time, sleep_time, shower_time, shower_frequency,
    tidiness, noise_sensitivity, preferred_temperature, light_sensitivity, ventilation_preference,
    alarm_sensitivity, room_activity, roommate_preference, accessibility_needs,
    is_test_data, updated_at
  ) values (
    submitted_id, submitted_name, left(submitted_id,1)::smallint,
    (p_survey->>'wake_time')::time, (p_survey->>'sleep_time')::time,
    (p_survey->>'shower_time')::time, (p_survey->>'shower_frequency')::smallint,
    (p_survey->>'tidiness')::smallint, (p_survey->>'noise_sensitivity')::smallint,
    (p_survey->>'preferred_temperature')::smallint, (p_survey->>'light_sensitivity')::smallint,
    (p_survey->>'ventilation_preference')::smallint, (p_survey->>'alarm_sensitivity')::smallint,
    (p_survey->>'room_activity')::smallint,
    nullif(btrim(p_survey->>'roommate_preference'), ''),
    nullif(btrim(p_survey->>'accessibility_needs'), ''), false, clock_timestamp()
  )
  on conflict(student_id, student_name) where not is_test_data and superseded_at is null
  do update set grade = excluded.grade, wake_time = excluded.wake_time, sleep_time = excluded.sleep_time,
    shower_time = excluded.shower_time, shower_frequency = excluded.shower_frequency,
    tidiness = excluded.tidiness, noise_sensitivity = excluded.noise_sensitivity,
    preferred_temperature = excluded.preferred_temperature, light_sensitivity = excluded.light_sensitivity,
    ventilation_preference = excluded.ventilation_preference, alarm_sensitivity = excluded.alarm_sensitivity,
    room_activity = excluded.room_activity, roommate_preference = excluded.roommate_preference,
    accessibility_needs = excluded.accessibility_needs, updated_at = excluded.updated_at
  returning s.id, s.updated_at, (s.xmax <> 0), exists(
    select 1 from public.dormitory_settings settings
    where settings.id = true and substring(submitted_id,2,1)::integer between 1 and settings.class_count
      and substring(submitted_id,3,2)::integer between 1 and settings.students_per_class
  );
end;
$$;

create or replace function public.get_student_surveys_for_admin()
returns table (id uuid, student_id text, student_name text, grade smallint, wake_time time, sleep_time time, shower_time time, shower_frequency smallint, tidiness smallint, noise_sensitivity smallint, preferred_temperature smallint, light_sensitivity smallint, ventilation_preference smallint, alarm_sensitivity smallint, room_activity smallint, is_test boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  -- Keep the existing RPC signature compatible: its timestamp is the latest submission time.
  select s.id, s.student_id, s.student_name, s.grade, s.wake_time, s.sleep_time, s.shower_time,
    s.shower_frequency, s.tidiness, s.noise_sensitivity, s.preferred_temperature,
    s.light_sensitivity, s.ventilation_preference, s.alarm_sensitivity, s.room_activity,
    s.is_test_data, s.updated_at
  from public.student_surveys s where s.superseded_at is null order by s.updated_at desc, s.id desc;
$$;

alter table public.dormitory_management alter column test_enabled set default false;
update public.dormitory_management set test_enabled = false, updated_at = now() where id = true;

revoke all on function public.submit_student_survey(jsonb) from public;
grant execute on function public.submit_student_survey(jsonb) to anon, authenticated;
revoke all on function public.get_student_surveys_for_admin() from public;

commit;
