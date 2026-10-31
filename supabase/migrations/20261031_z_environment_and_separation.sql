begin;
alter table public.student_surveys add column if not exists environment_answers jsonb not null default '{}';
create table if not exists public.room_separation_requests(
 id uuid primary key default gen_random_uuid(), survey_id uuid not null references public.student_surveys(id),
 target_student_id text not null, target_student_name text not null, reason text not null check(char_length(reason) between 1 and 500),
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 reviewed_at timestamptz, updated_at timestamptz not null default now(),
 unique(survey_id,target_student_id,target_student_name)
);
alter table public.room_separation_requests enable row level security;
revoke all on public.room_separation_requests from anon,authenticated;
do $$ begin
 if to_regprocedure('public.submit_student_survey_core(jsonb)') is null then alter function public.submit_student_survey(jsonb) rename to submit_student_survey_core; end if;
end; $$;
revoke all on function public.submit_student_survey_core(jsonb) from public,anon,authenticated;
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
 if env is not null then update public.student_surveys set environment_answers=env where id=receipt.survey_id; end if;
 if requests is not null then
   update public.room_separation_requests r set status='withdrawn',updated_at=clock_timestamp() where r.survey_id=receipt.survey_id and not exists(select 1 from jsonb_array_elements(requests) i where i->>'student_id'=r.target_student_id and btrim(i->>'student_name')=r.target_student_name);
   for item in select value from jsonb_array_elements(requests) loop
     insert into public.room_separation_requests as r(survey_id,target_student_id,target_student_name,reason)
     values(receipt.survey_id,item->>'student_id',btrim(item->>'student_name'),btrim(item->>'reason'))
     on conflict(survey_id,target_student_id,target_student_name) do update set reason=excluded.reason,
       status=case when r.reason=excluded.reason and r.status<>'withdrawn' then r.status else 'pending' end,
       reviewed_at=case when r.reason=excluded.reason and r.status<>'withdrawn' then r.reviewed_at else null end,updated_at=clock_timestamp();
   end loop;
 end if;
 return query select receipt.survey_id,receipt.submitted_at,receipt.was_updated,receipt.matches_school_roster;
end; $$;
create or replace function public.review_room_separation(p_admin_key text,p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키 오류' using errcode='28000'; end if;
 update public.room_separation_requests set status=case when p_approve then 'approved' else 'rejected' end, reviewed_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_request_id and status<>'withdrawn';
end; $$;
revoke all on function public.review_room_separation(text,uuid,boolean) from public;
grant execute on function public.review_room_separation(text,uuid,boolean) to anon,authenticated;
grant execute on function public.submit_student_survey(jsonb) to anon,authenticated;
create or replace function public.get_dormitory_dashboard_by_key(p_admin_key text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode='28000'; end if;
  return jsonb_build_object(
    'surveys',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object(
      'shower_duration_minutes',raw.shower_duration_minutes,'night_noise_activity',raw.night_noise_activity,
      'night_light_usage',raw.night_light_usage,'alarm_repeats',raw.alarm_repeats,
      'flexible_preferences',raw.flexible_preferences,'environment_answers',raw.environment_answers) order by s.created_at desc,s.id desc),'[]'::jsonb)
      from public.get_student_surveys_for_admin()s join public.student_surveys raw on raw.id=s.id),
    'avoidance_requests',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('requester_id',s.student_id,'requester_name',s.student_name)),'[]'::jsonb) from public.room_separation_requests r join public.student_surveys s on s.id=r.survey_id where s.deleted_at is null and s.superseded_at is null and r.status<>'withdrawn'),
    'deleted_surveys',(select coalesce(jsonb_agg(to_jsonb(s) order by s.deleted_at desc,s.id desc),'[]'::jsonb) from public.get_deleted_student_surveys_by_key(p_admin_key)s),
    'school',(select to_jsonb(s) from public.dormitory_settings s where s.id=true),
    'management',(select jsonb_build_object('layout',m.layout,'include_defaults',m.include_defaults,'test_enabled',m.test_enabled,
      'manual_assignments',m.manual_assignments,'placement_revision',m.placement_revision) from public.dormitory_management m where m.id=true)
  );
end;
$$;

drop trigger if exists separation_refresh on public.room_separation_requests;
create trigger separation_refresh after insert or update or delete on public.room_separation_requests for each statement execute function public.notify_roomfit_refresh();
commit;
