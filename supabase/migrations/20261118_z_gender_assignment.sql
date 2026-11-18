begin;

alter table public.student_surveys add column if not exists reported_gender text not null default 'unknown' check(reported_gender in ('male','female','unknown'));
create table if not exists public.student_gender_profiles (
  student_id text primary key check(student_id ~ '^[1-3][1-9](0[1-9]|[12][0-9]|30)$'),
  student_name text not null check(length(btrim(student_name)) between 1 and 30),
  gender text not null default 'unknown' check(gender in ('male','female','unknown')),
  verified boolean not null default false,
  checked_reported_gender text not null default 'unknown' check(checked_reported_gender in ('male','female','unknown')),
  verified_at timestamptz, verified_via text not null default 'school_admin_key',
  check(not verified or gender in ('male','female'))
);
alter table public.student_gender_profiles enable row level security;
revoke all on public.student_gender_profiles from anon,authenticated;

create or replace function public.roomfit_verified_student_gender(p_student_id text,p_student_name text default null,p_default boolean default false,p_allow_test boolean default false)
returns text language plpgsql stable security definer set search_path=public as $$
declare profile public.student_gender_profiles%rowtype; response public.student_surveys%rowtype; n integer;
begin
 select count(*) into n from public.student_surveys where student_id=p_student_id and not is_test_data and deleted_at is null and superseded_at is null;
 if n>1 then return 'unknown';end if;
 if n=1 then
   select * into response from public.student_surveys where student_id=p_student_id and not is_test_data and deleted_at is null and superseded_at is null;
   if p_default or (p_student_name is not null and p_student_name<>response.student_name) then return 'unknown';end if;
 else
   if p_allow_test then
     select * into response from public.student_surveys where student_id=p_student_id and is_test_data and deleted_at is null and superseded_at is null and (p_student_name is null or student_name=p_student_name) limit 1;
     if found then return response.reported_gender;end if;
   end if;
   if not p_default then return 'unknown';end if;
 end if;
 select * into profile from public.student_gender_profiles where student_id=p_student_id and verified and gender in ('male','female');
 if not found or (p_student_name is not null and profile.student_name<>p_student_name) then return 'unknown';end if;
 if n=1 and (profile.student_name<>response.student_name or (response.reported_gender<>'unknown' and response.reported_gender<>profile.gender and response.reported_gender<>profile.checked_reported_gender)) then return 'unknown';end if;
 return profile.gender;
end;$$;
revoke all on function public.roomfit_verified_student_gender(text,text,boolean,boolean) from public,anon,authenticated;

create or replace function public.set_student_gender_by_key(p_admin_key text,p_student_id text,p_student_name text,p_gender text,p_expected_revision bigint)
returns void language plpgsql security definer set search_path=public as $$
declare settings public.dormitory_settings%rowtype; n integer; name text:=btrim(p_student_name); reported text;
begin
 if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키 오류' using errcode='28000';end if;
 perform public.assert_roomfit_assignment_open();
 if (select placement_revision from public.dormitory_management where id=true) is distinct from p_expected_revision then raise exception '새 응답이나 변경이 있습니다. 새로고침 후 확인해 주세요.' using errcode='40001';end if;
 select * into settings from public.dormitory_settings where id=true;
 if coalesce(p_student_id,'') !~ '^[1-3][1-9](0[1-9]|[12][0-9]|30)$' or coalesce(length(name),0) not between 1 and 30 or coalesce(p_gender,'') not in ('male','female','unknown') then raise exception '학번·이름·성별을 확인해 주세요.' using errcode='22023';end if;
 if substring(p_student_id,2,1)::integer>settings.class_count or substring(p_student_id,3,2)::integer>settings.students_per_class then raise exception '학교 명단에 없는 학번입니다.' using errcode='22023';end if;
 select count(*) into n from public.student_surveys where student_id=p_student_id and not is_test_data and deleted_at is null and superseded_at is null;
 if n>1 then raise exception '같은 학번의 서로 다른 이름을 먼저 확인해 주세요.' using errcode='22023';end if;
 if n=1 and not exists(select 1 from public.student_surveys where student_id=p_student_id and student_name=name and not is_test_data and deleted_at is null and superseded_at is null) then raise exception '실제 응답의 학번과 이름이 일치하지 않습니다.' using errcode='22023';end if;
 select reported_gender into reported from public.student_surveys where student_id=p_student_id and not is_test_data and deleted_at is null and superseded_at is null;
 insert into public.student_gender_profiles as g(student_id,student_name,gender,verified,checked_reported_gender,verified_at)
 values(p_student_id,name,p_gender,p_gender<>'unknown',coalesce(reported,'unknown'),clock_timestamp())
 on conflict(student_id) do update set student_name=excluded.student_name,gender=excluded.gender,verified=excluded.verified,checked_reported_gender=excluded.checked_reported_gender,verified_at=excluded.verified_at;
