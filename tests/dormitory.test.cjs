const { test } = require('node:test');
const assert = require('node:assert/strict');
const { roomCompatibilityScore, optimizeRoomAssignments } = require('../.codex_tmp/matching-tests/roommate-matching.js');
const { createDefaultLayout, allocateDormitory, newFloor, validateLayout } = require('../.codex_tmp/matching-tests/dormitory-layout.js');
const { selectRoster, createDefaultRoster } = require('../.codex_tmp/matching-tests/student-roster.js');
const { createFloorGrid, expandSelection, paintGrid, mergeGrid, splitGrid, moveGridSpace, validateFloorGrid } = require('../.codex_tmp/matching-tests/floor-grid.js');
const { floorRooms, gridFromLegacyFloor } = require('../.codex_tmp/matching-tests/dormitory-layout.js');
const { planManualMove } = require('../.codex_tmp/matching-tests/dormitory-layout.js');
const { roommateCompatibility, showerOverlapMinutes, hasDetailedHabits } = require('../.codex_tmp/matching-tests/roommate-matching.js');

function student(studentId, overrides = {}) {
  return { ...createDefaultRoster(6, 16).find(row => row.student_id === studentId), id: studentId, is_default: false, student_name: '학생' + studentId, created_at: '2026-10-01T00:00:00Z', shower_duration_minutes:10,night_noise_activity:1,night_light_usage:1,alarm_repeats:0,...overrides };
}

test('scores stay within 0–10 and distinguish overlapping showers; single occupancy is not rated', () => {
  const a = student('2101'); const b = student('2102');
  assert.equal(roomCompatibilityScore([a]), null);
  const overlap = roomCompatibilityScore([a, b]);
  const separated = roomCompatibilityScore([a, { ...b, shower_time: '21:00' }]);
  assert(separated > overlap);
  assert.equal(separated, 10);
  assert(overlap >= 0 && overlap <= 10);
  for (let i = 0; i < 24; i++) {
    const score = roomCompatibilityScore([a, { ...b, shower_time: String(i).padStart(2,'0') + ':00', tidiness: 1, noise_sensitivity: 5 }]);
    assert(score >= 0 && score <= 10);
  }
});

test('showers use occupied intervals and midnight wrap; non-overlapping morning and evening slots score equally',()=>{
  const a=student('2101',{shower_time:'07:40',shower_duration_minutes:10});
  const b=student('2102',{shower_time:'07:55',shower_duration_minutes:10});
  assert.equal(showerOverlapMinutes(a,b),0);
  assert.equal(roomCompatibilityScore([a,b]),roomCompatibilityScore([a,{...b,shower_time:'22:00'}]));
  assert.equal(showerOverlapMinutes({...a,shower_duration_minutes:30},b),10);
  assert.equal(showerOverlapMinutes(a,{...b,shower_time:'07:50'}),0);
  assert.equal(showerOverlapMinutes({...a,shower_time:'23:50',shower_duration_minutes:30},{...b,shower_time:'00:05'}),10);
});

test('night noise and light are evaluated against the other student sensitivity, symmetrically',()=>{
  const sleeper=student('2101',{noise_sensitivity:5,light_sensitivity:5});
  const quiet=student('2102',{shower_time:'22:00'});
  const noisy={...quiet,night_noise_activity:5};const bright={...quiet,night_light_usage:5};
  assert(roommateCompatibility(sleeper,quiet)>roommateCompatibility(sleeper,noisy));
  assert(roommateCompatibility(sleeper,quiet)>roommateCompatibility(sleeper,bright));
  assert.equal(roommateCompatibility(sleeper,noisy),roommateCompatibility(noisy,sleeper));
  const tolerant={...sleeper,noise_sensitivity:1};
  assert.equal(roommateCompatibility(tolerant,quiet),roommateCompatibility(tolerant,noisy));
});

