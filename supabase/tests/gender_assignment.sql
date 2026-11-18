-- All fixtures and changes are rolled back. No real student's gender is inferred or edited.
begin;
do $$
declare
 payload jsonb:='{"student_id":"2101","student_name":"__gender_A__","reported_gender":"male","wake_time":"07:30","sleep_time":"00:30","shower_time":"07:40","tidiness":3,"noise_sensitivity":3,"preferred_temperature":22,"light_sensitivity":3,"ventilation_preference":3,"alarm_sensitivity":3}';
 layout jsonb; bad jsonb; a uuid; b uuid; c uuid; d uuid; revision bigint; request_id uuid; rooms jsonb; answer jsonb; saved jsonb; counts jsonb;
begin
 if exists(select 1 from public.dormitory_management where final_assignment is not null) then raise exception 'A real final table exists; do not run this fixture.';end if;
 if exists(select 1 from public.student_surveys where student_name like '__gender_%') then raise exception 'fixture collision';end if;
 -- Isolate fixtures using reversible soft deletion inside this transaction only.
 update public.student_surveys set deleted_at=clock_timestamp() where not is_test_data and deleted_at is null;
 delete from public.student_surveys where is_test_data;
 update public.dormitory_management set test_enabled=false,include_defaults=false,manual_assignments='[]' where id=true;
 update public.dormitory_settings set class_count=1,students_per_class=4 where id=true;
 layout:='[{"id":"gender-fixture","name":"성별 검증동","diningSide":"none","provisional":true,"genderPolicy":"separate","floors":[{"id":"f2","floor":2,"leftGrade":2,"rightGrade":2,"leftRooms":2,"rightRooms":2,"leftCapacity":2,"rightCapacity":2,"leftGender":"male","rightGender":"female","leftStairs":true,"centerStairs":true,"rightStairs":true,"leftWasher":true,"rightWasher":true,"leftDryer":true,"rightDryer":true}]}]';
 perform public.save_dormitory_layout_by_key('12345',layout);
 if (select count(*) from public.roomfit_gender_rooms(layout) where gender='male')<>2 then raise exception 'room gender resolution failed';end if;
 bad:=jsonb_set(layout,'{0,genderPolicy}','"male"');
 begin perform public.save_dormitory_layout_by_key('12345',bad);raise exception 'conflicting layout accepted';exception when sqlstate '22023' then null;end;
 select survey_id into a from public.submit_student_survey(payload);
 select survey_id into b from public.submit_student_survey(payload||'{"student_id":"2102","student_name":"__gender_B__","reported_gender":"female"}');
 select survey_id into c from public.submit_student_survey(payload||'{"student_id":"2103","student_name":"__gender_C__","reported_gender":"unknown"}');
 select survey_id into d from public.submit_student_survey(payload||'{"student_id":"2104","student_name":"__gender_D__"}');
 if public.roomfit_verified_student_gender('2101')<>'unknown' then raise exception 'student report was trusted without verification';end if;
 select placement_revision into revision from public.dormitory_management where id=true;
 begin perform public.set_student_gender_by_key('wrong','2101','__gender_A__','male',revision);raise exception 'bad key accepted';exception when sqlstate '28000' then null;end;
 begin perform public.set_student_gender_by_key('12345','2101','__gender_A__','male',revision-1);raise exception 'stale gender edit accepted';exception when sqlstate '40001' then null;end;
 begin perform public.set_student_gender_by_key('12345','2101','wrong identity','male',revision);raise exception 'wrong name accepted';exception when sqlstate '22023' then null;end;
 perform public.set_student_gender_by_key('12345','2101','__gender_A__','male',revision);
 perform public.set_student_gender_by_key('12345','2102','__gender_B__','female',(select placement_revision from public.dormitory_management where id=true));
 perform public.set_student_gender_by_key('12345','2104','__gender_D__','male',(select placement_revision from public.dormitory_management where id=true));
 if public.roomfit_verified_student_gender('2101')<>'male' then raise exception 'verified roster not used';end if;
 if (select reported_gender from public.student_surveys where id=c)<>'unknown' then raise exception 'unknown was inferred';end if;
 select placement_revision into revision from public.dormitory_management where id=true;
 begin perform public.set_dormitory_manual_assignments_by_key('12345','[{"studentId":"2103","roomId":"gender-fixture/f2/right/0","bedIndex":0}]',revision);raise exception 'unknown manual accepted';exception when sqlstate '22023' then null;end;
 begin perform public.set_dormitory_manual_assignments_by_key('12345','[{"studentId":"2101","roomId":"gender-fixture/f2/right/0","bedIndex":0}]',revision);raise exception 'wrong gender manual accepted';exception when sqlstate '22023' then null;end;
 begin perform public.set_dormitory_manual_assignments_by_key('12345','[{"studentId":"2101","roomId":"gender-fixture/f2/right/0","bedIndex":0},{"studentId":"2102","roomId":"gender-fixture/f2/left/0","bedIndex":0}]',revision);raise exception 'cross gender swap accepted';exception when sqlstate '22023' then null;end;
 perform public.set_dormitory_manual_assignments_by_key('12345','[{"studentId":"2101","roomId":"gender-fixture/f2/left/0","bedIndex":1}]',revision);
 -- Upsert keeps identity and profile; only a conflicting report requires re-verification.
 perform public.submit_student_survey(payload||'{"sleep_time":"01:00"}');
 if public.roomfit_verified_student_gender('2101')<>'male' or (select count(*) from public.student_surveys where student_id='2101' and student_name='__gender_A__')<>1 then raise exception 'ordinary upsert broke verification/dedup';end if;
 perform public.submit_student_survey(payload||'{"reported_gender":"female"}');
 if public.roomfit_verified_student_gender('2101')<>'unknown' then raise exception 'new conflicting report ignored';end if;
 perform public.set_student_gender_by_key('12345','2101','__gender_A__','male',(select placement_revision from public.dormitory_management where id=true));
 if public.roomfit_verified_student_gender('2101')<>'male' then raise exception 'reverification did not acknowledge report';end if;
 -- A same-ID/different-name response must not borrow an existing profile.
 perform public.submit_student_survey(payload||'{"student_name":"__gender_other_name__"}');
 if public.roomfit_verified_student_gender('2101')<>'unknown' then raise exception 'ambiguous ID trusted';end if;
 begin perform public.set_student_gender_by_key('12345','2101','__gender_A__','male',(select placement_revision from public.dormitory_management where id=true));raise exception 'ambiguous profile edit accepted';exception when sqlstate '22023' then null;end;
 update public.student_surveys set deleted_at=clock_timestamp() where student_name='__gender_other_name__';
 -- Same grade/gender separation approval still works; opposite gender needs no exclusion.
 if public.separation_pair_issue(a,'2102','__gender_B__') not like '%다른 성별%' then raise exception 'redundant cross-gender separation not detected';end if;
 perform public.submit_student_survey(payload||'{"reported_gender":"female","avoidance_requests":[{"student_id":"2104","student_name":"__gender_D__","reason":"fictional test only"}]}');
 select id into request_id from public.room_separation_requests where survey_id=a and target_student_id='2104';
 perform public.review_room_separation('12345',request_id,true);
 begin perform public.set_dormitory_manual_assignments_by_key('12345','[{"studentId":"2101","roomId":"gender-fixture/f2/left/0","bedIndex":0},{"studentId":"2104","roomId":"gender-fixture/f2/left/0","bedIndex":1}]',(select placement_revision from public.dormitory_management where id=true));raise exception 'approved separation ignored';exception when sqlstate '22023' then null;end;
 -- Explicit fake gender counts exclude real respondents, without changing their reported/verified gender.
 perform public.seed_gender_test_students_by_key('12345','[{"grade":1,"male":2,"female":1},{"grade":2,"male":0,"female":0},{"grade":3,"male":1,"female":2}]',(select placement_revision from public.dormitory_management where id=true));
 if exists(select 1 from public.student_surveys where is_test_data and grade=2 and deleted_at is null) then raise exception 'virtual students replaced actual respondents';end if;
 if (select count(*) from public.student_surveys where is_test_data and reported_gender='unknown')<>2 then raise exception 'unknown virtual count wrong';end if;
 if public.roomfit_verified_student_gender('2103',null,false,true)<>'unknown' then raise exception 'virtual mode inferred actual gender';end if;
 if public.roomfit_verified_student_gender('1101',null,false,true)<>'male' then raise exception 'virtual gender not usable in test mode';end if;
 delete from public.student_surveys where is_test_data;
 update public.dormitory_management set test_enabled=false,manual_assignments='[]' where id=true;
 -- Unsurveyed students can be verified by official name, but require include_defaults to be eligible.
 perform public.set_student_gender_by_key('12345','1101','__gender_roster_only__','female',(select placement_revision from public.dormitory_management where id=true));
 if public.roomfit_verified_student_gender('1101')<>'unknown' or public.roomfit_verified_student_gender('1101','__gender_roster_only__',true)<>'female' then raise exception 'default roster handling wrong';end if;
 -- Build a server-shaped snapshot: two male and two female rooms, no same-room exclusions.
 select coalesce(jsonb_agg(jsonb_build_object('id',r.room_id,'number','201','grade',r.grade,'capacity',r.capacity,'gender',g.gender,
   'beds',jsonb_build_array(x.answer,null),'students',case when x.answer is null then '[]'::jsonb else jsonb_build_array(x.answer) end,'score',null) order by r.room_id),'[]'::jsonb) into rooms
 from public.roomfit_assignable_rooms()r join public.roomfit_gender_rooms(layout)g on g.room_id=r.room_id
 left join lateral(select to_jsonb(s)||jsonb_build_object('is_test',false,'is_default',false,'gender',g.gender,'gender_verified',true) as answer from public.student_surveys s
   where s.id=case r.room_id when 'gender-fixture/f2/left/0' then a when 'gender-fixture/f2/left/1' then d when 'gender-fixture/f2/right/0' then b when 'gender-fixture/f2/right/1' then c end)x on true;
 begin perform public.confirm_dormitory_assignment_by_key('12345',(select placement_revision from public.dormitory_management where id=true),layout,rooms);raise exception 'unknown final accepted';exception when sqlstate '22023' then null;end;
 perform public.set_student_gender_by_key('12345','2103','__gender_C__','female',(select placement_revision from public.dormitory_management where id=true));
 select placement_revision into revision from public.dormitory_management where id=true;
 -- A forged snapshot gender cannot override the roster.
 bad:=jsonb_set(jsonb_set(rooms,'{0,beds,0,gender}','"female"'),'{0,students,0,gender}','"female"');
 begin perform public.confirm_dormitory_assignment_by_key('12345',revision,layout,bad);raise exception 'tampered snapshot accepted';exception when sqlstate '22023' then null;end;
 saved:=public.confirm_dormitory_assignment_by_key('12345',revision,layout,rooms);
 if saved->>'gender_policy_version'<>'1' then raise exception 'snapshot missing gender validation version';end if;
 begin perform public.set_student_gender_by_key('12345','2101','__gender_A__','female',(select placement_revision from public.dormitory_management where id=true));raise exception 'locked profile edit accepted';exception when sqlstate '55000' then null;end;
 begin perform public.save_dormitory_layout_by_key('12345',jsonb_set(layout,'{0,provisional}','false'));raise exception 'locked layout edit accepted';exception when sqlstate '55000' then null;end;
 perform public.submit_student_survey(payload||'{"reported_gender":"female","sleep_time":"03:00"}');
 perform public.submit_student_survey(payload||'{"student_id":"1102","student_name":"__gender_new_after_final__","reported_gender":"unknown"}');
 if (select final_assignment from public.dormitory_management where id=true) is distinct from saved then raise exception 'survey changed final snapshot';end if;
 perform public.unlock_dormitory_assignment_by_key('12345',(select placement_revision from public.dormitory_management where id=true));
 if (select final_assignment from public.dormitory_management where id=true) is not null then raise exception 'unlock failed';end if;
 -- Explicit room overrides in the grid use the same inheritance as legacy wings.
 bad:='[{"id":"grid-gender","name":"성별 격자","diningSide":"none","genderPolicy":"separate","floors":[{"id":"f","floor":2,"grid":{"rows":1,"cols":2,"spaces":[{"id":"m","kind":"room","number":"201","grade":2,"capacity":2,"row":0,"col":0,"rowSpan":1,"colSpan":1,"genderPolicy":"male"},{"id":"f","kind":"room","number":"202","grade":2,"capacity":2,"row":0,"col":1,"rowSpan":1,"colSpan":1,"genderPolicy":"female"}]}}]}]';
 perform public.save_dormitory_layout_by_key('12345',bad);
 if (select count(distinct gender) from public.roomfit_gender_rooms(bad))<>2 then raise exception 'grid room gender override lost';end if;
 begin perform public.save_dormitory_layout_by_key('12345',jsonb_set(bad,'{0,floors,0,genderPolicy}','"male"'));raise exception 'grid child conflicts with floor accepted';exception when sqlstate '22023' then null;end;
 if has_table_privilege('anon','public.student_gender_profiles','SELECT') or has_function_privilege('anon','public.roomfit_verified_student_gender(text,text,boolean,boolean)','EXECUTE') then raise exception 'private gender data exposed';end if;
 if jsonb_typeof(public.get_dormitory_dashboard_by_key('12345')->'gender_profiles')<>'array' then raise exception 'private dashboard missing profiles';end if;
end;$$;
rollback;
select 'PASS: gender reports/verification, identity/upsert, inherited space rules, manual moves/swaps, separation, virtual counts, final snapshot lock/unlock and privacy; all fixtures rolled back' as result;