end;$$;
revoke all on function public.set_student_gender_by_key(text,text,text,text,bigint) from public;
grant execute on function public.set_student_gender_by_key(text,text,text,text,bigint) to anon,authenticated;

create or replace function public.guard_roomfit_gender_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.assert_roomfit_assignment_open();
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end;$$;
revoke all on function public.guard_roomfit_gender_profile() from public,anon,authenticated;
drop trigger if exists roomfit_gender_profile_guard on public.student_gender_profiles;
create trigger roomfit_gender_profile_guard before insert or update or delete on public.student_gender_profiles for each row execute function public.guard_roomfit_gender_profile();
drop trigger if exists roomfit_gender_profile_revision on public.student_gender_profiles;
create trigger roomfit_gender_profile_revision after insert or update or delete on public.student_gender_profiles for each statement execute function public.advance_roomfit_placement_revision();
drop trigger if exists roomfit_gender_profile_refresh on public.student_gender_profiles;
create trigger roomfit_gender_profile_refresh after insert or update or delete on public.student_gender_profiles for each statement execute function public.notify_roomfit_refresh();

create or replace function public.roomfit_resolve_gender_policy(p_parent text,p_child text)
returns text language plpgsql immutable set search_path=public as $$
declare c text:=coalesce(p_child,'inherit');
begin
 if p_parent not in ('male','female','unknown','separate') or c not in ('male','female','unknown','separate','inherit') then return 'conflict';end if;
 if c='inherit' then return p_parent;end if;
 if p_parent='unknown' or c='unknown' then return 'unknown';end if;
 if p_parent='separate' or p_parent=c then return c;end if;
 return 'conflict';
end;$$;
revoke all on function public.roomfit_resolve_gender_policy(text,text) from public,anon,authenticated;

create or replace function public.roomfit_gender_rooms(p_layout jsonb)
returns table(room_id text,gender text) language plpgsql stable security definer set search_path=public as $$
declare b jsonb;f jsonb;s jsonb;wing text;i integer;bp text;fp text;rp text;
begin
 if p_layout is null then return query select r.room_id,'unknown'::text from public.roomfit_assignable_rooms()r;return;end if;
 for b in select value from jsonb_array_elements(p_layout) loop
  bp:=coalesce(b->>'genderPolicy','unknown');
  if bp not in ('male','female','unknown','separate') then raise exception '건물의 배정 성별 설정 오류' using errcode='22023';end if;
  for f in select value from jsonb_array_elements(b->'floors') loop
   fp:=public.roomfit_resolve_gender_policy(bp,f->>'genderPolicy');
   if fp='conflict' then raise exception '건물과 층의 성별 설정이 충돌합니다.' using errcode='22023';end if;
   if f ? 'grid' then
    for s in select value from jsonb_array_elements(f->'grid'->'spaces') where value->>'kind'='room' loop
     rp:=public.roomfit_resolve_gender_policy(fp,s->>'genderPolicy');
     if rp='conflict' then raise exception '호실 성별이 상위 구역과 충돌합니다.' using errcode='22023';end if;
     room_id:=format('%s/%s/%s',b->>'id',f->>'id',s->>'id');gender:=case when rp in ('male','female') then rp else 'unknown' end;return next;
    end loop;
   else
    foreach wing in array array['left','right'] loop
     rp:=public.roomfit_resolve_gender_policy(fp,f->>(wing||'Gender'));
     if rp='conflict' then raise exception '구역 성별이 상위 설정과 충돌합니다.' using errcode='22023';end if;
     for i in 0..(f->>(wing||'Rooms'))::integer-1 loop
      room_id:=format('%s/%s/%s/%s',b->>'id',f->>'id',wing,i);gender:=case when rp in ('male','female') then rp else 'unknown' end;return next;
     end loop;
    end loop;
   end if;
  end loop;
 end loop;
end;$$;
revoke all on function public.roomfit_gender_rooms(jsonb) from public,anon,authenticated;

