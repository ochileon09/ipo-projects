-- Run after 20261028_realtime_surveys_and_admin_delete.sql. Everything rolls back.
begin;
do $$
declare
  payload jsonb := '{"student_id":"1101","student_name":"삭제복구검증-임시","wake_time":"07:30","sleep_time":"00:30","shower_time":"07:40","shower_frequency":1,"tidiness":3,"noise_sensitivity":3,"preferred_temperature":22,"light_sensitivity":3,"ventilation_preference":3,"alarm_sensitivity":3,"room_activity":3}';
  original record; newer record; rejected boolean; before_messages bigint;
begin
  if exists(select 1 from public.student_surveys where student_name='삭제복구검증-임시') then raise exception 'Verification identity already exists'; end if;
  before_messages := (select count(*) from realtime.messages where topic='roomfit-admin-refresh');
  select * into original from public.submit_student_survey(payload);
  rejected:=false; begin perform public.delete_student_survey_by_key('invalid-key',original.survey_id); exception when sqlstate '28000' then rejected:=true; end;
  if not rejected then raise exception 'Invalid admin key accepted'; end if;
  if not public.delete_student_survey_by_key('12345',original.survey_id) then raise exception 'Delete failed'; end if;
  if public.delete_student_survey_by_key('12345',original.survey_id) then raise exception 'Repeated delete should be idempotent'; end if;
  if exists(select 1 from public.get_student_surveys_for_admin_by_key('12345') where id=original.survey_id) then raise exception 'Deleted response still active'; end if;
  if not exists(select 1 from public.get_deleted_student_surveys_by_key('12345') where id=original.survey_id) then raise exception 'Deleted response missing from recovery list'; end if;
  if not public.restore_student_survey_by_key('12345',original.survey_id) then raise exception 'Restore failed'; end if;
  if not exists(select 1 from public.get_student_surveys_for_admin_by_key('12345') where id=original.survey_id) then raise exception 'Restored response not active'; end if;
  perform public.delete_student_survey_by_key('12345',original.survey_id);
  perform public.seed_test_student_surveys();
  if not exists(select 1 from public.student_surveys where student_id='1101' and is_test_data and deleted_at is null) then raise exception 'Deleted real response prevented test-mode filling'; end if;
  select * into newer from public.submit_student_survey(payload || '{"wake_time":"08:10"}');
  if newer.survey_id=original.survey_id or newer.was_updated then raise exception 'New response overwrote deleted history'; end if;
  rejected:=false; begin perform public.restore_student_survey_by_key('12345',original.survey_id); exception when unique_violation then rejected:=true; end;
  if not rejected then raise exception 'Recovery overwrote a newer response'; end if;
  if not exists(select 1 from public.get_student_surveys_for_admin_by_key('12345') where id=newer.survey_id and wake_time='08:10'::time) then raise exception 'Newest response was lost'; end if;
  if (select count(*) from realtime.messages where topic='roomfit-admin-refresh') <= before_messages then raise exception 'Realtime refresh triggers did not emit'; end if;
  if has_table_privilege('anon','public.student_surveys','select') or has_table_privilege('anon','public.student_surveys','update') or has_table_privilege('anon','public.student_surveys','delete') then raise exception 'Student table was exposed'; end if;
end;
$$;
select 'PASS: delete, restore, repeated deletion, resubmission, conflict protection, test filling, realtime signals, access control; all changes rolled back' as verification;
rollback;
