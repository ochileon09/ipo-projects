begin;

alter table public.dormitory_management add column if not exists final_assignment jsonb;

create or replace function public.assert_roomfit_assignment_open()
returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.dormitory_management where id=true for update;
  if exists(select 1 from public.dormitory_management where id=true and final_assignment is not null) then
    raise exception '최종 확정을 해제한 뒤 배정·구조·조건을 변경해 주세요.' using errcode='55000';
  end if;
end;$$;
revoke all on function public.assert_roomfit_assignment_open() from public,anon,authenticated;

create or replace function public.guard_roomfit_final_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_TABLE_NAME='dormitory_management' then
    if OLD.final_assignment is not null and (NEW.layout is distinct from OLD.layout
      or NEW.manual_assignments is distinct from OLD.manual_assignments
      or NEW.include_defaults is distinct from OLD.include_defaults
      or NEW.test_enabled is distinct from OLD.test_enabled
      or (NEW.final_assignment is not null and NEW.final_assignment is distinct from OLD.final_assignment)) then
      raise exception '최종 확정을 해제한 뒤 배정을 변경해 주세요.' using errcode='55000';
    end if;
    if NEW.final_assignment is distinct from OLD.final_assignment then NEW.placement_revision:=OLD.placement_revision+1;end if;
  else
    perform public.assert_roomfit_assignment_open();
  end if;
  return NEW;
end;$$;
revoke all on function public.guard_roomfit_final_assignment() from public,anon,authenticated;
drop trigger if exists a_roomfit_final_guard on public.dormitory_management;
create trigger a_roomfit_final_guard before update on public.dormitory_management for each row execute function public.guard_roomfit_final_assignment();
drop trigger if exists a_roomfit_settings_final_guard on public.dormitory_settings;
create trigger a_roomfit_settings_final_guard before update on public.dormitory_settings for each row execute function public.guard_roomfit_final_assignment();

-- A decision change also invalidates a proposal that another administrator is about to confirm.
drop trigger if exists roomfit_decisions_revision on public.room_separation_decisions;
create trigger roomfit_decisions_revision after insert or update or delete on public.room_separation_decisions for each statement execute function public.advance_roomfit_placement_revision();