create or replace function public.guard_roomfit_gender_layout()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if NEW.layout is distinct from OLD.layout and NEW.layout is not null then perform * from public.roomfit_gender_rooms(NEW.layout);end if;
 return NEW;
end;$$;
revoke all on function public.guard_roomfit_gender_layout() from public,anon,authenticated;
drop trigger if exists a0_roomfit_gender_layout on public.dormitory_management;
create trigger a0_roomfit_gender_layout before update on public.dormitory_management for each row execute function public.guard_roomfit_gender_layout();

-- Keep the old survey validation/upsert behavior and add an unverified report only.
do $$begin
 if to_regprocedure('public.submit_student_survey_before_gender(jsonb)') is null then alter function public.submit_student_survey(jsonb) rename to submit_student_survey_before_gender;end if;
end;$$;
revoke all on function public.submit_student_survey_before_gender(jsonb) from public,anon,authenticated;
create or replace function public.submit_student_survey(p_survey jsonb)
returns table(survey_id uuid,submitted_at timestamptz,was_updated boolean,matches_school_roster boolean)
language plpgsql security definer set search_path=public as $$
declare receipt record;
begin
 if p_survey ? 'reported_gender' and coalesce(p_survey->>'reported_gender','') not in ('male','female','unknown') then raise exception '성별 입력을 확인해 주세요.' using errcode='22023';end if;
 select * into receipt from public.submit_student_survey_before_gender(p_survey);
 if p_survey ? 'reported_gender' then update public.student_surveys set reported_gender=p_survey->>'reported_gender' where id=receipt.survey_id;end if;
 return query select receipt.survey_id,receipt.submitted_at,receipt.was_updated,receipt.matches_school_roster;
end;$$;
revoke all on function public.submit_student_survey(jsonb) from public;
grant execute on function public.submit_student_survey(jsonb) to anon,authenticated;

create or replace function public.seed_gender_test_students_by_key(p_admin_key text,p_plan jsonb,p_expected_revision bigint)
returns integer language plpgsql security definer set search_path=public as $$
declare plan jsonb;n integer;g integer;male_n integer;female_n integer;total integer;
begin
 if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키 오류' using errcode='28000';end if;
 perform public.assert_roomfit_assignment_open();
 if (select placement_revision from public.dormitory_management where id=true) is distinct from p_expected_revision then raise exception '실제 응답이 바뀌었습니다. 새로고침 후 테스트 인원을 확인하세요.' using errcode='40001';end if;
 if p_plan is null or jsonb_typeof(p_plan)<>'array' or jsonb_array_length(p_plan)<>3 or (select count(distinct value->>'grade') from jsonb_array_elements(p_plan))<>3 then raise exception '학년별 가상 인원을 확인하세요.' using errcode='22023';end if;
 total:=public.seed_test_student_surveys_by_key(p_admin_key);
 for plan in select value from jsonb_array_elements(p_plan) loop
  if coalesce(plan->>'grade','') !~ '^[1-3]$' or coalesce(plan->>'male','') !~ '^[0-9]{1,3}$' or coalesce(plan->>'female','') !~ '^[0-9]{1,3}$' then raise exception '가상 인원은 올바른 정수여야 합니다.' using errcode='22023';end if;
  g:=(plan->>'grade')::integer;male_n:=(plan->>'male')::integer;female_n:=(plan->>'female')::integer;
  select count(*) into n from public.student_surveys where is_test_data and grade=g and deleted_at is null and superseded_at is null;
  if male_n+female_n>n then raise exception '가상 인원이 실제 응답을 제외한 명단보다 많습니다.' using errcode='22023';end if;
  with ordered as(select id,row_number() over(order by student_id) as ordinal from public.student_surveys where is_test_data and grade=g and deleted_at is null and superseded_at is null)
  update public.student_surveys s set reported_gender=case when o.ordinal<=male_n then 'male' when o.ordinal<=male_n+female_n then 'female' else 'unknown' end from ordered o where s.id=o.id;
 end loop;
 return total;
end;$$;
revoke all on function public.seed_gender_test_students_by_key(text,jsonb,bigint) from public;
grant execute on function public.seed_gender_test_students_by_key(text,jsonb,bigint) to anon,authenticated;

