begin;
alter table public.student_surveys add column if not exists auto_filled_fields text[] not null default '{}';
create table if not exists public.room_separation_decisions (
 survey_id uuid not null references public.student_surveys(id), target_student_id text not null, target_student_name text not null,
 request_id uuid not null, status text not null check(status in ('approved','rejected')), reason_fingerprint text not null,
 reviewed_at timestamptz not null default now(), active boolean not null default true,
 primary key(survey_id,target_student_id,target_student_name)
);
alter table public.room_separation_decisions enable row level security;
revoke all on public.room_separation_decisions from public,anon,authenticated;
create or replace function public.fill_missing_survey_preferences()
returns trigger language plpgsql set search_path=public as $$
declare f text;
begin
 if not NEW.is_test_data then
  foreach f in array array['humidity','summer_ac','winter_heater'] loop
   if NEW.environment_answers->>f is null then
    NEW.environment_answers:=jsonb_set(NEW.environment_answers,array[f],'0'::jsonb,true);
    if not f=any(NEW.auto_filled_fields) then NEW.auto_filled_fields:=array_append(NEW.auto_filled_fields,f);end if;
   end if;
  end loop;
  if NEW.shower_duration_minutes is null then
   NEW.shower_duration_minutes:=15;
   if not 'shower_duration_minutes'=any(NEW.auto_filled_fields) then NEW.auto_filled_fields:=array_append(NEW.auto_filled_fields,'shower_duration_minutes');end if;
  end if;
 end if;
 return NEW;
end;$$;
drop trigger if exists fill_missing_survey_preferences on public.student_surveys;
create trigger fill_missing_survey_preferences before insert or update on public.student_surveys for each row execute function public.fill_missing_survey_preferences();
revoke all on function public.fill_missing_survey_preferences() from public,anon,authenticated;
-- Defaults are marked explicitly and do not change original submission timestamps or supplied answers.
update public.student_surveys set environment_answers=environment_answers where not is_test_data and superseded_at is null and deleted_at is null;
create or replace function public.compact_reviewed_room_requests_by_key(p_admin_key text)
returns integer language plpgsql security definer set search_path=public as $$
declare removed integer;
begin
 if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키 오류' using errcode='28000';end if;
 insert into public.room_separation_decisions as d(survey_id,target_student_id,target_student_name,request_id,status,reason_fingerprint,reviewed_at)
 select survey_id,target_student_id,target_student_name,id,status,md5(btrim(reason)),coalesce(reviewed_at,now()) from public.room_separation_requests where status in ('approved','rejected')
 on conflict(survey_id,target_student_id,target_student_name) do update set request_id=excluded.request_id,status=excluded.status,reason_fingerprint=excluded.reason_fingerprint,reviewed_at=excluded.reviewed_at,active=true;
 delete from public.room_separation_requests where status in ('approved','rejected');
 get diagnostics removed=row_count;
 return removed;
