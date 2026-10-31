begin;
do $$
declare p jsonb:='{"student_id":"1930","student_name":"__환경검증__","wake_time":"07:30","sleep_time":"00:30","shower_time":"07:40","tidiness":3,"noise_sensitivity":3,"preferred_temperature":22,"light_sensitivity":3,"ventilation_preference":3,"alarm_sensitivity":3,"environment_answers":{"version":1,"humidity":0,"summer_ac":2,"winter_heater":1},"avoidance_requests":[{"student_id":"1929","student_name":"검증상대","reason":"생활 중 반복 충돌"}]}'; r uuid; sid uuid;
begin
 if exists(select 1 from public.student_surveys where student_name='__환경검증__') then raise exception '검증 이름 충돌';end if;
 select survey_id into sid from public.submit_student_survey(p);
 select id into r from public.room_separation_requests where survey_id=sid;
 if r is null then raise exception '요청 저장 실패';end if;
 if (select environment_answers->>'summer_ac' from public.student_surveys where id=sid)<>'2' then raise exception '환경 저장 실패';end if;
 begin perform public.review_room_separation('wrong',r,true);raise exception '인증 우회';exception when sqlstate '28000' then null;end;
 perform public.review_room_separation('12345',r,true);
 if (select status from public.room_separation_requests where id=r)<>'approved' then raise exception '승인 실패';end if;
 perform public.submit_student_survey(p);
 if (select status from public.room_separation_requests where id=r)<>'approved' then raise exception '같은 사유 승인 유지 실패';end if;
 perform public.submit_student_survey(jsonb_set(p,'{avoidance_requests,0,reason}','"수정된 사유"'));
 if (select status from public.room_separation_requests where id=r)<>'pending' then raise exception '사유 변경 재검토 실패';end if;
 perform public.review_room_separation('12345',r,false);
 if (select status from public.room_separation_requests where id=r)<>'rejected' then raise exception '기각 실패';end if;
 if not exists(select 1 from jsonb_array_elements(public.get_dormitory_dashboard_by_key('12345')->'avoidance_requests')x where x->>'id'=r::text) then raise exception '관리자 조회 실패';end if;
 perform public.submit_student_survey(p||'{"avoidance_requests":[]}'::jsonb);
 if (select status from public.room_separation_requests where id=r)<>'withdrawn' then raise exception '철회 실패';end if;
 begin perform public.submit_student_survey(jsonb_set(p,'{environment_answers,humidity}','5'));raise exception '잘못된 습도 수락';exception when sqlstate '22023' then null;end;
 if has_table_privilege('anon','public.room_separation_requests','SELECT') or has_function_privilege('anon','public.submit_student_survey_core(jsonb)','EXECUTE') then raise exception '비공개 정보 접근 허용';end if;
end;$$;
rollback;
select 'PASS: environment and separation submission, review, reset, withdrawal, privacy; all fixtures rolled back' as result;