test('repeated alarms matter while a roommate is asleep, and unanswered habits stay explicitly unknown',()=>{
  const early=student('2101',{wake_time:'07:00',alarm_repeats:1});
  const late=student('2102',{wake_time:'08:00',alarm_sensitivity:5,shower_time:'22:00'});
  assert(roommateCompatibility(early,late)>roommateCompatibility({...early,alarm_repeats:5},late));
  const sameWake={...late,wake_time:'07:00'};
  assert.equal(roommateCompatibility(early,sameWake),roommateCompatibility({...early,alarm_repeats:5},sameWake));
  const legacy={...early,shower_duration_minutes:null,night_noise_activity:null,night_light_usage:null,alarm_repeats:null};
  assert(!hasDetailedHabits(legacy));assert(hasDetailedHabits(early));
  assert(Number.isFinite(roomCompatibilityScore([legacy,late])));
  assert.equal(createDefaultRoster(1,1)[0].shower_duration_minutes,null);
});

test('real response beats a newer test response and repeated real responses use newest', () => {
  const latestReal = student('2101', { id: 'real-new', created_at: '2026-10-02T00:00:00Z' });
  const roster = selectRoster([student('2101', { id: 'test', is_test: true, created_at: '2026-10-27T00:00:00Z' }), student('2101', { id: 'real-old' }), latestReal], 6, 16, true, false);
  assert.equal(roster.activeStudents.length, 1);
  assert.equal(roster.activeStudents[0].id, 'real-new');
});

test('live mode excludes virtual students and defaults are opt-in without losing the school roster', () => {
  const rows = [student('2101'), student('2102', { is_test: true })];
  const live = selectRoster(rows, 6, 16, false, false);
  assert.equal(live.activeStudents.length, 1);
  assert.equal(live.allStudents.length, 288);
  const defaults = selectRoster(rows, 6, 16, false, true);
  assert.equal(defaults.activeStudents.length, 288);
  assert.equal(defaults.activeStudents.find(s => s.student_id === '2102').sleep_time, '00:30:00');
  assert.equal(defaults.activeStudents.find(s => s.student_id === '2102').is_default, true);
});

test('custom capacity is respected, grades never mix, and real students displace test/default students', () => {
  const layout = [{ id:'a', name:'A', diningSide:'left', provisional:false, floors:[{ ...newFloor(2,2), leftRooms:1,rightRooms:1,leftCapacity:1,rightCapacity:2,rightGrade:3 }] }];
  const result = allocateDormitory([student('2101',{is_test:true}),student('2102'),student('2103'),student('3101'),student('3102'),student('1101')],layout);
  assert.equal(result.rooms[0].students[0].student_id,'2102');
  assert.equal(result.rooms[1].students.length,2);
  assert(result.rooms.every(room=>room.students.length<=room.capacity && room.students.every(s=>s.grade===room.grade)));
  assert(result.waiting.some(s=>s.student_id==='1101'));
  assert(result.waiting.some(s=>s.student_id==='2101'));
  assert.equal(result.waiting[0].is_test,false);
});

test('each roster member is assigned at most once and default layout has enough beds for uneven room capacity', () => {
  for (const capacity of [1,2,3,4,5,6]) {
    const students = createDefaultRoster(2,7);
    const layout = createDefaultLayout(14,capacity);
    assert.equal(validateLayout(layout),null);
    const result = allocateDormitory(students,layout);
    const ids = result.rooms.flatMap(room=>room.students.map(s=>s.student_id));
    assert.equal(ids.length,42);
    assert.equal(new Set(ids).size,42);
    assert.equal(result.waiting.length,0);
  }
});

test('new responses can change earlier temporary roommates; identical inputs are deterministic', () => {
  const a=student('2101'); const b=student('2102',{shower_time:'07:45'});
  const c=student('2103',{shower_time:'22:00'});
  const initial=optimizeRoomAssignments([a,b],[2,2]);
  const updated=optimizeRoomAssignments([a,b,c],[2,2]);
  assert.equal(initial.rooms[0][1].student_id,'2102');
  assert.equal(updated.rooms[0][1].student_id,'2103');
  assert.deepEqual(updated,optimizeRoomAssignments([a,b,c],[2,2]));
});

