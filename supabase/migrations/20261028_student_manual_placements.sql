begin;

alter table public.dormitory_management add column if not exists manual_assignments jsonb not null default '[]'::jsonb;
alter table public.dormitory_management add column if not exists placement_revision bigint not null default 0;

create or replace function public.roomfit_assignable_rooms()
returns table(room_id text,grade integer,capacity integer)
language plpgsql stable security definer set search_path=public as $$
declare
  saved jsonb := (select m.layout from public.dormitory_management m where m.id=true);
  settings jsonb := (select to_jsonb(s) from public.dormitory_settings s where s.id=true);
  b jsonb; f jsonb; s jsonb; wing text; room_index integer; rooms_per_grade integer; beds integer;
begin
  if saved is not null then
    for b in select value from jsonb_array_elements(saved) loop
      for f in select value from jsonb_array_elements(b->'floors') loop
        if f ? 'grid' then
          for s in select value from jsonb_array_elements(f->'grid'->'spaces') where value->>'kind'='room' loop
            room_id:=format('%s/%s/%s',b->>'id',f->>'id',s->>'id');
            grade:=(s->>'grade')::integer;capacity:=(s->>'capacity')::integer;return next;
          end loop;
        else
          foreach wing in array array['left','right'] loop
            for room_index in 0..(f->>(wing||'Rooms'))::integer-1 loop
              room_id:=format('%s/%s/%s/%s',b->>'id',f->>'id',wing,room_index);
              grade:=(f->>(wing||'Grade'))::integer;capacity:=(f->>(wing||'Capacity'))::integer;return next;
            end loop;
          end loop;
        end if;
      end loop;
    end loop;
  else
    beds:=(settings->>'room_capacity')::integer;
    rooms_per_grade:=((settings->>'class_count')::integer*(settings->>'students_per_class')::integer+beds-1)/beds;
    return query select format('%s/floor-%s/%s/%s',z.building,z.floor_no,z.wing,n.i),z.g,beds
    from (values
      ('a',4,'left',2,1,3),('a',4,'right',2,2,3),
      ('a',3,'left',3,2,3),('a',3,'right',2,0,3),
      ('a',2,'left',3,0,3),('a',2,'right',3,1,3),
      ('b',4,'left',1,4,6),('b',4,'right',1,5,6),
      ('b',3,'left',1,2,6),('b',3,'right',1,3,6),
      ('b',2,'left',1,0,6),('b',2,'right',1,1,6)
    ) z(building,floor_no,wing,g,zone,zones)
    cross join lateral generate_series(0,rooms_per_grade/z.zones+case when z.zone<rooms_per_grade%z.zones then 1 else 0 end-1)n(i);
  end if;
end;
$$;

create or replace function public.advance_roomfit_placement_revision()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_TABLE_NAME='dormitory_management' then
    if NEW.layout is distinct from OLD.layout or NEW.include_defaults is distinct from OLD.include_defaults
      or NEW.test_enabled is distinct from OLD.test_enabled or NEW.manual_assignments is distinct from OLD.manual_assignments then
      NEW.placement_revision:=OLD.placement_revision+1;
    end if;
    return NEW;
  end if;
  update public.dormitory_management m set placement_revision=m.placement_revision+1 where m.id=true;
  return null;
end;
$$;
drop trigger if exists roomfit_management_revision on public.dormitory_management;
create trigger roomfit_management_revision before update on public.dormitory_management
for each row execute function public.advance_roomfit_placement_revision();
drop trigger if exists roomfit_surveys_revision on public.student_surveys;
create trigger roomfit_surveys_revision after insert or update or delete on public.student_surveys
for each statement execute function public.advance_roomfit_placement_revision();
drop trigger if exists roomfit_settings_revision on public.dormitory_settings;
create trigger roomfit_settings_revision after update on public.dormitory_settings
for each statement execute function public.advance_roomfit_placement_revision();

