begin;

alter table public.student_surveys
  add column if not exists shower_duration_minutes smallint check (shower_duration_minutes between 1 and 60),
  add column if not exists night_noise_activity smallint check (night_noise_activity between 1 and 5),
  add column if not exists night_light_usage smallint check (night_light_usage between 1 and 5),
  add column if not exists alarm_repeats smallint check (alarm_repeats between 0 and 5);

create or replace function public.submit_student_survey(p_survey jsonb)
returns table(survey_id uuid, submitted_at timestamptz, was_updated boolean, matches_school_roster boolean)
language plpgsql security definer set search_path=public as $$
declare
  submitted_id text:=btrim(p_survey->>'student_id');
  submitted_name text:=btrim(p_survey->>'student_name');
  field text; minimum integer; maximum integer;
begin
  if coalesce(submitted_id,'') !~ '^[1-3][1-9](0[1-9]|[12][0-9]|30)$' then
    raise exception '학년·반·번호 순서의 네 자리 학번을 입력해 주세요.' using errcode='22023';
  end if;
  if coalesce(char_length(submitted_name),0) not between 1 and 30 then
    raise exception '이름은 공백을 제외하고 1~30자로 입력해 주세요.' using errcode='22023';
  end if;
  foreach field in array array['shower_duration_minutes','night_noise_activity','night_light_usage','alarm_repeats'] loop
    if p_survey->>field is not null then
      if p_survey->>field !~ '^[0-9]{1,2}$' then raise exception '추가 설문 항목은 올바른 정수로 입력해 주세요.' using errcode='22023'; end if;
      minimum:=case when field='alarm_repeats' then 0 else 1 end;
      maximum:=case when field='shower_duration_minutes' then 60 else 5 end;
      if (p_survey->>field)::integer not between minimum and maximum then raise exception '추가 설문 값이 허용 범위를 벗어났습니다.' using errcode='22023'; end if;
    end if;
  end loop;
  return query insert into public.student_surveys as s (
    student_id,student_name,grade,wake_time,sleep_time,shower_time,shower_frequency,
    tidiness,noise_sensitivity,preferred_temperature,light_sensitivity,ventilation_preference,
    alarm_sensitivity,room_activity,roommate_preference,accessibility_needs,is_test_data,updated_at,
    shower_duration_minutes,night_noise_activity,night_light_usage,alarm_repeats
  ) values (
    submitted_id,submitted_name,left(submitted_id,1)::smallint,
    (p_survey->>'wake_time')::time,(p_survey->>'sleep_time')::time,(p_survey->>'shower_time')::time,(p_survey->>'shower_frequency')::smallint,
    (p_survey->>'tidiness')::smallint,(p_survey->>'noise_sensitivity')::smallint,(p_survey->>'preferred_temperature')::smallint,
    (p_survey->>'light_sensitivity')::smallint,(p_survey->>'ventilation_preference')::smallint,(p_survey->>'alarm_sensitivity')::smallint,
    (p_survey->>'room_activity')::smallint,nullif(btrim(p_survey->>'roommate_preference'),''),nullif(btrim(p_survey->>'accessibility_needs'),''),false,clock_timestamp(),
    (p_survey->>'shower_duration_minutes')::smallint,(p_survey->>'night_noise_activity')::smallint,(p_survey->>'night_light_usage')::smallint,(p_survey->>'alarm_repeats')::smallint
  ) on conflict(student_id,student_name) where not is_test_data and superseded_at is null and deleted_at is null
  do update set grade=excluded.grade,wake_time=excluded.wake_time,sleep_time=excluded.sleep_time,shower_time=excluded.shower_time,
    shower_frequency=excluded.shower_frequency,tidiness=excluded.tidiness,noise_sensitivity=excluded.noise_sensitivity,
    preferred_temperature=excluded.preferred_temperature,light_sensitivity=excluded.light_sensitivity,
    ventilation_preference=excluded.ventilation_preference,alarm_sensitivity=excluded.alarm_sensitivity,room_activity=excluded.room_activity,
    roommate_preference=excluded.roommate_preference,accessibility_needs=excluded.accessibility_needs,updated_at=excluded.updated_at,
    shower_duration_minutes=coalesce(excluded.shower_duration_minutes,s.shower_duration_minutes),
    night_noise_activity=coalesce(excluded.night_noise_activity,s.night_noise_activity),
    night_light_usage=coalesce(excluded.night_light_usage,s.night_light_usage),alarm_repeats=coalesce(excluded.alarm_repeats,s.alarm_repeats)
  returning s.id,s.updated_at,(s.xmax<>0),exists(select 1 from public.dormitory_settings settings where settings.id=true
    and substring(submitted_id,2,1)::integer between 1 and settings.class_count
    and substring(submitted_id,3,2)::integer between 1 and settings.students_per_class);
end;
$$;

create or replace function public.get_dormitory_dashboard_by_key(p_admin_key text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode='28000'; end if;
  return jsonb_build_object(
    'surveys',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object(
      'shower_duration_minutes',raw.shower_duration_minutes,'night_noise_activity',raw.night_noise_activity,
      'night_light_usage',raw.night_light_usage,'alarm_repeats',raw.alarm_repeats) order by s.created_at desc,s.id desc),'[]'::jsonb)
      from public.get_student_surveys_for_admin()s join public.student_surveys raw on raw.id=s.id),
    'deleted_surveys',(select coalesce(jsonb_agg(to_jsonb(s) order by s.deleted_at desc,s.id desc),'[]'::jsonb) from public.get_deleted_student_surveys_by_key(p_admin_key)s),
    'school',(select to_jsonb(s) from public.dormitory_settings s where s.id=true),
    'management',(select jsonb_build_object('layout',m.layout,'include_defaults',m.include_defaults,'test_enabled',m.test_enabled,
      'manual_assignments',m.manual_assignments,'placement_revision',m.placement_revision) from public.dormitory_management m where m.id=true)
  );
end;
$$;

create or replace function public.fill_roomfit_test_habits()
returns trigger language plpgsql set search_path=public as $$
begin
  if NEW.is_test_data then
    NEW.shower_duration_minutes:=coalesce(NEW.shower_duration_minutes,5+(NEW.student_id::integer%6)*5);
    NEW.night_noise_activity:=coalesce(NEW.night_noise_activity,1+NEW.student_id::integer%5);
    NEW.night_light_usage:=coalesce(NEW.night_light_usage,1+(NEW.student_id::integer+2)%5);
    NEW.alarm_repeats:=coalesce(NEW.alarm_repeats,NEW.student_id::integer%6);
  end if;
  return NEW;
end;
$$;
drop trigger if exists roomfit_test_habits on public.student_surveys;
create trigger roomfit_test_habits before insert on public.student_surveys for each row execute function public.fill_roomfit_test_habits();
update public.student_surveys set shower_duration_minutes=5+(student_id::integer%6)*5,
  night_noise_activity=1+student_id::integer%5,night_light_usage=1+(student_id::integer+2)%5,alarm_repeats=student_id::integer%6
where is_test_data and shower_duration_minutes is null;

revoke all on function public.fill_roomfit_test_habits() from public,anon,authenticated;
revoke all on function public.submit_student_survey(jsonb) from public;
revoke all on function public.get_dormitory_dashboard_by_key(text) from public;
grant execute on function public.submit_student_survey(jsonb) to anon,authenticated;
grant execute on function public.get_dormitory_dashboard_by_key(text) to anon,authenticated;
commit;