test('invalid layouts and actual IDs outside configured classes are surfaced',()=>{
  const layout=createDefaultLayout(96,2);
  layout[0].floors[1].floor=4;
  assert(validateLayout(layout));
  const roster=selectRoster([student('2602')],1,16,false,false);
  assert.equal(roster.outsideRoster[0].student_id,'2602');
  assert.equal(roster.activeStudents.length,0);
});

test('received actual surveys remain visible outside school capacity and deduplicate by both ID and name', () => {
  const rows = [
    student('2101', { id:'old', student_name:'홍길동' }),
    student('2101', { id:'new', student_name:' 홍길동 ', student_id:' 2101 ', created_at:'2026-10-27T00:00:00Z', wake_time:'08:00' }),
    student('2101', { id:'other-name', student_name:'김학생' }),
    student('2602', { id:'outside', student_id:'2518', student_name:'범위밖학생' }),
    student('2102', { id:'test-only', is_test:true }),
  ];
  const roster=selectRoster(rows,6,16,false,false);
  assert.equal(roster.receivedStudents.length,3);
  assert.equal(roster.receivedStudents.find(row=>row.student_name==='홍길동').id,'new');
  assert.equal(roster.receivedStudents.find(row=>row.student_name==='홍길동').wake_time,'08:00');
  assert.equal(roster.outsideRoster[0].student_id,'2518');
  assert.equal(roster.activeStudents.length,1);
  assert.equal(roster.activeStudents[0].id,'new');
  const expanded=selectRoster(rows,6,18,false,false);
  assert.equal(expanded.outsideRoster.length,0);
  assert.equal(expanded.activeStudents.length,2);
});

test('legacy room conversion preserves every room ID, number, grade and bed count for all supported wing sizes', () => {
  for(const count of [0,1,4,16,49]) {
    const floor={...newFloor(3,3,2),leftRooms:count,rightRooms:49-count,rightGrade:2,rightCapacity:4};
    const grid=gridFromLegacyFloor(floor);
    assert.equal(validateFloorGrid(grid),null);
    assert.deepEqual(floorRooms({...floor,grid}).sort((a,b)=>a.id.localeCompare(b.id)),floorRooms(floor).sort((a,b)=>a.id.localeCompare(b.id)));
  }
});

test('L shaped floors and facilities count only room beds; merged rooms count as one and expand selections',()=>{
  let grid=createFloorGrid(3,4,2,2,2);
  grid=paintGrid(grid,{top:0,left:2,bottom:1,right:3},'outside',2,2,2);
  grid=mergeGrid(grid,{top:2,left:2,bottom:2,right:3},'laundry',2,2,2);
  assert.equal(validateFloorGrid(grid),null);
  const layout=[{id:'a',name:'A',diningSide:'none',floors:[{...newFloor(2),grid}]}];
  let result=allocateDormitory([],layout);
  assert.equal(result.rooms.length,6);
  assert.equal(result.rooms.reduce((n,r)=>n+r.capacity,0),12);
  grid=mergeGrid(grid,{top:0,left:0,bottom:1,right:1},'room',2,3,4);
  assert.deepEqual(expandSelection(grid,{row:1,col:1}),{top:0,left:0,bottom:1,right:1});
  result=allocateDormitory([],[{...layout[0],floors:[{...newFloor(2),grid}]}]);
  assert.equal(result.rooms.length,3);
  assert.equal(result.rooms.reduce((n,r)=>n+r.capacity,0),8);
  const split=splitGrid(grid,{top:0,left:0,bottom:1,right:1},2);
  assert.equal(validateFloorGrid(split),null);
  assert.equal(new Set(split.spaces.filter(s=>s.kind==='room').map(s=>s.number)).size,6);
});