create or replace function public.get_dormitory_dashboard_by_key(p_admin_key text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode='28000'; end if;
  return jsonb_build_object(
    'surveys',(select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id desc),'[]'::jsonb) from public.get_student_surveys_for_admin()s),
    'deleted_surveys',(select coalesce(jsonb_agg(to_jsonb(s) order by s.deleted_at desc,s.id desc),'[]'::jsonb) from public.get_deleted_student_surveys_by_key(p_admin_key)s),
    'school',(select to_jsonb(s) from public.dormitory_settings s where s.id=true),
    'management',(select jsonb_build_object('layout',m.layout,'include_defaults',m.include_defaults,'test_enabled',m.test_enabled,
      'manual_assignments',m.manual_assignments,'placement_revision',m.placement_revision) from public.dormitory_management m where m.id=true)
  );
end;
$$;

create or replace function public.set_dormitory_manual_assignments_by_key(p_admin_key text,p_assignments jsonb,p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path=public,extensions as $$
declare
  revision bigint; p jsonb; rooms jsonb; room jsonb; school jsonb;
  students text[]:='{}'; occupied text[]:='{}'; student text; slot text;
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode='28000'; end if;
  perform 1 from public.dormitory_management m where m.id=true for update;
  revision:=(select m.placement_revision from public.dormitory_management m where m.id=true);
  if revision is null or p_expected_revision is null or p_expected_revision<>revision then
    raise exception '새 설문이나 다른 관리자의 변경이 반영되었습니다. 갱신된 지도에서 다시 옮겨 주세요.' using errcode='40001';
  end if;
  school:=(select to_jsonb(s) from public.dormitory_settings s where s.id=true);
  if p_assignments is null or jsonb_typeof(p_assignments)<>'array' then raise exception '수동 배치 정보를 확인해 주세요.' using errcode='22023'; end if;
  if jsonb_array_length(p_assignments)>3*(school->>'class_count')::integer*(school->>'students_per_class')::integer then raise exception '학교 명단보다 수동 배치가 많습니다.' using errcode='22023'; end if;
  rooms:=(select coalesce(jsonb_object_agg(r.room_id,jsonb_build_object('grade',r.grade,'capacity',r.capacity)),'{}'::jsonb) from public.roomfit_assignable_rooms()r);
  for p in select value from jsonb_array_elements(p_assignments) loop
    student:=p->>'studentId';room:=rooms->(p->>'roomId');
    if coalesce(jsonb_typeof(p->'studentId'),'')<>'string' or coalesce(student,'') !~ '^[1-3][1-9][0-9]{2}$' or substring(student,2,1)::integer>(school->>'class_count')::integer
      or substring(student,3,2)::integer not between 1 and (school->>'students_per_class')::integer then raise exception '학교 명단에 없는 학생입니다.' using errcode='22023'; end if;
    if room is null or coalesce(jsonb_typeof(p->'roomId'),'')<>'string' or coalesce(jsonb_typeof(p->'bedIndex'),'')<>'number' or coalesce(p->>'bedIndex','') !~ '^[0-5]$' then raise exception '현재 지도에 없는 자리입니다.' using errcode='22023'; end if;
    if (p->>'bedIndex')::integer>=(room->>'capacity')::integer then raise exception '호실 정원을 벗어난 자리입니다.' using errcode='22023'; end if;
    if left(student,1)::integer<>(room->>'grade')::integer then raise exception '다른 학년의 호실로는 옮길 수 없습니다.' using errcode='22023'; end if;
    slot:=jsonb_build_array(p->>'roomId',(p->>'bedIndex')::integer)::text;
    if student=any(students) or slot=any(occupied) then raise exception '학생 또는 침대가 중복 배치되었습니다.' using errcode='22023'; end if;
    students:=array_append(students,student);occupied:=array_append(occupied,slot);
  end loop;
  update public.dormitory_management set manual_assignments=p_assignments,updated_at=clock_timestamp() where id=true;
  return (select m.placement_revision from public.dormitory_management m where m.id=true);
end;
$$;

revoke all on function public.roomfit_assignable_rooms() from public,anon,authenticated;
revoke all on function public.advance_roomfit_placement_revision() from public,anon,authenticated;
revoke all on function public.get_dormitory_dashboard_by_key(text) from public;
revoke all on function public.set_dormitory_manual_assignments_by_key(text,jsonb,bigint) from public;
grant execute on function public.get_dormitory_dashboard_by_key(text) to anon,authenticated;
grant execute on function public.set_dormitory_manual_assignments_by_key(text,jsonb,bigint) to anon,authenticated;

commit;
