begin;

alter table public.student_surveys add column if not exists deleted_at timestamptz;
drop index if exists public.student_surveys_one_active_identity;
create unique index student_surveys_one_active_identity
on public.student_surveys(student_id,student_name)
where not is_test_data and superseded_at is null and deleted_at is null;

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
  on conflict(student_id, student_name) where not is_test_data and superseded_at is null and deleted_at is null
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
  select s.id,s.student_id,s.student_name,s.grade,s.wake_time,s.sleep_time,s.shower_time,
    s.shower_frequency,s.tidiness,s.noise_sensitivity,s.preferred_temperature,
    s.light_sensitivity,s.ventilation_preference,s.alarm_sensitivity,s.room_activity,s.is_test_data,s.updated_at
  from public.student_surveys s where s.superseded_at is null and s.deleted_at is null
  order by s.updated_at desc,s.id desc;
$$;

create or replace function public.delete_student_survey_by_key(p_admin_key text,p_survey_id uuid)
returns boolean language plpgsql security definer set search_path = public,extensions as $$
declare changed integer;
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode='28000'; end if;
  update public.student_surveys set deleted_at=clock_timestamp()
  where id=p_survey_id and deleted_at is null and superseded_at is null and not is_test_data;
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;

create or replace function public.get_deleted_student_surveys_by_key(p_admin_key text)
returns table(id uuid,student_id text,student_name text,deleted_at timestamptz)
language plpgsql stable security definer set search_path = public,extensions as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode='28000'; end if;
  return query select s.id,s.student_id,s.student_name,s.deleted_at from public.student_surveys s
  where s.deleted_at is not null and s.superseded_at is null and not s.is_test_data order by s.deleted_at desc,s.id desc;
end;
$$;

create or replace function public.restore_student_survey_by_key(p_admin_key text,p_survey_id uuid)
returns boolean language plpgsql security definer set search_path = public,extensions as $$
declare changed integer;
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode='28000'; end if;
  update public.student_surveys set deleted_at=null
  where id=p_survey_id and deleted_at is not null and superseded_at is null and not is_test_data;
  get diagnostics changed=row_count;
  return changed=1;
exception when unique_violation then
  raise exception '같은 학번·이름의 새 설문이 있습니다. 현재 접수 명단에서 최신 응답을 확인해 주세요.' using errcode='23505';
end;
$$;

create or replace function public.seed_test_student_surveys()
returns integer language plpgsql security definer set search_path = public as $$
declare inserted_count integer;
begin
  perform 1 from public.dormitory_management where id = true for update;
  delete from public.student_surveys where is_test_data = true;
  with roster as (
    select grade, grade::text || class_no::text || lpad(seat_no::text, 2, '0') as student_id,
      row_number() over(order by grade, class_no, seat_no) as n
    from public.dormitory_settings s cross join generate_series(1,3) grade
    cross join lateral generate_series(1,s.class_count) class_no
    cross join lateral generate_series(1,s.students_per_class) seat_no where s.id = true
  )
  insert into public.student_surveys (student_id, student_name, grade, wake_time, sleep_time, shower_time, shower_frequency, tidiness, noise_sensitivity, preferred_temperature, light_sensitivity, ventilation_preference, alarm_sensitivity, room_activity, roommate_preference, is_test_data)
  select r.student_id, '테스트학생' || r.student_id, r.grade::smallint,
    (time '06:30' + ((r.n * 7) % 91) * interval '1 minute')::time,
    (time '22:30' + ((r.n * 11) % 181) * interval '1 minute')::time,
    (time '06:20' + ((r.n * 37) % 1081) * interval '1 minute')::time,
    (((r.n - 1) % 3) + 1)::smallint, (((r.n - 1) % 5) + 1)::smallint,
    (((r.n + 1) % 5) + 1)::smallint, (20 + ((r.n - 1) % 6))::smallint,
    (((r.n + 2) % 5) + 1)::smallint, (((r.n + 3) % 5) + 1)::smallint,
    (((r.n + 4) % 5) + 1)::smallint, (((r.n + 1) % 5) + 1)::smallint,
    '[TEST] 학교 명단 기반 자동 생성 학생', true
  from roster r where not exists (select 1 from public.student_surveys existing where existing.student_id = r.student_id and not existing.is_test_data and existing.superseded_at is null and existing.deleted_at is null);
  get diagnostics inserted_count = row_count;
  update public.dormitory_management set test_enabled = true, updated_at = now() where id = true;
  return inserted_count;
end;
$$;

-- Broadcast only an invalidation signal. Student details remain behind keyed RPCs.
create or replace function public.notify_roomfit_refresh()
returns trigger language plpgsql security definer set search_path = public,pg_temp as $$
begin
  perform realtime.send(jsonb_build_object('entity',TG_TABLE_NAME),'refresh','roomfit-admin-refresh',false);
  return null;
end;
$$;
drop trigger if exists roomfit_surveys_refresh on public.student_surveys;
create trigger roomfit_surveys_refresh after insert or update or delete on public.student_surveys
for each statement execute function public.notify_roomfit_refresh();
drop trigger if exists roomfit_settings_refresh on public.dormitory_settings;
create trigger roomfit_settings_refresh after update on public.dormitory_settings
for each statement execute function public.notify_roomfit_refresh();
drop trigger if exists roomfit_management_refresh on public.dormitory_management;
create trigger roomfit_management_refresh after update on public.dormitory_management
for each statement execute function public.notify_roomfit_refresh();

revoke all on function public.get_student_surveys_for_admin() from public;
revoke all on function public.submit_student_survey(jsonb) from public;
revoke all on function public.delete_student_survey_by_key(text,uuid) from public;
revoke all on function public.restore_student_survey_by_key(text,uuid) from public;
revoke all on function public.get_deleted_student_surveys_by_key(text) from public;
revoke all on function public.notify_roomfit_refresh() from public;
grant execute on function public.submit_student_survey(jsonb) to anon,authenticated;
grant execute on function public.delete_student_survey_by_key(text,uuid) to anon,authenticated;
grant execute on function public.restore_student_survey_by_key(text,uuid) to anon,authenticated;
grant execute on function public.get_deleted_student_surveys_by_key(text) to anon,authenticated;

commit;