-- Updated placement, snapshot and dashboard definitions are appended below.
create or replace function public.set_dormitory_manual_assignments_by_key(p_admin_key text,p_assignments jsonb,p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path=public,extensions as $$
declare
  revision bigint; p jsonb; rooms jsonb; room jsonb; school jsonb;
  students text[]:='{}'; occupied text[]:='{}'; student text; slot text; gender text; state public.dormitory_management%rowtype;
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode='28000'; end if;
  perform public.assert_roomfit_assignment_open();
  select * into state from public.dormitory_management where id=true;
  revision:=(select m.placement_revision from public.dormitory_management m where m.id=true);
  if revision is null or p_expected_revision is null or p_expected_revision<>revision then
    raise exception '새 설문이나 다른 관리자의 변경이 반영되었습니다. 갱신된 지도에서 다시 옮겨 주세요.' using errcode='40001';
  end if;
  school:=(select to_jsonb(s) from public.dormitory_settings s where s.id=true);
  if p_assignments is null or jsonb_typeof(p_assignments)<>'array' then raise exception '수동 배치 정보를 확인해 주세요.' using errcode='22023'; end if;
  if jsonb_array_length(p_assignments)>3*(school->>'class_count')::integer*(school->>'students_per_class')::integer then raise exception '학교 명단보다 수동 배치가 많습니다.' using errcode='22023'; end if;
  rooms:=(select coalesce(jsonb_object_agg(r.room_id,jsonb_build_object('grade',r.grade,'capacity',r.capacity,'gender',g.gender)),'{}'::jsonb) from public.roomfit_assignable_rooms()r join public.roomfit_gender_rooms(state.layout)g on g.room_id=r.room_id);
  for p in select value from jsonb_array_elements(p_assignments) loop
    student:=p->>'studentId';room:=rooms->(p->>'roomId');
    if coalesce(jsonb_typeof(p->'studentId'),'')<>'string' or coalesce(student,'') !~ '^[1-3][1-9][0-9]{2}$' or substring(student,2,1)::integer>(school->>'class_count')::integer
      or substring(student,3,2)::integer not between 1 and (school->>'students_per_class')::integer then raise exception '학교 명단에 없는 학생입니다.' using errcode='22023'; end if;
    if room is null or coalesce(jsonb_typeof(p->'roomId'),'')<>'string' or coalesce(jsonb_typeof(p->'bedIndex'),'')<>'number' or coalesce(p->>'bedIndex','') !~ '^[0-5]$' then raise exception '현재 지도에 없는 자리입니다.' using errcode='22023'; end if;
    if (p->>'bedIndex')::integer>=(room->>'capacity')::integer then raise exception '호실 정원을 벗어난 자리입니다.' using errcode='22023'; end if;
    if left(student,1)::integer<>(room->>'grade')::integer then raise exception '다른 학년의 호실로는 옮길 수 없습니다.' using errcode='22023'; end if;
    gender:=public.roomfit_verified_student_gender(student,null,state.include_defaults and not exists(select 1 from public.student_surveys s where s.student_id=student and not s.is_test_data and s.deleted_at is null and s.superseded_at is null),state.test_enabled);
    if gender='unknown' or gender is distinct from room->>'gender' then raise exception '성별 확인이 완료된 학생만 같은 성별의 호실로 옮길 수 있습니다.' using errcode='22023';end if;
    slot:=jsonb_build_array(p->>'roomId',(p->>'bedIndex')::integer)::text;
    if student=any(students) or slot=any(occupied) then raise exception '학생 또는 침대가 중복 배치되었습니다.' using errcode='22023'; end if;
    students:=array_append(students,student);occupied:=array_append(occupied,slot);
  end loop;
  if exists(select 1 from public.room_separation_decisions d join public.student_surveys s on s.id=d.survey_id,
    jsonb_array_elements(p_assignments)a,jsonb_array_elements(p_assignments)b
    where d.active and d.status='approved' and s.deleted_at is null and s.superseded_at is null
      and a->>'studentId'=s.student_id and b->>'studentId'=d.target_student_id and a->>'roomId'=b->>'roomId'
      and exists(select 1 from public.student_surveys t where t.student_id=d.target_student_id and t.student_name=d.target_student_name and not t.is_test_data and t.deleted_at is null and t.superseded_at is null)) then
    raise exception '승인된 분리 조건과 충돌합니다.' using errcode='22023';end if;
  update public.dormitory_management set manual_assignments=p_assignments,updated_at=clock_timestamp() where id=true;
  return (select m.placement_revision from public.dormitory_management m where m.id=true);
end;
$$;

create or replace function public.confirm_dormitory_assignment_by_key(p_admin_key text,p_expected_revision bigint,p_layout jsonb,p_rooms jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  m public.dormitory_management%rowtype; settings public.dormitory_settings%rowtype;
  physical jsonb; room jsonb; bed jsonb; spec jsonb; ids text[]:='{}'; room_ids text[]:='{}';
  student text; saved jsonb; members jsonb; assigned integer:=0; authoritative_gender text; candidate record;
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
  -- All active candidates must be verified before confirmation, including unsurveyed defaults when enabled.
  for candidate in select distinct s.student_id from public.student_surveys s where not s.is_test_data and s.deleted_at is null and s.superseded_at is null
    and substring(s.student_id,2,1)::integer<=settings.class_count and substring(s.student_id,3,2)::integer between 1 and settings.students_per_class loop
    if public.roomfit_verified_student_gender(candidate.student_id)='unknown' then raise exception '성별 미확인 학생이 있습니다. 관리자 확인 후 확정하세요.' using errcode='22023';end if;
  end loop;
  if m.include_defaults then
    for candidate in select format('%s%s%s',g,c,lpad(n::text,2,'0')) as student_id from generate_series(1,3)g,generate_series(1,settings.class_count)c,generate_series(1,settings.students_per_class)n loop
      if public.roomfit_verified_student_gender(candidate.student_id,null,not exists(select 1 from public.student_surveys s where s.student_id=candidate.student_id and not s.is_test_data and s.deleted_at is null and s.superseded_at is null))='unknown' then raise exception '미응답 학생의 성별 확인도 완료한 뒤 확정하세요.' using errcode='22023';end if;
    end loop;
  end if;
  select coalesce(jsonb_object_agg(r.room_id,jsonb_build_object('grade',r.grade,'capacity',r.capacity,'gender',g.gender)),'{}'::jsonb) into physical
    from public.roomfit_assignable_rooms()r join public.roomfit_gender_rooms(m.layout)g on g.room_id=r.room_id;
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
      authoritative_gender:=public.roomfit_verified_student_gender(student,bed->>'student_name',coalesce((bed->>'is_default')::boolean,false));
      if authoritative_gender='unknown' or authoritative_gender is distinct from spec->>'gender'
        or authoritative_gender is distinct from bed->>'gender' or coalesce((bed->>'gender_verified')::boolean,false)<>true
        or authoritative_gender is distinct from room->>'gender' then raise exception '학생·호실의 확인된 성별이 일치하지 않습니다.' using errcode='22023';end if;
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
  saved:=jsonb_build_object('gender_policy_version',1,'id',gen_random_uuid(),'confirmed_at',clock_timestamp(),'source_revision',m.placement_revision,
    'school',jsonb_build_object('classCount',settings.class_count,'studentsPerClass',settings.students_per_class,'roomCapacity',settings.room_capacity),
    'layout',p_layout,'rooms',p_rooms);
  update public.dormitory_management set final_assignment=saved,updated_at=clock_timestamp() where id=true;
  return saved;
end;$$;

create or replace function public.get_dormitory_dashboard_by_key(p_admin_key text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode='28000'; end if;
  return jsonb_build_object(
    'surveys',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object(
      'reported_gender',raw.reported_gender,'shower_duration_minutes',raw.shower_duration_minutes,'night_noise_activity',raw.night_noise_activity,
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
    'gender_profiles',(select coalesce(jsonb_agg(to_jsonb(g) order by g.student_id),'[]'::jsonb) from public.student_gender_profiles g),
    'school',(select to_jsonb(s) from public.dormitory_settings s where s.id=true),
    'management',(select jsonb_build_object('layout',m.layout,'include_defaults',m.include_defaults,'test_enabled',m.test_enabled,
      'manual_assignments',m.manual_assignments,'placement_revision',m.placement_revision,'final_assignment',m.final_assignment) from public.dormitory_management m where m.id=true)
  );
end;
$$;

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
 if public.roomfit_verified_student_gender(source.student_id,source.student_name)='unknown' or public.roomfit_verified_student_gender(target.student_id,target.student_name)='unknown' then return '성별 확인이 완료된 뒤 승인할 수 있습니다.';end if;
 if public.roomfit_verified_student_gender(source.student_id,source.student_name)<>public.roomfit_verified_student_gender(target.student_id,target.student_name) then return '서로 다른 성별은 이미 분리 배정됩니다.';end if;
 return null;
end;$$;
revoke all on function public.separation_pair_issue(uuid,text,text) from public,anon,authenticated;

commit;
