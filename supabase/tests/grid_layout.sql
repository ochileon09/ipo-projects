-- Run in the SQL editor after 20261027_grid_building_studio.sql.
-- Verification always rolls back, preserving the school's saved structure.
begin;
do $$
declare
  sample jsonb := '[{"id":"verification","name":"격자 검증","diningSide":"none","provisional":true,"floors":[{"id":"f2","floor":2,"grid":{"rows":2,"cols":2,"spaces":[{"id":"r1","kind":"room","row":0,"col":0,"rowSpan":1,"colSpan":1,"number":"201","grade":2,"capacity":2},{"id":"hall","kind":"corridor","row":0,"col":1,"rowSpan":1,"colSpan":1},{"id":"washer","kind":"laundry","row":1,"col":0,"rowSpan":1,"colSpan":2}]}}]}]';
  actual jsonb; bad jsonb; rejected boolean;
begin
  perform public.save_dormitory_layout_by_key('12345',sample);
  actual := (select layout from public.get_dormitory_management_by_key('12345'));
  if actual is distinct from sample then raise exception 'Grid round trip failed'; end if;
  bad:=jsonb_set(sample,'{0,floors,0,grid,spaces,2,colSpan}','3');
  rejected:=false; begin perform public.save_dormitory_layout_by_key('12345',bad); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Out of bounds accepted'; end if;
  bad:=jsonb_set(sample,'{0,floors,0,grid,spaces,1,col}','0');
  rejected:=false; begin perform public.save_dormitory_layout_by_key('12345',bad); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Overlap accepted'; end if;
  bad:=sample #- '{0,floors,0,grid,spaces,2}';
  rejected:=false; begin perform public.save_dormitory_layout_by_key('12345',bad); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Uncovered cells accepted'; end if;
  bad:=jsonb_set(sample,'{0,floors,0,grid,spaces,1}','{"id":"r2","kind":"room","row":0,"col":1,"rowSpan":1,"colSpan":1,"number":"201","grade":3,"capacity":1}');
  rejected:=false; begin perform public.save_dormitory_layout_by_key('12345',bad); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Duplicate room number accepted'; end if;
  bad:=jsonb_set(sample,'{0,floors,0,grid,spaces,0,capacity}','7');
  rejected:=false; begin perform public.save_dormitory_layout_by_key('12345',bad); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Invalid bed count accepted'; end if;
  bad:=jsonb_set(sample,'{0,floors,0,grid,spaces,0,row}','0.5');
  rejected:=false; begin perform public.save_dormitory_layout_by_key('12345',bad); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Fractional coordinate accepted'; end if;
  rejected:=false; begin perform public.save_dormitory_layout_by_key('invalid-key',sample); exception when sqlstate '28000' then rejected:=true; end;
  if not rejected then raise exception 'Invalid admin key accepted'; end if;
end;
$$;
select 'PASS: grid save/load, bounds, overlap, coverage, duplicate numbers, capacity, integers, authentication; changes rolled back' as verification;
rollback;
