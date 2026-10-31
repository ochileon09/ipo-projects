begin;
do $$
declare
  payload jsonb:='{"student_id":"1930","student_name":"__간소설문검증__","wake_time":"07:30","sleep_time":"00:30","shower_time":"07:40","tidiness":3,"noise_sensitivity":4,"preferred_temperature":22,"light_sensitivity":4,"ventilation_preference":3,"alarm_sensitivity":4,"shower_duration_minutes":20,"night_noise_activity":2,"night_light_usage":4,"alarm_repeats":0,"flexible_preferences":["ventilation","tidiness","tidiness","temperature"]}';
  first_id uuid; receipt record; snapshot jsonb; bad jsonb; before_count integer;
begin
  if exists(select 1 from public.student_surveys where student_name='__간소설문검증__') then raise exception '검증용 이름이 이미 존재합니다.'; end if;
  select count(*) into before_count from public.student_surveys;
  select * into receipt from public.submit_student_survey(payload); first_id:=receipt.survey_id;
  if (select flexible_preferences<>array['temperature','tidiness','ventilation'] or shower_frequency<>1 or room_activity<>3 from public.student_surveys where id=first_id) then raise exception '새 문항 저장 또는 생략 항목 기본값 오류'; end if;
  perform public.submit_student_survey(payload||'{"shower_frequency":2,"room_activity":5,"roommate_preference":"이전 요청","accessibility_needs":"이전 배려"}'::jsonb);
  select * into receipt from public.submit_student_survey(payload);
  if receipt.survey_id<>first_id or not receipt.was_updated then raise exception '응답 갱신 시 같은 행을 재사용하지 않았습니다.'; end if;
  if (select shower_frequency<>2 or room_activity<>5 or roommate_preference<>'이전 요청' or accessibility_needs<>'이전 배려' from public.student_surveys where id=first_id) then raise exception '생략한 이전 문항을 지웠습니다.'; end if;
  perform public.submit_student_survey(payload-'flexible_preferences');
  if (select cardinality(flexible_preferences)<>3 from public.student_surveys where id=first_id) then raise exception '이전 앱의 제출이 상관없음 응답을 지웠습니다.'; end if;
  snapshot:=public.get_dormitory_dashboard_by_key('12345');
  if not exists(select 1 from jsonb_array_elements(snapshot->'surveys')s where s->>'id'=first_id::text and s->'flexible_preferences'='["temperature","tidiness","ventilation"]'::jsonb) then raise exception '관리자 조회에 상관없음 응답이 빠졌습니다.'; end if;
  perform public.submit_student_survey(payload||'{"flexible_preferences":[]}'::jsonb);
  if (select flexible_preferences<>'{}'::text[] from public.student_surveys where id=first_id) then raise exception '상관없음 선택을 취소할 수 없습니다.'; end if;
  for bad in select value from jsonb_array_elements('[{"flexible_preferences":null},{"flexible_preferences":"tidiness"},{"flexible_preferences":["noise"]},{"flexible_preferences":[null]},{"flexible_preferences":[1]}]'::jsonb) loop
    begin perform public.submit_student_survey(payload||bad); raise exception '잘못된 선호 값이 저장되었습니다.'; exception when sqlstate '22023' then null; end;
  end loop;
  if (select count(*) from public.student_surveys)<>before_count+1 then raise exception '중복 기록이 생성되었습니다.'; end if;
  if has_column_privilege('anon','public.student_surveys','flexible_preferences','SELECT') then raise exception '익명 조회가 허용되었습니다.'; end if;
end;
$$;
rollback;
select 'PASS: refined survey, preference flags, identity upsert, legacy preservation, validation and admin readback; all test changes rolled back' as result;