test('moving a merged room retains its identity and rejects overlap or leaving the canvas',()=>{
  let grid=createFloorGrid(4,4,2,2,2,false);
  grid=mergeGrid(grid,{top:0,left:0,bottom:1,right:1},'room',2,2,3);
  const room=grid.spaces.find(s=>s.kind==='room');
  grid=moveGridSpace(grid,room.id,2,2);
  assert.equal(validateFloorGrid(grid),null);
  assert.deepEqual(grid.spaces.find(s=>s.id===room.id),{...room,row:2,col:2});
  const occupied=paintGrid(grid,{top:0,left:0,bottom:0,right:0},'stairs',2,2,2);
  assert.throws(()=>moveGridSpace(occupied,room.id,0,0),/겹칩니다/);
  assert.throws(()=>moveGridSpace(grid,room.id,3,3),/밖/);
});

test('grid validation rejects overlaps, holes, duplicate room numbers, invalid spans and unsupported capacity',()=>{
  const grid=createFloorGrid(2,2,2,2,2);
  assert(validateFloorGrid({...grid,spaces:[...grid.spaces,grid.spaces[0]]}));
  assert(validateFloorGrid({...grid,spaces:grid.spaces.slice(1)}));
  assert(validateFloorGrid({...grid,spaces:grid.spaces.map((s,i)=>i? s:{...s,rowSpan:3})}));
  assert(validateFloorGrid({...grid,spaces:grid.spaces.map((s,i)=>i? s:{...s,capacity:7})}));
  assert(validateLayout([{id:'a',name:'A',diningSide:'none',floors:[{...newFloor(2),grid:{...grid,spaces:grid.spaces.map(s=>({...s,number:'201'}))}}]}]));
});

test('mixed grid and legacy floors retain grade segregation and report capacity shortages',()=>{
  let grid=createFloorGrid(1,2,2,2,1);
  grid=paintGrid(grid,{top:0,left:1,bottom:0,right:1},'room',2,3,2);
  const layout=[{id:'a',name:'A',diningSide:'none',floors:[{...newFloor(2),grid},{...newFloor(3,1,1),leftRooms:1,rightRooms:0}]}];
  assert.equal(validateLayout(layout),null);
  const result=allocateDormitory([student('1101'),student('2101'),student('2102'),student('3101'),student('3102')],layout);
  assert.equal(result.waiting.length,1);
  assert(result.rooms.every(room=>room.students.every(s=>s.grade===room.grade)&&room.students.length<=room.capacity));
});

test('large generated floors keep unique room numbers across one and two digit floor numbers',()=>{
  const floors=[1,11].map(n=>({...newFloor(n),grid:createFloorGrid(12,12,n,1,2)}));
  assert.equal(validateLayout([{id:'a',name:'A',diningSide:'none',floors}]),null);
  assert(floors[0].grid.spaces.some(s=>s.number==='1-100'));
});

test('converting a legacy map or moving only its room tiles leaves student assignments unchanged',()=>{
  const floor={...newFloor(2,2,2),leftRooms:4,rightRooms:4};
  const students=createDefaultRoster(1,12).filter(s=>s.grade===2);
  const makeLayout=f=>[{id:'a',name:'A',diningSide:'none',floors:[f]}];
  const initial=allocateDormitory(students,makeLayout(floor));
  const grid=gridFromLegacyFloor(floor);
  const converted=allocateDormitory(students,makeLayout({...floor,grid}));
  assert.deepEqual(converted,initial);
  const moved=moveGridSpace(grid,'left/0',3,0);
  assert.deepEqual(allocateDormitory(students,makeLayout({...floor,grid:moved})),initial);
});