create or replace function public.confirm_dormitory_assignment_by_key(p_admin_key text,p_expected_revision bigint,p_layout jsonb,p_rooms jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  m public.dormitory_management%rowtype; settings public.dormitory_settings%rowtype;
  physical jsonb; room jsonb; bed jsonb; spec jsonb; ids text[]:='{}'; room_ids text[]:='{}';
  student text; saved jsonb; members jsonb; assigned integer:=0;
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키 오류' using errcode='28000';end if;
  select * into m from public.dormitory_management where id=true for update;
  if m.placement_revision is distinct from p_expected_revision then raise exception '새 설문이나 다른 관리자의 변경이 있습니다. 최신 배정표를 확인해 주세요.' using errcode='40001';end if;
  if m.final_assignment is not null then raise exception '이미 확정된 배정표입니다.' using errcode='55000';end if;
  if m.test_enabled or exists(select 1 from public.student_surveys where is_test_data and deleted_at is null and superseded_at is null) then
    raise exception '테스트를 종료하고 가상 학생을 제거한 뒤 확정해 주세요.' using errcode='22023';end if;
  if p_layout is null or jsonb_typeof(p_layout)<>'array' or p_rooms is null or jsonb_typeof(p_rooms)<>'array' then raise exception '배정표 형식 오류' using errcode='22023';end if;
  if m.layout is not null and m.layout<>p_layout then raise exception '저장된 건물 구조와 다릅니다.' using errcode='40001';end if;
  select * into settings from public.dormitory_settings where id=true;
  select coalesce(jsonb_object_agg(r.room_id,jsonb_build_object('grade',r.grade,'capacity',r.capacity)),'{}'::jsonb) into physical from public.roomfit_assignable_rooms()r;
  if jsonb_array_length(p_rooms)<>(select count(*) from jsonb_object_keys(physical)) then raise exception '호실이 누락된 배정표입니다.' using errcode='22023';end if;
  for room in select value from jsonb_array_elements(p_rooms) loop
    spec:=physical->(room->>'id');
    if spec is null or room->>'id'=any(room_ids) or (room->>'grade')::integer is distinct from (spec->>'grade')::integer
      or (room->>'capacity')::integer is distinct from (spec->>'capacity')::integer
      or jsonb_typeof(room->'beds') is distinct from 'array' then raise exception '호실·학년·정원 정보 오류' using errcode='22023';end if;
    room_ids:=array_append(room_ids,room->>'id');
    if jsonb_array_length(room->'beds')<>(spec->>'capacity')::integer then raise exception '침대 수 오류' using errcode='22023';end if;
    select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into members from jsonb_array_elements(room->'beds') with ordinality where value<>'null'::jsonb;
    if members is distinct from room->'students' then raise exception '입실 명단과 자리가 다릅니다.' using errcode='22023';end if;
    if (jsonb_array_length(members)<2 and room->>'score' is not null) or (jsonb_array_length(members)>=2 and (room->>'score' is null or (room->>'score')::numeric not between 0 and 10)) then raise exception '호실 점수 오류' using errcode='22023';end if;
    for bed in select value from jsonb_array_elements(members) loop
      student:=bed->>'student_id';
      if coalesce(student,'') !~ '^[1-3][1-9](0[1-9]|[12][0-9]|30)$' or student=any(ids)
        or substring(student,2,1)::integer>settings.class_count or substring(student,3,2)::integer>settings.students_per_class
        or left(student,1)::integer<>(spec->>'grade')::integer or (bed->>'grade')::integer is distinct from (spec->>'grade')::integer
        or coalesce((bed->>'is_test')::boolean,true) then raise exception '학생 중복·학년·명단 정보 오류' using errcode='22023';end if;
      if coalesce((bed->>'is_default')::boolean,false) then
        if not m.include_defaults or bed->>'id'<>'default-'||student then raise exception '미응답 학생 배정 오류' using errcode='22023';end if;
      elsif not exists(select 1 from public.student_surveys s where s.id::text=bed->>'id' and s.student_id=student and s.student_name=bed->>'student_name' and not s.is_test_data and s.deleted_at is null and s.superseded_at is null) then
        raise exception '실제 응답을 확인할 수 없습니다.' using errcode='40001';
      end if;
      ids:=array_append(ids,student);assigned:=assigned+1;
    end loop;
  end loop;
  if assigned=0 then raise exception '배정된 학생이 있어야 확정할 수 있습니다.' using errcode='22023';end if;
  -- Check active approved exclusions again in the same locked transaction.
  if exists(select 1 from public.room_separation_decisions d join public.student_surveys s on s.id=d.survey_id,
    jsonb_array_elements(p_rooms)r where d.active and d.status='approved'
    and exists(select 1 from jsonb_array_elements(r->'students')a where a->>'id'=s.id::text)
    and exists(select 1 from jsonb_array_elements(r->'students')b where b->>'student_id'=d.target_student_id and b->>'student_name'=d.target_student_name)) then
    raise exception '승인된 분리 조건과 충돌합니다.' using errcode='22023';end if;
  saved:=jsonb_build_object('id',gen_random_uuid(),'confirmed_at',clock_timestamp(),'source_revision',m.placement_revision,
    'school',jsonb_build_object('classCount',settings.class_count,'studentsPerClass',settings.students_per_class,'roomCapacity',settings.room_capacity),
    'layout',p_layout,'rooms',p_rooms);
  update public.dormitory_management set final_assignment=saved,updated_at=clock_timestamp() where id=true;
  return saved;
end;$$;

create or replace function public.unlock_dormitory_assignment_by_key(p_admin_key text,p_expected_revision bigint)
returns void language plpgsql security definer set search_path=public as $$
declare m public.dormitory_management%rowtype;
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키 오류' using errcode='28000';end if;
  select * into m from public.dormitory_management where id=true for update;
  if m.placement_revision is distinct from p_expected_revision then raise exception '다른 변경이 있습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001';end if;
  update public.dormitory_management set final_assignment=null,updated_at=clock_timestamp() where id=true;
end;$$;
revoke all on function public.confirm_dormitory_assignment_by_key(text,bigint,jsonb,jsonb) from public;
revoke all on function public.unlock_dormitory_assignment_by_key(text,bigint) from public;
grant execute on function public.confirm_dormitory_assignment_by_key(text,bigint,jsonb,jsonb) to anon,authenticated;
grant execute on function public.unlock_dormitory_assignment_by_key(text,bigint) to anon,authenticated;

-- Dashboard and review definitions are appended below before COMMIT.


create or replace function public.review_room_separation(p_admin_key text,p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
declare r public.room_separation_requests%rowtype; issue text;
begin
 if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키 오류' using errcode='28000';end if;
 perform public.assert_roomfit_assignment_open();
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
 perform public.assert_roomfit_assignment_open();
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
      'manual_assignments',m.manual_assignments,'placement_revision',m.placement_revision,'final_assignment',m.final_assignment) from public.dormitory_management m where m.id=true)
  );
end;
$$;

commit;
