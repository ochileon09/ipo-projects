begin;
do $$
declare
  p jsonb:='{"student_id":"1930","student_name":"__final_A__","wake_time":"07:30","sleep_time":"00:30","shower_time":"07:40","tidiness":3,"noise_sensitivity":3,"preferred_temperature":22,"light_sensitivity":3,"ventilation_preference":3,"alarm_sensitivity":3}';
  a uuid; b uuid; revision bigint; saved jsonb; rooms jsonb; layout jsonb; answer jsonb;
begin
  if exists(select 1 from public.student_surveys where student_name in ('__final_A__','__final_B__')) then raise exception 'fixture collision';end if;
  if exists(select 1 from public.dormitory_management where final_assignment is not null) then raise exception 'An actual final table already exists; do not run this fixture.';end if;
  update public.dormitory_management set include_defaults=false,test_enabled=false,manual_assignments='[]' where id=true;
  update public.student_surveys set deleted_at=clock_timestamp() where not is_test_data and deleted_at is null;
  delete from public.student_surveys where is_test_data;
  update public.dormitory_settings set class_count=9,students_per_class=30 where id=true;
  layout:='[{"id":"fixture","name":"검증동","diningSide":"none","provisional":true,"floors":[{"id":"f1","floor":1,"leftGrade":1,"rightGrade":2,"leftRooms":1,"rightRooms":1,"leftCapacity":2,"rightCapacity":2,"leftStairs":true,"centerStairs":true,"rightStairs":true,"leftWasher":false,"rightWasher":false,"leftDryer":false,"rightDryer":false}]}]'::jsonb;
  layout:=jsonb_set(layout,'{0,genderPolicy}','"male"');
  perform public.save_dormitory_layout_by_key('12345',layout);
  select survey_id into a from public.submit_student_survey(p);
  perform public.set_student_gender_by_key('12345','1930','__final_A__','male',(select placement_revision from public.dormitory_management where id=true));
  answer:=(select s from jsonb_array_elements(public.get_dormitory_dashboard_by_key('12345')->'surveys')s where s->>'id'=a::text)||'{"is_default":false,"gender":"male","gender_verified":true}';
  select jsonb_agg(jsonb_build_object('id',r.room_id,'number',case when r.grade=1 then '101' else '102' end,'grade',r.grade,'capacity',r.capacity,'gender','male',
    'beds',case when r.grade=1 then jsonb_build_array(answer,null) else '[null,null]'::jsonb end,
    'students',case when r.grade=1 then jsonb_build_array(answer) else '[]'::jsonb end,'score',null) order by r.room_id) into rooms from public.roomfit_assignable_rooms()r;
  select placement_revision into revision from public.dormitory_management where id=true;
  begin perform public.confirm_dormitory_assignment_by_key('wrong',revision,layout,rooms);raise exception 'invalid key accepted';exception when sqlstate '28000' then null;end;
  begin perform public.confirm_dormitory_assignment_by_key('12345',revision-1,layout,rooms);raise exception 'stale confirm accepted';exception when sqlstate '40001' then null;end;
  begin perform public.confirm_dormitory_assignment_by_key('12345',revision,layout,'[]');raise exception 'missing rooms accepted';exception when sqlstate '22023' then null;end;
  saved:=public.confirm_dormitory_assignment_by_key('12345',revision,layout,rooms);
  if public.get_dormitory_dashboard_by_key('12345')->'management'->'final_assignment' is distinct from saved then raise exception 'saved snapshot not readable';end if;
  begin perform public.set_dormitory_manual_assignments_by_key('12345','[{"studentId":"1930","roomId":"fixture/f1/left/0","bedIndex":1}]',(select placement_revision from public.dormitory_management where id=true));raise exception 'locked manual edit accepted';exception when sqlstate '55000' then null;end;
  begin perform public.save_dormitory_layout_by_key('12345',null);raise exception 'locked layout edit accepted';exception when sqlstate '55000' then null;end;
  begin update public.dormitory_settings set room_capacity=3 where id=true;raise exception 'locked settings edit accepted';exception when sqlstate '55000' then null;end;
  begin perform public.assert_roomfit_assignment_open();raise exception 'locked review guard accepted';exception when sqlstate '55000' then null;end;
  -- New and edited survey submissions are accepted, including separation requests.
  perform public.submit_student_survey(p||'{"sleep_time":"04:00","avoidance_requests":[{"student_id":"1929","student_name":"__final_B__","reason":"fixture only"}]}');
  select survey_id into b from public.submit_student_survey(p||'{"student_id":"1929","student_name":"__final_B__"}');
  if (select final_assignment from public.dormitory_management where id=true) is distinct from saved then raise exception 'new survey changed final table';end if;
  if not exists(select 1 from public.student_surveys where id=b) then raise exception 'new survey missing';end if;
  begin perform public.unlock_dormitory_assignment_by_key('wrong',(select placement_revision from public.dormitory_management where id=true));raise exception 'invalid unlock key accepted';exception when sqlstate '28000' then null;end;
  begin perform public.unlock_dormitory_assignment_by_key('12345',revision);raise exception 'stale unlock accepted';exception when sqlstate '40001' then null;end;
  perform public.unlock_dormitory_assignment_by_key('12345',(select placement_revision from public.dormitory_management where id=true));
  if (select final_assignment from public.dormitory_management where id=true) is not null then raise exception 'unlock failed';end if;
  perform public.assert_roomfit_assignment_open();
  if has_table_privilege('anon','public.dormitory_management','SELECT') or has_function_privilege('anon','public.assert_roomfit_assignment_open()','EXECUTE') then raise exception 'private snapshot exposed';end if;
end;$$;
rollback;
select 'PASS: final save/readback, new and edited surveys frozen, lock guards, stale/invalid calls, unlock and privacy; fixtures rolled back' as result;