function manualLayout() {return [{id:'a',name:'A',diningSide:'none',floors:[{...newFloor(2,2,2),leftRooms:3,rightRooms:1,rightGrade:3}]}];}
function location(result,id) {for(const room of result.rooms){const bedIndex=room.beds.findIndex(s=>s?.student_id===id);if(bedIndex>=0)return {roomId:room.id,bedIndex};}return null;}
test('manual move to an empty bed retains the chosen bed index, vacant source and other students',()=>{
  const people=[student('2101'),student('2102')];const layout=manualLayout();
  const before=allocateDormitory(people,layout);const source=location(before,'2101');
  const target={roomId:'a/floor-2/left/2',bedIndex:1};
  const pins=planManualMove(before.rooms,[],'2101',target);const after=allocateDormitory(people,layout,pins);
  assert.deepEqual(location(after,'2101'),target);
  assert.equal(after.rooms.find(r=>r.id===source.roomId).beds[source.bedIndex],null);
  assert.deepEqual(location(after,'2102'),location(before,'2102'));
  assert.deepEqual(location(allocateDormitory([...people,student('2103')],layout,pins),'2101'),target);
});
test('dropping onto an occupied bed swaps precisely both student positions, including within one room',()=>{
  const people=[student('2101'),student('2102'),student('2103')];const layout=manualLayout();
  let before=allocateDormitory(people,layout);let pins=[];
  for(const second of ['2102','2103']){
    const from=location(before,'2101');const target=location(before,second);
    pins=planManualMove(before.rooms,pins,'2101',target);const after=allocateDormitory(people,layout,pins);
    assert.deepEqual(location(after,'2101'),target);assert.deepEqual(location(after,second),from);
    assert(after.rooms.every(r=>r.score===roomCompatibilityScore(r.students)));
    before=after;
  }
});
test('manual placement rejects different grades, invalid beds and missing students; no-op retains pins',()=>{
  const result=allocateDormitory([student('2101'),student('3101')],manualLayout());
  assert.throws(()=>planManualMove(result.rooms,[],'2101',{roomId:'a/floor-2/right/0',bedIndex:0}),/학년/);
  assert.throws(()=>planManualMove(result.rooms,[],'2101',{roomId:'a/floor-2/left/0',bedIndex:2}),/자리/);
  assert.throws(()=>planManualMove(result.rooms,[],'2109',{roomId:'a/floor-2/left/0',bedIndex:0}),/학생/);
  const pins=[];assert.equal(planManualMove(result.rooms,pins,'2101',location(result,'2101')),pins);
});
test('manual test students never displace real responses when capacity fills; stale pins fall back safely',()=>{
  const layout=[{...manualLayout()[0],floors:[{...newFloor(2,2,2),leftRooms:1,rightRooms:0}]}];
  const pins=[{studentId:'2103',roomId:'a/floor-2/left/0',bedIndex:0}];
  const result=allocateDormitory([student('2101'),student('2102'),student('2103',{is_test:true})],layout,pins);
  assert.equal(result.rooms[0].students.length,2);assert(result.rooms[0].students.every(s=>!s.is_test));
  assert.equal(result.inactiveManual.length,1);
  const stale=allocateDormitory([student('2101')],layout,[{studentId:'2101',roomId:'removed-room',bedIndex:0}]);
  assert.equal(stale.invalidManual.length,1);assert(location(stale,'2101'));
});
test('repeated manual moves and swaps maintain unique occupancy, room capacities and pinned targets',()=>{
  const people=['2101','2102','2103','2104','2105','3101'].map(id=>student(id));const layout=manualLayout();
  let pins=[];let result=allocateDormitory(people,layout);
  for(let i=0;i<36;i++){
    const id=people[i%5].student_id;const target={roomId:`a/floor-2/left/${Math.floor(i/2)%3}`,bedIndex:i%2};
    pins=planManualMove(result.rooms,pins,id,target);result=allocateDormitory(people,layout,pins);
    assert.deepEqual(location(result,id),target);
    const ids=result.rooms.flatMap(r=>r.students.map(s=>s.student_id));
    assert.equal(ids.length,people.length);assert.equal(new Set(ids).size,people.length);
    assert(result.rooms.every(r=>r.students.length<=r.capacity&&r.beds.length===r.capacity&&r.students.every(s=>s.grade===r.grade)));
  }
});