end;$$;
create or replace function public.review_room_separation(p_admin_key text,p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
declare r public.room_separation_requests%rowtype;
begin
 if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키 오류' using errcode='28000';end if;
 select * into r from public.room_separation_requests where id=p_request_id and status='pending' for update;
 if not found then return;end if;
 insert into public.room_separation_decisions as d(survey_id,target_student_id,target_student_name,request_id,status,reason_fingerprint)
 values(r.survey_id,r.target_student_id,r.target_student_name,r.id,case when p_approve then 'approved' else 'rejected' end,md5(btrim(r.reason)))
 on conflict(survey_id,target_student_id,target_student_name) do update set request_id=excluded.request_id,status=excluded.status,reason_fingerprint=excluded.reason_fingerprint,reviewed_at=clock_timestamp(),active=true;
 delete from public.room_separation_requests where id=p_request_id;
end;$$;
create or replace function public.submit_student_survey_core(p_survey jsonb)
returns table(survey_id uuid, submitted_at timestamptz, was_updated boolean, matches_school_roster boolean)
language plpgsql security definer set search_path=public as $$
declare
  submitted_id text:=btrim(p_survey->>'student_id');
  submitted_name text:=btrim(p_survey->>'student_name');
  field text; minimum integer; maximum integer; flexible text[]:='{}';
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
  if p_survey ? 'flexible_preferences' then
    if jsonb_typeof(p_survey->'flexible_preferences') is distinct from 'array' then
      raise exception '상관없는 항목은 목록으로 입력해 주세요.' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements_text(p_survey->'flexible_preferences') v where v is null or v not in ('tidiness','ventilation','temperature')) then
      raise exception '지원하지 않는 선호 항목입니다.' using errcode='22023';
    end if;
    select coalesce(array_agg(distinct v order by v),'{}'::text[]) into flexible from jsonb_array_elements_text(p_survey->'flexible_preferences') v;
  end if;
  return query insert into public.student_surveys as s (
    student_id,student_name,grade,wake_time,sleep_time,shower_time,shower_frequency,
    tidiness,noise_sensitivity,preferred_temperature,light_sensitivity,ventilation_preference,
    alarm_sensitivity,room_activity,roommate_preference,accessibility_needs,is_test_data,updated_at,
    shower_duration_minutes,night_noise_activity,night_light_usage,alarm_repeats,flexible_preferences
  ) values (
    submitted_id,submitted_name,left(submitted_id,1)::smallint,
    (p_survey->>'wake_time')::time,(p_survey->>'sleep_time')::time,(p_survey->>'shower_time')::time,coalesce((p_survey->>'shower_frequency')::smallint,1),
    (p_survey->>'tidiness')::smallint,(p_survey->>'noise_sensitivity')::smallint,(p_survey->>'preferred_temperature')::smallint,
    (p_survey->>'light_sensitivity')::smallint,(p_survey->>'ventilation_preference')::smallint,(p_survey->>'alarm_sensitivity')::smallint,
    coalesce((p_survey->>'room_activity')::smallint,3),nullif(btrim(p_survey->>'roommate_preference'),''),nullif(btrim(p_survey->>'accessibility_needs'),''),false,clock_timestamp(),
    (p_survey->>'shower_duration_minutes')::smallint,(p_survey->>'night_noise_activity')::smallint,(p_survey->>'night_light_usage')::smallint,(p_survey->>'alarm_repeats')::smallint,flexible
  ) on conflict(student_id,student_name) where not is_test_data and superseded_at is null
  do update set grade=excluded.grade,wake_time=excluded.wake_time,sleep_time=excluded.sleep_time,shower_time=excluded.shower_time,
    shower_frequency=case when p_survey ? 'shower_frequency' then excluded.shower_frequency else s.shower_frequency end,
    tidiness=excluded.tidiness,noise_sensitivity=excluded.noise_sensitivity,
    preferred_temperature=excluded.preferred_temperature,light_sensitivity=excluded.light_sensitivity,
    ventilation_preference=excluded.ventilation_preference,alarm_sensitivity=excluded.alarm_sensitivity,
    room_activity=case when p_survey ? 'room_activity' then excluded.room_activity else s.room_activity end,
    roommate_preference=case when p_survey ? 'roommate_preference' then excluded.roommate_preference else s.roommate_preference end,
    accessibility_needs=case when p_survey ? 'accessibility_needs' then excluded.accessibility_needs else s.accessibility_needs end,
    updated_at=excluded.updated_at,deleted_at=null,
    shower_duration_minutes=case when p_survey->>'shower_duration_minutes' is not null then excluded.shower_duration_minutes else s.shower_duration_minutes end,
    night_noise_activity=coalesce(excluded.night_noise_activity,s.night_noise_activity),
    night_light_usage=coalesce(excluded.night_light_usage,s.night_light_usage),alarm_repeats=coalesce(excluded.alarm_repeats,s.alarm_repeats),
    flexible_preferences=case when p_survey ? 'flexible_preferences' then excluded.flexible_preferences else s.flexible_preferences end
  returning s.id,s.updated_at,(s.xmax<>0),exists(select 1 from public.dormitory_settings settings where settings.id=true
    and substring(submitted_id,2,1)::integer between 1 and settings.class_count
    and substring(submitted_id,3,2)::integer between 1 and settings.students_per_class);
end;
$$;


