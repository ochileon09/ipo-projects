create table if not exists public.dormitory_settings (
  id boolean primary key default true check (id = true),
  total_capacity integer not null default 8 check (total_capacity between 2 and 120),
  room_capacity integer not null default 2 check (room_capacity between 1 and 6),
  updated_at timestamptz not null default now()
);

insert into public.dormitory_settings (id, total_capacity, room_capacity)
values (true, 8, 2)
on conflict (id) do nothing;

alter table public.dormitory_settings enable row level security;
revoke all on public.dormitory_settings from anon, authenticated;

create or replace function public.get_dormitory_settings()
returns table (total_capacity integer, room_capacity integer, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select settings.total_capacity, settings.room_capacity, settings.updated_at
  from public.dormitory_settings settings
  where settings.id = true;
$$;

create or replace function public.set_dormitory_settings(
  p_total_capacity integer,
  p_room_capacity integer
)
returns table (total_capacity integer, room_capacity integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_total_capacity < 2 or p_total_capacity > 120 then
    raise exception '전체 정원은 2명 이상 120명 이하여야 합니다.';
  end if;
  if p_room_capacity < 1 or p_room_capacity > 6 then
    raise exception '방 정원은 1명 이상 6명 이하여야 합니다.';
  end if;

  insert into public.dormitory_settings (id, total_capacity, room_capacity, updated_at)
  values (true, p_total_capacity, p_room_capacity, now())
  on conflict (id) do update set
    total_capacity = excluded.total_capacity,
    room_capacity = excluded.room_capacity,
    updated_at = excluded.updated_at;

  return query
    select settings.total_capacity, settings.room_capacity, settings.updated_at
    from public.dormitory_settings settings
    where settings.id = true;
end;
$$;

drop function if exists public.seed_test_student_surveys();

create or replace function public.seed_test_student_surveys(p_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if p_count < 1 or p_count > 120 then
    raise exception '테스트 인원은 1명 이상 120명 이하여야 합니다.';
  end if;

  insert into public.student_surveys (
    student_id, student_name, grade, wake_time, sleep_time,
    tidiness, noise_sensitivity, preferred_temperature,
    roommate_preference, accessibility_needs
  )
  select
    (((number - 1) % 3) + 1)::text || lpad(number::text, 3, '0'),
    '테스트학생' || lpad(number::text, 2, '0'),
    (((number - 1) % 3) + 1)::smallint,
    (time '06:20' + ((number * 10) % 90) * interval '1 minute')::time,
    (time '22:00' + ((number * 17) % 150) * interval '1 minute')::time,
    (((number - 1) % 5) + 1)::smallint,
    (((number + 1) % 5) + 1)::smallint,
    (20 + ((number - 1) % 6))::smallint,
    '[TEST] 정원 연동 자동 생성 학생',
    case when number = 1 then '저층 배치 테스트' else null end
  from generate_series(1, p_count) as number
  where not exists (
    select 1 from public.student_surveys existing
    where existing.student_id = ((((number - 1) % 3) + 1)::text || lpad(number::text, 3, '0'))
      and existing.student_name = ('테스트학생' || lpad(number::text, 2, '0'))
  );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.get_dormitory_settings() from public;
revoke all on function public.set_dormitory_settings(integer, integer) from public;
revoke all on function public.seed_test_student_surveys(integer) from public;
grant execute on function public.get_dormitory_settings() to authenticated;
grant execute on function public.set_dormitory_settings(integer, integer) to authenticated;
grant execute on function public.seed_test_student_surveys(integer) to authenticated;
