begin;
create or replace function public.separation_pair_issue(p_source uuid,p_target_id text,p_target_name text)
returns text language plpgsql stable security definer set search_path=public as $$
declare source public.student_surveys%rowtype; target public.student_surveys%rowtype; settings public.dormitory_settings%rowtype; n integer;
begin
 select * into source from public.student_surveys where id=p_source and not is_test_data and deleted_at is null and superseded_at is null;
 if not found then return '신청자의 실제 응답을 확인할 수 없습니다.';end if;
 select * into settings from public.dormitory_settings where id=true;
 if substring(source.student_id,2,1)::integer>settings.class_count or substring(source.student_id,3,2)::integer>settings.students_per_class or substring(p_target_id,2,1)::integer>settings.class_count or substring(p_target_id,3,2)::integer>settings.students_per_class then return '학교 명단의 반·번호 범위를 확인하세요.';end if;
 select count(*) into n from public.student_surveys where student_id=source.student_id and not is_test_data and deleted_at is null and superseded_at is null;
 if n<>1 then return '신청자 학번에 다른 이름의 응답이 있습니다.';end if;
 select count(*) into n from public.student_surveys where student_id=p_target_id and not is_test_data and deleted_at is null and superseded_at is null;
 if n=0 then return '상대 학번의 실제 설문이 없습니다. 학번 또는 미응답 여부를 확인하세요.';end if;
 if n<>1 then return '상대 학번에 다른 이름의 응답이 있습니다.';end if;
 select * into target from public.student_surveys where student_id=p_target_id and not is_test_data and deleted_at is null and superseded_at is null;
 if target.student_name<>btrim(p_target_name) then return '상대 학번과 이름이 일치하지 않습니다.';end if;
 if source.student_id=target.student_id then return '본인에 대한 분리 요청입니다.';end if;
 if source.grade<>target.grade then return '서로 다른 학년은 이미 분리 배정됩니다.';end if;
 return null;
end;$$;
revoke all on function public.separation_pair_issue(uuid,text,text) from public,anon,authenticated;
create or replace function public.review_room_separation(p_admin_key text,p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
declare r public.room_separation_requests%rowtype; issue text;
begin
 if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키 오류' using errcode='28000';end if;
 select * into r from public.room_separation_requests where id=p_request_id and status='pending' for update;
 if not found then return;end if;
 if p_approve then
   issue:=public.separation_pair_issue(r.survey_id,r.target_student_id,r.target_student_name);
   if issue is not null then raise exception '%',issue using errcode='22023';end if;
 end if;
 insert into public.room_separation_decisions as d(survey_id,target_student_id,target_student_name,request_id,status,reason_fingerprint)
 values(r.survey_id,r.target_student_id,r.target_student_name,r.id,case when p_approve then 'approved' else 'rejected' end,md5(btrim(r.reason)))
 on conflict(survey_id,target_student_id,target_student_name) do update set request_id=excluded.request_id,status=excluded.status,reason_fingerprint=excluded.reason_fingerprint,reviewed_at=clock_timestamp(),active=true;
 delete from public.room_separation_requests where id=p_request_id;
end;$$;
create or replace function public.set_room_separation_condition_by_key(p_admin_key text,p_condition_id uuid,p_active boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare d public.room_separation_decisions%rowtype; issue text;
begin
 if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키 오류' using errcode='28000';end if;
 select * into d from public.room_separation_decisions where request_id=p_condition_id and status='approved' for update;
 if not found then return false;end if;
 if p_active then
   if exists(select 1 from public.room_separation_requests r where r.survey_id=d.survey_id and r.target_student_id=d.target_student_id and r.target_student_name=d.target_student_name and r.status='pending') then raise exception '새 사유의 검토 대기 요청이 있습니다. 해당 요청에서 승인해 주세요.' using errcode='22023';end if;
   issue:=public.separation_pair_issue(d.survey_id,d.target_student_id,d.target_student_name);
   if issue is not null then raise exception '%',issue using errcode='22023';end if;
 end if;
 update public.room_separation_decisions set active=p_active where survey_id=d.survey_id and target_student_id=d.target_student_id and target_student_name=d.target_student_name;
 return true;
end;$$;
revoke all on function public.set_room_separation_condition_by_key(text,uuid,boolean) from public;
grant execute on function public.set_room_separation_condition_by_key(text,uuid,boolean) to anon,authenticated;
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
    'separation_conditions',(select coalesce(jsonb_agg(jsonb_build_object('id',d.request_id,'survey_id',d.survey_id,'requester_id',s.student_id,'requester_name',s.student_name,'target_student_id',d.target_student_id,'target_student_name',d.target_student_name,'reason','','status',d.status,'active',d.active,'reviewed_at',d.reviewed_at) order by d.reviewed_at desc),'[]'::jsonb) from public.room_separation_decisions d join public.student_surveys s on s.id=d.survey_id where d.status='approved'),
    'deleted_surveys',(select coalesce(jsonb_agg(to_jsonb(s) order by s.deleted_at desc,s.id desc),'[]'::jsonb) from public.get_deleted_student_surveys_by_key(p_admin_key)s),
    'school',(select to_jsonb(s) from public.dormitory_settings s where s.id=true),
    'management',(select jsonb_build_object('layout',m.layout,'include_defaults',m.include_defaults,'test_enabled',m.test_enabled,
      'manual_assignments',m.manual_assignments,'placement_revision',m.placement_revision) from public.dormitory_management m where m.id=true)
  );
end;
$$;



commit;