create or replace function public.submit_student_survey(p_survey jsonb)
returns table(survey_id uuid, submitted_at timestamptz, was_updated boolean, matches_school_roster boolean)
language plpgsql security definer set search_path=public as $$
#variable_conflict use_column
declare receipt record; env jsonb; requests jsonb; item jsonb; k text;
begin
 env:=p_survey->'environment_answers';
 if env is not null then
   if jsonb_typeof(env)<>'object' or coalesce(env->>'version','')<>'1' then raise exception '환경 응답 형식 오류' using errcode='22023'; end if;
   foreach k in array array['humidity','summer_ac','winter_heater'] loop
     if coalesce(env->>k,'') !~ '^[0-3]$' then raise exception '환경 선호를 선택해 주세요.' using errcode='22023'; end if;
   end loop;
 end if;
 if p_survey ? 'avoidance_requests' then
   requests:=p_survey->'avoidance_requests';
   if jsonb_typeof(requests) is distinct from 'array' then raise exception '분리 요청 목록 형식 오류' using errcode='22023'; end if;
   if jsonb_array_length(requests)>10 then raise exception '분리 요청은 최대 10명입니다.' using errcode='22023'; end if;
   for item in select value from jsonb_array_elements(requests) loop
     if coalesce(item->>'student_id','') !~ '^[1-3][1-9](0[1-9]|[12][0-9]|30)$' or coalesce(char_length(btrim(item->>'student_name')),0) not between 1 and 30 or coalesce(char_length(btrim(item->>'reason')),0) not between 1 and 500 or item->>'student_id'=btrim(p_survey->>'student_id') then raise exception '상대 학번·이름과 사유를 확인해 주세요. 본인은 지정할 수 없습니다.' using errcode='22023'; end if;
   end loop;
   if (select count(*) from (select distinct value->>'student_id',btrim(value->>'student_name') from jsonb_array_elements(requests))x)<>jsonb_array_length(requests) then raise exception '같은 학생의 요청은 하나만 작성해 주세요.' using errcode='22023'; end if;
 end if;
 select * into receipt from public.submit_student_survey_core(p_survey);
 update public.student_surveys set auto_filled_fields=array(select f from unnest(auto_filled_fields) f where not ((f='shower_duration_minutes' and p_survey->>'shower_duration_minutes' is not null) or (f in ('humidity','summer_ac','winter_heater') and env is not null))) where id=receipt.survey_id;
 if env is not null then update public.student_surveys set environment_answers=env where id=receipt.survey_id; end if;
 if requests is not null then
   update public.room_separation_requests r set status='withdrawn',updated_at=clock_timestamp() where r.survey_id=receipt.survey_id and not exists(select 1 from jsonb_array_elements(requests) i where i->>'student_id'=r.target_student_id and btrim(i->>'student_name')=r.target_student_name);
   update public.room_separation_decisions d set active=false where d.survey_id=receipt.survey_id and not exists(select 1 from jsonb_array_elements(requests) i where i->>'student_id'=d.target_student_id and btrim(i->>'student_name')=d.target_student_name);
   for item in select value from jsonb_array_elements(requests) loop
     if exists(select 1 from public.room_separation_decisions d where d.survey_id=receipt.survey_id and d.target_student_id=item->>'student_id' and d.target_student_name=btrim(item->>'student_name') and d.active and d.reason_fingerprint=md5(btrim(item->>'reason'))) then continue;end if;
     update public.room_separation_decisions d set active=false where d.survey_id=receipt.survey_id and d.target_student_id=item->>'student_id' and d.target_student_name=btrim(item->>'student_name');
     insert into public.room_separation_requests as r(survey_id,target_student_id,target_student_name,reason)
     values(receipt.survey_id,item->>'student_id',btrim(item->>'student_name'),btrim(item->>'reason'))
     on conflict(survey_id,target_student_id,target_student_name) do update set reason=excluded.reason,
       status=case when r.reason=excluded.reason and r.status<>'withdrawn' then r.status else 'pending' end,
       reviewed_at=case when r.reason=excluded.reason and r.status<>'withdrawn' then r.reviewed_at else null end,updated_at=clock_timestamp();
   end loop;
 end if;
 return query select receipt.survey_id,receipt.submitted_at,receipt.was_updated,receipt.matches_school_roster;
end; $$;
create or replace function public.get_dormitory_dashboard_by_key(p_admin_key text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode='28000'; end if;
  return jsonb_build_object(
    'surveys',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object(
      'shower_duration_minutes',raw.shower_duration_minutes,'night_noise_activity',raw.night_noise_activity,
      'night_light_usage',raw.night_light_usage,'alarm_repeats',raw.alarm_repeats,
      'flexible_preferences',raw.flexible_preferences,'environment_answers',raw.environment_answers,'auto_filled_fields',raw.auto_filled_fields) order by s.created_at desc,s.id desc),'[]'::jsonb)
      from public.get_student_surveys_for_admin()s join public.student_surveys raw on raw.id=s.id),
    'avoidance_requests',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (
      select r.id,r.survey_id,s.student_id requester_id,s.student_name requester_name,r.target_student_id,r.target_student_name,r.reason,r.status
      from public.room_separation_requests r join public.student_surveys s on s.id=r.survey_id where r.status in ('pending','approved') and s.deleted_at is null and s.superseded_at is null
      union all
      select d.request_id,d.survey_id,s.student_id,s.student_name,d.target_student_id,d.target_student_name,''::text,d.status
      from public.room_separation_decisions d join public.student_surveys s on s.id=d.survey_id where d.active and d.status='approved' and s.deleted_at is null and s.superseded_at is null
    )x),
    'deleted_surveys',(select coalesce(jsonb_agg(to_jsonb(s) order by s.deleted_at desc,s.id desc),'[]'::jsonb) from public.get_deleted_student_surveys_by_key(p_admin_key)s),
    'school',(select to_jsonb(s) from public.dormitory_settings s where s.id=true),
    'management',(select jsonb_build_object('layout',m.layout,'include_defaults',m.include_defaults,'test_enabled',m.test_enabled,
      'manual_assignments',m.manual_assignments,'placement_revision',m.placement_revision) from public.dormitory_management m where m.id=true)
  );
end;
$$;


drop trigger if exists decision_refresh on public.room_separation_decisions;
create trigger decision_refresh after insert or update or delete on public.room_separation_decisions for each statement execute function public.notify_roomfit_refresh();
revoke all on function public.compact_reviewed_room_requests_by_key(text) from public;
grant execute on function public.compact_reviewed_room_requests_by_key(text) to anon,authenticated;
commit;
