begin;
do $$
declare
  payload jsonb:='{"student_id":"1930","student_name":"__문항검증A__","wake_time":"07:30","sleep_time":"00:30","shower_time":"07:40","shower_frequency":1,"tidiness":3,"noise_sensitivity":4,"preferred_temperature":22,"light_sensitivity":4,"ventilation_preference":3,"alarm_sensitivity":5,"room_activity":3,"shower_duration_minutes":20,"night_noise_activity":2,"night_light_usage":4,"alarm_repeats":0}';
  receipt record; first_id uuid; snapshot jsonb; bad jsonb; entry record;
begin
  if exists(select 1 from public.student_surveys where student_name in ('__문항검증A__','__문항검증B__')) then raise exception '검증 이름이 이미 존재하여 중단합니다.'; end if;
  select * into receipt from public.submit_student_survey(payload);first_id:=receipt.survey_id;
  if receipt.was_updated then raise exception '첫 제출은 새 기록이어야 합니다.'; end if;
  select * into receipt from public.submit_student_survey(payload||'{"sleep_time":"01:30","shower_duration_minutes":30,"alarm_repeats":5}'::jsonb);
  if receipt.survey_id<>first_id or not receipt.was_updated then raise exception '같은 학번과 이름은 같은 행을 갱신해야 합니다.'; end if;
  if (select count(*) from public.student_surveys where student_id='1930' and student_name='__문항검증A__' and superseded_at is null and deleted_at is null)<>1 then raise exception '중복 응답이 생성되었습니다.'; end if;
  perform public.submit_student_survey(payload-'shower_duration_minutes'-'night_noise_activity'-'night_light_usage'-'alarm_repeats');
  if (select shower_duration_minutes<>30 or alarm_repeats<>5 from public.student_surveys where id=first_id) then raise exception '이전 버전 앱의 제출이 새 응답을 지웠습니다.'; end if;
  perform public.submit_student_survey(payload||'{"student_id":"1929"}'::jsonb);
  perform public.submit_student_survey(payload||'{"student_name":"__문항검증B__"}'::jsonb);
  if (select count(*) from public.student_surveys where student_name in ('__문항검증A__','__문항검증B__'))<>3 then raise exception '학번 또는 이름 하나만 같은 학생이 합쳐졌습니다.'; end if;
  snapshot:=public.get_dormitory_dashboard_by_key('12345');
  if not exists(select 1 from jsonb_array_elements(snapshot->'surveys')s where s->>'id'=first_id::text and s->>'shower_duration_minutes'='30' and s->>'night_light_usage'='4') then raise exception '관리자 조회에 새 문항이 빠졌습니다.'; end if;
  for bad in select value from jsonb_array_elements('[{"shower_duration_minutes":0},{"shower_duration_minutes":61},{"night_noise_activity":6},{"night_light_usage":0},{"alarm_repeats":-1},{"alarm_repeats":6},{"alarm_repeats":1.5}]'::jsonb) loop
    begin perform public.submit_student_survey(payload||bad);raise exception '허용 범위 밖 응답이 저장되었습니다.';exception when sqlstate '22023' then null;end;
  end loop;
  for entry in select column_name from information_schema.columns where table_schema='public' and table_name='student_surveys' and column_name in ('shower_duration_minutes','night_noise_activity','night_light_usage','alarm_repeats') loop
    if has_column_privilege('anon','public.student_surveys',entry.column_name,'SELECT') then raise exception '익명 학생 정보 조회가 허용되었습니다.'; end if;
  end loop;
end;
$$;
rollback;
select 'PASS: new survey fields, identity upsert, legacy compatibility, admin readback and validation; all test changes rolled back' as result;
