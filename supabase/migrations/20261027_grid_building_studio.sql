begin;

create or replace function public.save_dormitory_layout_by_key(p_admin_key text, p_layout jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  b jsonb; f jsonb; g jsonb; s jsonb; wing text; room_total integer := 0;
  floor_numbers integer[]; building_ids text[] := '{}'; floor_ids text[]; space_ids text[]; room_numbers text[];
  grid_rows integer; grid_cols integer; r integer; c integer; rs integer; cs integer; occupied integer[]; cell integer; n text;
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
      floor_numbers := '{}'; floor_ids := '{}'; room_numbers := '{}';
      for f in select value from jsonb_array_elements(b->'floors') loop
        if coalesce(f->>'floor','') !~ '^[0-9]+$' or coalesce((f->>'floor')::integer, 0) not between 1 and 12 or (f->>'floor')::integer = any(floor_numbers) or coalesce(f->>'id', '') = '' or f->>'id' = any(floor_ids) then raise exception '층 번호 또는 식별자가 중복되거나 잘못되었습니다.'; end if;
        floor_numbers := array_append(floor_numbers, (f->>'floor')::integer); floor_ids := array_append(floor_ids, f->>'id');
        if f ? 'grid' then
          g := f->'grid';
          if jsonb_typeof(g) <> 'object' or coalesce(g->>'rows','') !~ '^[0-9]+$' or coalesce(g->>'cols','') !~ '^[0-9]+$' then raise exception '격자 크기는 정수여야 합니다.'; end if;
          grid_rows := (g->>'rows')::integer; grid_cols := (g->>'cols')::integer;
          if grid_rows not between 1 and 24 or grid_cols not between 1 and 24 then raise exception '격자는 가로·세로 각각 1~24칸입니다.'; end if;
          if coalesce(jsonb_typeof(g->'spaces'),'') <> 'array' then raise exception '격자 공간 정보가 필요합니다.'; end if;
          if jsonb_array_length(g->'spaces') not between 1 and grid_rows*grid_cols then raise exception '공간 개수를 확인해 주세요.'; end if;
          occupied := '{}'; space_ids := '{}';
          for s in select value from jsonb_array_elements(g->'spaces') loop
            if coalesce(length(s->>'id'),0) not between 1 and 100 or s->>'id'=any(space_ids) or coalesce(s->>'kind','') not in ('room','corridor','stairs','laundry','dryer','lounge','outside') then raise exception '공간 종류 또는 식별자가 잘못되었습니다.'; end if;
            space_ids := array_append(space_ids,s->>'id');
            if coalesce(s->>'row','') !~ '^[0-9]+$' or coalesce(s->>'col','') !~ '^[0-9]+$' or coalesce(s->>'rowSpan','') !~ '^[0-9]+$' or coalesce(s->>'colSpan','') !~ '^[0-9]+$' then raise exception '공간 위치와 크기는 정수여야 합니다.'; end if;
            r := (s->>'row')::integer; c := (s->>'col')::integer; rs := (s->>'rowSpan')::integer; cs := (s->>'colSpan')::integer;
            if r < 0 or c < 0 or rs < 1 or cs < 1 or r+rs>grid_rows or c+cs>grid_cols then raise exception '격자 밖으로 나간 공간이 있습니다.'; end if;
            for row_index in r..r+rs-1 loop
              for col_index in c..c+cs-1 loop
                cell := row_index*grid_cols+col_index;
                if cell=any(occupied) then raise exception '공간이 서로 겹칩니다.'; end if;
                occupied := array_append(occupied,cell);
              end loop;
            end loop;
            if s->>'kind'='room' then
              n := s->>'number';
              if coalesce(length(n),0) not between 1 and 12 or n<>btrim(n) or n=any(room_numbers) then raise exception '건물 내 호실 번호가 중복되거나 잘못되었습니다.'; end if;
              if coalesce(s->>'grade','') !~ '^[1-3]$' or coalesce(s->>'capacity','') !~ '^[1-6]$' then raise exception '호실의 학년은 1~3, 인실은 1~6입니다.'; end if;
              room_numbers := array_append(room_numbers,n); room_total := room_total+1;
            end if;
          end loop;
          if coalesce(array_length(occupied,1),0)<>grid_rows*grid_cols then raise exception '빈 칸은 건물 밖으로 지정해 주세요.'; end if;
        else
          foreach wing in array array['left','right'] loop
            if coalesce((f->>(wing || 'Grade'))::integer, 0) not between 1 and 3 or coalesce((f->>(wing || 'Rooms'))::integer, -1) not between 0 and 49 or coalesce((f->>(wing || 'Capacity'))::integer, 0) not between 1 and 6 then raise exception '구역별 학년, 방 수, 인실을 확인해 주세요.'; end if;
            for room_index in 1..(f->>(wing||'Rooms'))::integer loop
              n := (f->>'floor') || lpad((room_index+case when wing='right' then (f->>'leftRooms')::integer else 0 end)::text,2,'0');
              if n=any(room_numbers) then raise exception '건물 내 호실 번호가 중복됩니다.'; end if;
              room_numbers := array_append(room_numbers,n);
            end loop;
            room_total := room_total + (f->>(wing || 'Rooms'))::integer;
          end loop;
        end if;
      end loop;
    end loop;
    if room_total > 1000 then raise exception '전체 방 수는 1,000개 이하여야 합니다.'; end if;
  end if;
  update public.dormitory_management set layout=p_layout,updated_at=now() where id=true;
end;
$$;

revoke all on function public.save_dormitory_layout_by_key(text,jsonb) from public;
grant execute on function public.save_dormitory_layout_by_key(text,jsonb) to anon,authenticated;
commit;
