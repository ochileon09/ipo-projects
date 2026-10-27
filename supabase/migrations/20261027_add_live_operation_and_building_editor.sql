begin;

-- Explicit provenance prevents a real student's preference text being treated as test data.
alter table public.student_surveys add column if not exists is_test_data boolean not null default false;
update public.student_surveys set is_test_data = true
where student_name like '테스트학생%' and roommate_preference like '[TEST]%';

create table if not exists public.dormitory_management (
  id boolean primary key default true check (id = true),
  layout jsonb default null,
  test_enabled boolean not null default false,
  include_defaults boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.dormitory_management enable row level security;
revoke all on public.dormitory_management from anon, authenticated;
insert into public.dormitory_management (id, test_enabled)
values (true, exists (select 1 from public.student_surveys where is_test_data))
on conflict (id) do nothing;

create or replace function public.get_dormitory_management_by_key(p_admin_key text)
returns table(layout jsonb, test_enabled boolean, include_defaults boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode = '28000'; end if;
  return query select m.layout, m.test_enabled, m.include_defaults, m.updated_at from public.dormitory_management m where m.id = true;
end;
$$;

create or replace function public.save_dormitory_layout_by_key(p_admin_key text, p_layout jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare b jsonb; f jsonb; wing text; room_total integer := 0; floor_numbers integer[]; building_ids text[] := '{}'; floor_ids text[];
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode = '28000'; end if;
  if p_layout is not null then
    if jsonb_typeof(p_layout) <> 'array' then raise exception '건물 구조는 배열이어야 합니다.'; end if;
    if jsonb_array_length(p_layout) not between 1 and 8 then raise exception '건물 수는 1~8개여야 합니다.'; end if;
    for b in select value from jsonb_array_elements(p_layout) loop
      if coalesce(length(trim(b->>'name')), 0) not between 1 and 30 or coalesce(b->>'id', '') = '' or b->>'id' = any(building_ids) then raise exception '건물 이름 또는 식별자가 잘못되었습니다.'; end if;
      building_ids := array_append(building_ids, b->>'id');
      if coalesce(jsonb_typeof(b->'floors'), '') <> 'array' then raise exception '층 정보가 필요합니다.'; end if;
      if jsonb_array_length(b->'floors') not between 1 and 12 then raise exception '층 수는 1~12개여야 합니다.'; end if;
      if coalesce(b->>'diningSide', '') not in ('left','right','none') then raise exception '식당 방향이 잘못되었습니다.'; end if;
      floor_numbers := '{}'; floor_ids := '{}';
      for f in select value from jsonb_array_elements(b->'floors') loop
        if coalesce((f->>'floor')::integer, 0) not between 1 and 12 or (f->>'floor')::integer = any(floor_numbers) or coalesce(f->>'id', '') = '' or f->>'id' = any(floor_ids) then raise exception '층 번호 또는 식별자가 중복되거나 잘못되었습니다.'; end if;
        floor_numbers := array_append(floor_numbers, (f->>'floor')::integer); floor_ids := array_append(floor_ids, f->>'id');
        foreach wing in array array['left','right'] loop
          if coalesce((f->>(wing || 'Grade'))::integer, 0) not between 1 and 3 or coalesce((f->>(wing || 'Rooms'))::integer, -1) not between 0 and 49 or coalesce((f->>(wing || 'Capacity'))::integer, 0) not between 1 and 6 then raise exception '구역별 학년, 방 수, 인실을 확인해 주세요.'; end if;
          room_total := room_total + (f->>(wing || 'Rooms'))::integer;
        end loop;
      end loop;
    end loop;
    if room_total > 1000 then raise exception '전체 방 수는 1,000개 이하여야 합니다.'; end if;
  end if;
  update public.dormitory_management set layout = p_layout, updated_at = now() where id = true;
end;
$$;

create or replace function public.set_dormitory_operation_by_key(p_admin_key text, p_test_enabled boolean, p_include_defaults boolean)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare removed integer := 0;
begin
  if not public.verify_school_admin_key(p_admin_key) then raise exception '관리자 인증키가 올바르지 않습니다.' using errcode = '28000'; end if;
  if p_test_enabled is null or p_include_defaults is null then raise exception '운영 모드 설정을 확인해 주세요.'; end if;
  perform 1 from public.dormitory_management where id = true for update;
  if not p_test_enabled then
    delete from public.student_surveys where is_test_data = true;
    get diagnostics removed = row_count;
  end if;
  update public.dormitory_management set test_enabled = p_test_enabled, include_defaults = p_include_defaults, updated_at = now() where id = true;
  return removed;
end;
$$;

create or replace function public.seed_test_student_surveys()
returns integer language plpgsql security definer set search_path = public as $$
declare inserted_count integer;
begin
  perform 1 from public.dormitory_management where id = true for update;
  delete from public.student_surveys where is_test_data = true;
  with roster as (
    select grade, grade::text || class_no::text || lpad(seat_no::text, 2, '0') as student_id,
      row_number() over(order by grade, class_no, seat_no) as n
    from public.dormitory_settings s cross join generate_series(1,3) grade
    cross join lateral generate_series(1,s.class_count) class_no
    cross join lateral generate_series(1,s.students_per_class) seat_no where s.id = true
  )
  insert into public.student_surveys (student_id, student_name, grade, wake_time, sleep_time, shower_time, shower_frequency, tidiness, noise_sensitivity, preferred_temperature, light_sensitivity, ventilation_preference, alarm_sensitivity, room_activity, roommate_preference, is_test_data)
  select r.student_id, '테스트학생' || r.student_id, r.grade::smallint,
    (time '06:30' + ((r.n * 7) % 91) * interval '1 minute')::time,
    (time '22:30' + ((r.n * 11) % 181) * interval '1 minute')::time,
    (time '06:20' + ((r.n * 37) % 1081) * interval '1 minute')::time,
    (((r.n - 1) % 3) + 1)::smallint, (((r.n - 1) % 5) + 1)::smallint,
    (((r.n + 1) % 5) + 1)::smallint, (20 + ((r.n - 1) % 6))::smallint,
    (((r.n + 2) % 5) + 1)::smallint, (((r.n + 3) % 5) + 1)::smallint,
    (((r.n + 4) % 5) + 1)::smallint, (((r.n + 1) % 5) + 1)::smallint,
    '[TEST] 학교 명단 기반 자동 생성 학생', true
  from roster r where not exists (select 1 from public.student_surveys existing where existing.student_id = r.student_id and not existing.is_test_data);
  get diagnostics inserted_count = row_count;
  update public.dormitory_management set test_enabled = true, updated_at = now() where id = true;
  return inserted_count;
end;
$$;

create or replace function public.get_student_surveys_for_admin()
returns table (id uuid, student_id text, student_name text, grade smallint, wake_time time, sleep_time time, shower_time time, shower_frequency smallint, tidiness smallint, noise_sensitivity smallint, preferred_temperature smallint, light_sensitivity smallint, ventilation_preference smallint, alarm_sensitivity smallint, room_activity smallint, is_test boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.student_id, s.student_name, s.grade, s.wake_time, s.sleep_time, s.shower_time, s.shower_frequency, s.tidiness, s.noise_sensitivity, s.preferred_temperature, s.light_sensitivity, s.ventilation_preference, s.alarm_sensitivity, s.room_activity, s.is_test_data, s.created_at from public.student_surveys s order by s.created_at desc;
$$;

revoke all on function public.get_dormitory_management_by_key(text) from public;
revoke all on function public.save_dormitory_layout_by_key(text,jsonb) from public;
revoke all on function public.set_dormitory_operation_by_key(text,boolean,boolean) from public;
revoke all on function public.seed_test_student_surveys() from public;
revoke all on function public.get_student_surveys_for_admin() from public;
grant execute on function public.get_dormitory_management_by_key(text) to anon, authenticated;
grant execute on function public.save_dormitory_layout_by_key(text,jsonb) to anon, authenticated;
grant execute on function public.set_dormitory_operation_by_key(text,boolean,boolean) to anon, authenticated;
commit;
