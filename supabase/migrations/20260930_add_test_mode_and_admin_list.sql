create or replace function public.seed_test_student_surveys()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.student_surveys (
    student_id, student_name, grade, wake_time, sleep_time,
    tidiness, noise_sensitivity, preferred_temperature,
    roommate_preference, accessibility_needs
  )
  select * from (values
    ('1901', '테스트학생A', 1::smallint, '06:40'::time, '22:30'::time, 5::smallint, 4::smallint, 22::smallint, '[TEST] 조용하고 일찍 자는 학생', null::text),
    ('1902', '테스트학생B', 1::smallint, '06:50'::time, '22:40'::time, 5::smallint, 4::smallint, 22::smallint, '[TEST] 규칙적인 생활 선호', null::text),
    ('1903', '테스트학생C', 1::smallint, '07:30'::time, '00:10'::time, 2::smallint, 2::smallint, 24::smallint, '[TEST] 늦게 자는 학생', null::text),
    ('1904', '테스트학생D', 1::smallint, '07:20'::time, '00:00'::time, 2::smallint, 2::smallint, 24::smallint, '[TEST] 생활 소음에 둔감함', null::text),
    ('2901', '테스트학생E', 2::smallint, '06:30'::time, '23:00'::time, 4::smallint, 5::smallint, 21::smallint, '[TEST] 매우 조용한 방 선호', '계단 이용이 불편해 저층 선호'),
    ('2902', '테스트학생F', 2::smallint, '06:35'::time, '23:10'::time, 4::smallint, 5::smallint, 21::smallint, '[TEST] 정리정돈을 함께 잘하는 학생', null::text),
    ('3901', '테스트학생G', 3::smallint, '07:00'::time, '23:30'::time, 3::smallint, 3::smallint, 23::smallint, '[TEST] 특별한 희망 없음', null::text),
    ('3902', '테스트학생H', 3::smallint, '07:05'::time, '23:35'::time, 3::smallint, 3::smallint, 23::smallint, '[TEST] 비슷한 생활 시간 선호', null::text)
  ) as test_data(student_id, student_name, grade, wake_time, sleep_time, tidiness, noise_sensitivity, preferred_temperature, roommate_preference, accessibility_needs)
  where not exists (
    select 1 from public.student_surveys existing
    where existing.student_id = test_data.student_id
      and existing.student_name = test_data.student_name
  );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.get_student_surveys_for_admin()
returns table (
  id uuid,
  student_id text,
  student_name text,
  grade smallint,
  wake_time time,
  sleep_time time,
  tidiness smallint,
  noise_sensitivity smallint,
  preferred_temperature smallint,
  is_test boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    survey.id,
    survey.student_id,
    survey.student_name,
    survey.grade,
    survey.wake_time,
    survey.sleep_time,
    survey.tidiness,
    survey.noise_sensitivity,
    survey.preferred_temperature,
    coalesce(survey.roommate_preference like '[TEST]%', false) as is_test,
    survey.created_at
  from public.student_surveys survey
  order by survey.created_at desc;
$$;

revoke all on function public.seed_test_student_surveys() from public;
revoke all on function public.get_student_surveys_for_admin() from public;
grant execute on function public.seed_test_student_surveys() to authenticated;
grant execute on function public.get_student_surveys_for_admin() to authenticated;
