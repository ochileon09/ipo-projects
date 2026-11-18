const { test } = require('node:test');
const assert = require('node:assert/strict');
const { roomCompatibilityScore, optimizeRoomAssignments } = require('../.codex_tmp/matching-tests/roommate-matching.js');
const { createDefaultLayout: rawDefaultLayout, allocateDormitory: strictAllocate, newFloor, validateLayout } = require('../.codex_tmp/matching-tests/dormitory-layout.js');
const { selectRoster, createDefaultRoster: rawDefaultRoster, applyGenderProfiles } = require('../.codex_tmp/matching-tests/student-roster.js');
const { createFloorGrid, expandSelection, paintGrid, mergeGrid, splitGrid, moveGridSpace, validateFloorGrid } = require('../.codex_tmp/matching-tests/floor-grid.js');
const { floorRooms, gridFromLegacyFloor } = require('../.codex_tmp/matching-tests/dormitory-layout.js');
const { planManualMove } = require('../.codex_tmp/matching-tests/dormitory-layout.js');
const { roommateCompatibility, showerOverlapMinutes, hasDetailedHabits } = require('../.codex_tmp/matching-tests/roommate-matching.js');
const { buildDormitoryView: strictView, waitingReason, summarizeDormitory } = require('../.codex_tmp/matching-tests/dormitory-view.js');
const { compatibilityBreakdown } = require('../.codex_tmp/matching-tests/roommate-matching.js');
const { studentAssignmentResult } = require('../.codex_tmp/matching-tests/student-result.js');

// Existing regression scenarios use an explicitly verified, single-gender fictional school.
// Gender-specific scenarios below call the strict production functions without these fixtures.
const configured = layout => layout.map(building=>({...building,genderPolicy:building.genderPolicy??'male'}));
const createDefaultLayout = (...args) => configured(rawDefaultLayout(...args));
const createDefaultRoster = (...args) => rawDefaultRoster(...args).map(row=>({...row,gender:'male',gender_verified:true,reported_gender:'male'}));
const allocateDormitory = (students,layout,pins) => strictAllocate(students,configured(layout),pins);
function buildDormitoryView(input) {
  const school=input.finalAssignment?.school??input.school;
  const genderProfiles=rawDefaultRoster(school.classCount,school.studentsPerClass).map(row=>({student_id:row.student_id,student_name:input.surveys.find(s=>!s.is_test&&s.student_id===row.student_id)?.student_name??'학생'+row.student_id,gender:'male',verified:true,checked_reported_gender:'male'}));
  return strictView({...input,layout:configured(input.layout??rawDefaultLayout(school.classCount*school.studentsPerClass,school.roomCapacity)),genderProfiles});
}

function student(studentId, overrides = {}) {
  return { ...createDefaultRoster(6, 16).find(row => row.student_id === studentId), id: studentId, is_default: false, student_name: '학생' + studentId, created_at: '2026-10-01T00:00:00Z', shower_duration_minutes:10,night_noise_activity:1,night_light_usage:1,alarm_repeats:0,...overrides };
}

test('dashboard and editor projection retains manual beds and applies live/test/default modes consistently', () => {
  const input = {
    surveys: [student('2101'), student('2102'), student('2103', { is_test: true }), student('2201')],
    school: { classCount: 1, studentsPerClass: 4, roomCapacity: 2 },
    layout: null, manualAssignments: [], testEnabled: false, includeDefaults: false,
  };
  const live = buildDormitoryView(input);
  assert.equal(live.assignedCount, 2);
  assert.equal(live.roster.receivedStudents.length, 3);
  assert.equal(live.waitingCount, 1); // A received response outside configured class counts still needs review.
  assert.equal(live.totalBeds, 12);
  const target = live.allocation.rooms.filter(room => room.grade === 2)[1];
  const pinned = buildDormitoryView({ ...input, manualAssignments: [{ studentId: '2101', roomId: target.id, bedIndex: 1 }] });
  assert.equal(pinned.allocation.rooms.find(room => room.id === target.id).beds[1].student_id, '2101');
  assert.equal(pinned.assignedCount, 2);
  assert.equal(buildDormitoryView({ ...input, testEnabled: true }).assignedCount, 3);
  const defaults = buildDormitoryView({ ...input, includeDefaults: true });
  assert.equal(defaults.assignedCount, 12);
  assert.equal(defaults.totalBeds - defaults.assignedCount, 0);
  assert.equal(defaults.waitingCount, 1);
});

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

test('explicit indifference removes only the selected preference mismatch, symmetrically', () => {
  const a = student('2101', { tidiness: 1, preferred_temperature: 20, ventilation_preference: 1 });
  const b = student('2102', { tidiness: 5, preferred_temperature: 24, ventilation_preference: 5, shower_time: '22:00' });
  const baseline = roommateCompatibility(a, b);
  for (const [preference, field] of [['tidiness', 'tidiness'], ['temperature', 'preferred_temperature'], ['ventilation', 'ventilation_preference']]) {
    const flexible = { ...a, flexible_preferences: [preference] };
    assert(roommateCompatibility(flexible, b) > baseline);
    assert.equal(roommateCompatibility(flexible, b), roommateCompatibility({ ...a, [field]: b[field] }, b));
    assert.equal(roommateCompatibility(flexible, b), roommateCompatibility(b, flexible));
  }
  assert.equal(roommateCompatibility({ ...a, flexible_preferences: [] }, b), baseline);
  const flexible = { ...a, flexible_preferences: ['tidiness', 'temperature', 'ventilation'] };
  assert.equal(roomCompatibilityScore([flexible, b]), 10);
  assert(roommateCompatibility(flexible, b) > roommateCompatibility(flexible, { ...b, night_noise_activity: 5 }));
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


test('approved separation is enforced in automatic rooms and overrides conflicting old manual pins',()=>{
 const a=student('2101',{avoid_with:['2102']});const b=student('2102');const c=student('2103');
 const layout=[{id:'a',name:'A',diningSide:'none',provisional:false,floors:[{...newFloor(2,2,2),leftRooms:1,rightRooms:1}]}];
 const base=allocateDormitory([a,b,c],layout);
 assert(base.rooms.every(room=>!(room.students.some(s=>s.student_id==='2101')&&room.students.some(s=>s.student_id==='2102'))));
 const first=base.rooms[0];
 const pinned=allocateDormitory([a,b,c],layout,[{studentId:'2101',roomId:first.id,bedIndex:0},{studentId:'2102',roomId:first.id,bedIndex:1}]);
 assert.equal(pinned.rooms.flatMap(room=>room.students).length,3);
 assert(pinned.rooms.every(room=>!(room.students.some(s=>s.student_id==='2101')&&room.students.some(s=>s.student_id==='2102'))));
 const full=optimizeRoomAssignments([a,b],[2]);assert.equal(full.waiting.length,1);
 const destination=base.rooms.find(room=>room.students.some(s=>s.student_id==='2101'));
 assert.throws(()=>planManualMove(base.rooms,[],'2102',{roomId:destination.id,bedIndex:destination.beds.findIndex(s=>s?.student_id!=='2101')}),/분리/);
});
test('environment preferences affect fit while any and removed night/alarm answers do not penalize new surveys',()=>{
 const env={version:1,humidity:1,summer_ac:1,winter_heater:1};
 const a=student('2101',{environment_answers:env});const b=student('2102',{environment_answers:env,shower_time:'22:00'});
 assert(roomCompatibilityScore([a,b])>roomCompatibilityScore([a,{...b,environment_answers:{version:1,humidity:3,summer_ac:3,winter_heater:3}}]));
 assert.equal(roomCompatibilityScore([a,b]),roomCompatibilityScore([a,{...b,environment_answers:{version:1,humidity:0,summer_ac:0,winter_heater:0},night_noise_activity:5,night_light_usage:5,alarm_repeats:5}]));
});

test('only approved matching identities activate separation in the shared dashboard/editor projection',()=>{
 const surveys=[student('2101'),student('2102')];
 const request={id:'request',survey_id:'2101',requester_id:'2101',requester_name:'학생2101',target_student_id:'2102',target_student_name:'학생2102',reason:'검토 사유',status:'pending'};
 const input={surveys,school:{classCount:6,studentsPerClass:16,roomCapacity:2},layout:null,manualAssignments:[],testEnabled:false,includeDefaults:false};
 for(const status of ['pending','rejected'])assert(buildDormitoryView({...input,avoidanceRequests:[{...request,status}]}).allocation.rooms.some(room=>room.students.length===2));
 const approved=buildDormitoryView({...input,avoidanceRequests:[{...request,status:'approved'}]});
 assert(approved.allocation.rooms.every(room=>room.students.length<2));
 assert.deepEqual(approved.roster.activeStudents[0].avoid_with,['2102']);
 assert(buildDormitoryView({...input,avoidanceRequests:[{...request,status:'approved',target_student_name:'동명이인 아님'}]}).allocation.rooms.some(room=>room.students.length===2));
});

test('same ID with different trimmed names is flagged, while identical names and virtual roster entries are not',()=>{
 const {conflictingStudentIds}=require('../.codex_tmp/matching-tests/student-roster.js');
 const rows=[student('2101',{student_name:'학생 A'}),student('2101',{student_name:'학생 B'}),student('2102',{student_name:'학생 C'}),student('2102',{student_name:' 학생 C '}),student('2102',{student_name:'테스트',is_test:true})];
 assert.deepEqual([...conflictingStudentIds(rows)],['2101']);
});

test('separation approval eligibility catches unmatched, ambiguous, out-of-roster and different-grade identities',()=>{
 const {separationEligibility,separationApplication}=require('../.codex_tmp/matching-tests/dormitory-view.js');
 const a=student('2101'),b=student('2102');const school={classCount:6,studentsPerClass:16,roomCapacity:2};
 const r={id:'r',survey_id:a.id,requester_id:a.student_id,requester_name:a.student_name,target_student_id:b.student_id,target_student_name:b.student_name,reason:'',status:'approved',active:true,reviewed_at:''};
 assert.equal(separationEligibility(r,[a,b],school),null);
 assert.match(separationEligibility(r,[a],school),/실제 설문/);
 assert.match(separationEligibility({...r,target_student_name:'오타'},[a,b],school),/일치/);
 assert.match(separationEligibility(r,[a,b,{...b,id:'duplicate',student_name:'다른 이름'}],school),/다른 이름/);
 const other=student('3101');assert.match(separationEligibility({...r,target_student_id:other.student_id,target_student_name:other.student_name},[a,other],school),/다른 학년/);
 assert.match(separationEligibility({...r,target_student_id:'2919'},[a,b],school),/범위/);
 const view=buildDormitoryView({surveys:[a,b],school,layout:null,manualAssignments:[],testEnabled:false,includeDefaults:false,avoidanceRequests:[r]});
 assert.equal(separationApplication(r,[a,b],school,view.allocation.rooms).state,'applied');
 assert.equal(separationApplication(r,[a,b],school,[]).state,'waiting');
 assert.equal(separationApplication({...r,active:false},[a,b],school,[]).state,'inactive');
 assert.equal(separationApplication(r,[a],school,[]).state,'warning');
 assert.equal(separationApplication(r,[a,b],school,[{id:'same',students:[a,b]}]).state,'warning');
});

test('explanations are the scoring source, including midnight, overlap and mismatched preferences', () => {
  const a = student('2101', {sleep_time:'23:50',environment_answers:{version:1,humidity:1,summer_ac:1,winter_heater:3}});
  const b = student('2102', {sleep_time:'00:10',tidiness:5,environment_answers:{version:1,humidity:3,summer_ac:3,winter_heater:1}});
  const reasons = compatibilityBreakdown(a,b);
  assert.equal(reasons.find(x=>x.key==='sleep_time').summary,'취침 시간 차이 20분');
  assert.equal(reasons.find(x=>x.key==='shower_duration_minutes').assessment,'difference');
  assert.equal(reasons.find(x=>x.key==='humidity').assessment,'difference');
  assert.equal(reasons.find(x=>x.key==='noise').assessment,'unknown');
  assert.equal(reasons.reduce((n,x)=>n+x.weight*x.value,0),roommateCompatibility(a,b));
  assert.equal(reasons.reduce((n,x)=>n+x.weight,0),14.5);
  assert.equal(roomCompatibilityScore([a,b]),Math.round(roommateCompatibility(a,b)/14.5*100)/10);
});

test('explanations distinguish indifference and auto-filled answers from positive compatibility evidence', () => {
  const a=student('2101',{flexible_preferences:['tidiness'],auto_filled_fields:['shower_duration_minutes','humidity'],environment_answers:{version:1,humidity:0,summer_ac:0,winter_heater:0}});
  const b=student('2102',{environment_answers:{version:1,humidity:2,summer_ac:3,winter_heater:3}});
  const reasons=compatibilityBreakdown(a,b);
  assert.equal(reasons.find(x=>x.key==='tidiness').assessment,'neutral');
  assert.equal(reasons.find(x=>x.key==='humidity').assessment,'unknown');
  assert.equal(reasons.find(x=>x.key==='summer_ac').assessment,'neutral');
  assert.equal(reasons.find(x=>x.key==='shower_duration_minutes').assessment,'unknown');
  assert(compatibilityBreakdown({...a,is_default:true},b).every(x=>x.assessment==='unknown'));
});

function finalFixture() {
  const input={surveys:[student('2101'),student('2102',{shower_time:'22:00'})],school:{classCount:1,studentsPerClass:4,roomCapacity:2},layout:null,manualAssignments:[],testEnabled:false,includeDefaults:false};
  const initial=buildDormitoryView(input);
  const finalAssignment={id:'fixed',confirmed_at:'2026-11-18T01:00:00Z',source_revision:1,layout:initial.effectiveLayout,school:input.school,rooms:structuredClone(initial.allocation.rooms)};
  return {input,initial,finalAssignment};
}

test('a final table freezes beds, answers, scores and layout through new surveys and changed options',()=>{
  const {input,initial,finalAssignment}=finalFixture();
  const changed={...input,surveys:[student('2101',{sleep_time:'04:00'}),student('2102'),student('2103')],manualAssignments:[{studentId:'2101',roomId:initial.allocation.rooms.find(x=>x.grade===2&&x.students.length===0).id,bedIndex:1}],testEnabled:true,finalAssignment};
  const final=buildDormitoryView(changed);
  assert.deepEqual(final.allocation.rooms,initial.allocation.rooms);
  assert.equal(final.assignedCount,2);
  assert.deepEqual(final.allocation.waiting.map(x=>x.student_id),['2103']);
  assert.equal(final.finalizedAt,finalAssignment.confirmed_at);
  const unlocked=buildDormitoryView({...changed,finalAssignment:null});
  assert.equal(unlocked.assignedCount,3);
  assert.equal(unlocked.finalizedAt,null);
});

test('student results require both exact identity fields and expose only scoped explanations',()=>{
  const {input,initial}=finalFixture();
  assert.equal(studentAssignmentResult(initial,'2101','틀린 이름'),null);
  assert.equal(studentAssignmentResult(initial,'2103','학생2101'),null);
  const result=studentAssignmentResult(initial,'2101','학생2101');
  assert(result.assigned);assert.equal(result.phase,'proposal');
  assert.equal(result.comparisons.length,1);
  const json=JSON.stringify(result);
  assert(!json.includes('학생2102'));assert(!json.includes('student_id'));assert(!json.includes('sleep_time":"'));assert(!json.includes('avoid_with'));
  assert.equal(result.roomScore,initial.allocation.rooms.find(x=>x.students.length).score);
  assert.equal(input.surveys.length,2);
});

test('final student results retain the saved score after resubmission and show new entrants waiting',()=>{
  const {input,initial,finalAssignment}=finalFixture();
  const view=buildDormitoryView({...input,surveys:[student('2101',{sleep_time:'04:00'}),student('2102'),student('2103')],finalAssignment});
  const result=studentAssignmentResult(view,'2101','학생2101');
  assert(result.assigned);assert.equal(result.phase,'final');
  assert.equal(result.roomScore,initial.allocation.rooms.find(x=>x.students.length).score);
  const waiting=studentAssignmentResult(view,'2103','학생2103');
  assert(!waiting.assigned);assert.equal(waiting.phase,'final');assert(waiting.message.includes('확정을 해제'));
});

test('multi-person rooms expose every roommate comparison with the average pair score',()=>{
  const input={surveys:[student('2101'),student('2102'),student('2103')],school:{classCount:1,studentsPerClass:3,roomCapacity:3},layout:null,manualAssignments:[],testEnabled:false,includeDefaults:false};
  const view=buildDormitoryView(input);
  const result=studentAssignmentResult(view,'2101','학생2101');
  assert(result.assigned);assert.equal(result.comparisons.length,2);
  assert(result.comparisons.every(c=>c.score>=0&&c.score<=10));
});

test('a response arriving for an already reserved default seat retains that seat, and ambiguous identities are blocked',()=>{
  const input={surveys:[student('2101')],school:{classCount:1,studentsPerClass:2,roomCapacity:2},layout:null,manualAssignments:[],testEnabled:false,includeDefaults:true};
  const initial=buildDormitoryView(input);
  const finalAssignment={id:'default-final',confirmed_at:'2026-11-18T01:00:00Z',source_revision:1,layout:initial.effectiveLayout,school:input.school,rooms:structuredClone(initial.allocation.rooms)};
  const view=buildDormitoryView({...input,surveys:[student('2101'),student('2102')],finalAssignment});
  assert(studentAssignmentResult(view,'2102','학생2102').assigned);
  assert(!view.allocation.waiting.some(s=>s.student_id==='2102'));
  const ambiguous=buildDormitoryView({...input,surveys:[student('2101'),student('2102'),student('2102',{id:'other',student_name:'다른 이름'})],finalAssignment});
  const result=studentAssignmentResult(ambiguous,'2102','학생2102');
  assert(!result.assigned);assert(result.message.includes('서로 다른 이름'));
});

function genderLayout(capacity=2) {
  return [{id:'g',name:'성별 검증동',diningSide:'none',provisional:true,genderPolicy:'separate',floors:[
    {...newFloor(2,2,capacity),leftRooms:2,rightRooms:2,leftGender:'male',rightGender:'female'},
    {...newFloor(1,1,capacity),leftRooms:1,rightRooms:1,leftGender:'male',rightGender:'female'},
    {...newFloor(3,3,capacity),leftRooms:1,rightRooms:1,leftGender:'male',rightGender:'female'},
  ]}];
}
const female=id=>student(id,{gender:'female',reported_gender:'female'});
const unknown=id=>student(id,{gender:'unknown',gender_verified:false,reported_gender:'unknown'});
const profile=(id,gender,name='학생'+id)=>({student_id:id,student_name:name,gender,verified:gender!=='unknown',checked_reported_gender:gender});
const genderInput=(surveys,genderProfiles=[],extra={})=>({surveys,genderProfiles,school:{classCount:1,studentsPerClass:8,roomCapacity:2},layout:genderLayout(),manualAssignments:[],includeDefaults:false,testEnabled:false,...extra});

test('strict auto allocation enforces grade, verified gender, capacity and approved exclusions together',()=>{
  const people=[student('1101'),female('1102'),student('2101',{avoid_with:['2102']}),student('2102'),female('2103'),female('2104'),student('3101'),female('3102'),unknown('2105')];
  const result=strictAllocate(people,genderLayout());
  assert.deepEqual(result.waiting.map(s=>s.student_id),['2105']);
  assert.equal(result.rooms.flatMap(r=>r.students).length,8);
  for(const r of result.rooms) {
    assert(r.students.every(s=>s.grade===r.grade&&s.gender===r.gender&&s.gender_verified));
    assert(r.students.length<=r.capacity);
    assert(!(r.students.some(s=>s.student_id==='2101')&&r.students.some(s=>s.student_id==='2102')));
  }
});

test('unknown actual, default and reported-only gender students wait even with spare beds',()=>{
  const people=[unknown('2101'),student('2102',{gender_verified:false}),...rawDefaultRoster(1,1)];
  const result=strictAllocate(people,genderLayout());
  assert.equal(result.rooms.flatMap(r=>r.students).length,0);assert.equal(result.waiting.length,5);
  const view=strictView(genderInput([student('2101')]));
  assert.equal(view.assignedCount,0);assert.equal(view.genderWaitingCount,1);
  assert.equal(waitingReason(view.allocation.waiting[0],view),'성별 확인 대기');
  assert.equal(studentAssignmentResult(view,'2101','학생2101').assigned,false);
});

test('a roster profile must match identity and unreviewed conflicting reports suspend allocation',()=>{
  const original=student('2101');const p=profile('2101','male');
  assert.equal(applyGenderProfiles([original],[p],new Set())[0].gender,'male');
  assert.equal(applyGenderProfiles([original],[{...p,student_name:'다른 사람'}],new Set())[0].gender,'unknown');
  assert.equal(applyGenderProfiles([original],[p],new Set(['2101']))[0].gender,'unknown');
  const changed={...original,reported_gender:'female'};
  assert.equal(applyGenderProfiles([changed],[p],new Set())[0].gender,'unknown');
  assert.equal(applyGenderProfiles([changed],[{...p,checked_reported_gender:'female'}],new Set())[0].gender,'male');
  assert.equal(applyGenderProfiles([{...original,reported_gender:'unknown'}],[p],new Set())[0].gender,'male');
});

test('real unknown responses beat known virtual copies; only verified unsurveyed roster entries use default habits',()=>{
  const actual=unknown('2101');const fake=student('2101',{is_test:true,id:'fake',reported_gender:'female'});
  const view=strictView(genderInput([actual,fake],[],{testEnabled:true}));
  assert.equal(view.roster.activeStudents[0].id,actual.id);assert.equal(view.assignedCount,0);
  const defaults=strictView(genderInput([], [profile('2102','female','명단확인학생')],{includeDefaults:true}));
  assert.equal(defaults.assignedCount,1);assert.equal(defaults.genderWaitingCount,23);
  const member=defaults.allocation.rooms.flatMap(r=>r.students)[0];
  assert.equal(member.student_name,'명단확인학생');assert(member.is_default);assert.equal(member.sleep_time,'00:30:00');
});

test('manual move rejects opposite-gender empty beds and swaps, accepts compatible moves and preserves exclusions',()=>{
  const people=[student('2101'),student('2102'),female('2103'),female('2104')];
  const base=strictAllocate(people,genderLayout());
  const wrong=base.rooms.find(r=>r.grade===2&&r.gender==='female'&&r.students.length===0);
  assert.throws(()=>planManualMove(base.rooms,[],'2101',{roomId:wrong.id,bedIndex:0}),/성별/);
  const occupied=base.rooms.find(r=>r.students.some(s=>s.student_id==='2103'));
  assert.throws(()=>planManualMove(base.rooms,[],'2101',{roomId:occupied.id,bedIndex:0}),/성별/);
  const free=base.rooms.find(r=>r.grade===2&&r.gender==='male'&&!r.students.length);
  const pins=planManualMove(base.rooms,[],'2101',{roomId:free.id,bedIndex:1});
  assert.deepEqual(location(strictAllocate(people,genderLayout(),pins),'2101'),{roomId:free.id,bedIndex:1});
  const tampered=structuredClone(base.rooms);const destination=tampered.find(r=>r.id===free.id);
  destination.beds[0]=female('2105');destination.students=[destination.beds[0]];
  assert.throws(()=>planManualMove(tampered,[],'2101',{roomId:free.id,bedIndex:0}),/교환 상대/);
});

test('stale or malicious manual pins cannot put an unknown or opposite gender in a room',()=>{
  const base=strictAllocate([],genderLayout());const male=base.rooms.find(r=>r.grade===2&&r.gender==='male');
  const result=strictAllocate([student('2101'),female('2102'),unknown('2103')],genderLayout(),[
    {studentId:'2102',roomId:male.id,bedIndex:1},{studentId:'2103',roomId:male.id,bedIndex:0}]);
  assert.equal(result.invalidManual.length,1);assert.equal(result.inactiveManual.length,1);
  assert(result.rooms.every(r=>r.students.every(s=>s.gender===r.gender)));assert.equal(result.waiting.length,1);
});

test('gender capacity reports shortages independently of total spare spaces and excludes unconfigured rooms',()=>{
  const people=['2101','2102','2103'].map(id=>student(id));
  const layout=genderLayout(1);const view=strictView(genderInput(people,people.map(s=>profile(s.student_id,'male')),{layout}));
  const group=view.genderCapacity.find(g=>g.grade===2&&g.gender==='male');
  assert.equal(group.shortage,1);assert.equal(group.waiting,1);assert(view.totalBeds>view.assignedCount);
  assert.match(waitingReason(view.allocation.waiting[0],view),/자리 부족/);
  const unset=strictView(genderInput(people,people.map(s=>profile(s.student_id,'male')),{layout:rawDefaultLayout(8,2)}));
  assert.equal(unset.assignedCount,0);assert.equal(unset.unconfiguredBeds,unset.totalBeds);
  assert.match(waitingReason(unset.allocation.waiting[0],unset),/호실 성별/);
});

test('building/floor/room gender inheritance survives grid conversion and movement; conflicting policies are invalid',()=>{
  const layout=genderLayout();assert.equal(validateLayout(layout),null);
  const before=strictAllocate([student('2101'),female('2102')],layout);
  const converted=structuredClone(layout);converted[0].floors[0].grid=gridFromLegacyFloor(converted[0].floors[0]);
  assert.deepEqual(strictAllocate([student('2101'),female('2102')],converted).rooms,before.rooms);
  const bad=structuredClone(layout);bad[0].genderPolicy='male';assert.match(validateLayout(bad),/성별/);
  const inherited=structuredClone(layout);inherited[0].genderPolicy='female';inherited[0].floors.forEach(f=>{f.leftGender='inherit';f.rightGender='inherit';});
  assert(strictAllocate([],inherited).rooms.every(r=>r.gender==='female'));
  const room=converted[0].floors[0].grid.spaces.find(s=>s.kind==='room'&&s.genderPolicy==='male');
  const moved=moveGridSpace(converted[0].floors[0].grid,room.id,2,1);
  assert.equal(moved.spaces.find(s=>s.id===room.id).genderPolicy,'male');
});

test('verified final snapshots keep beds after ordinary edits, wait new unknown students and retain legacy originals',()=>{
  const profiles=[profile('2101','male'),profile('2102','male')];
  const input=genderInput([student('2101'),student('2102')],profiles);const initial=strictView(input);
  const final={id:'g-final',confirmed_at:'2026-11-18T01:00:00Z',source_revision:2,gender_policy_version:1,school:input.school,layout:input.layout,rooms:structuredClone(initial.allocation.rooms)};
  const frozen=strictView({...input,surveys:[student('2101',{sleep_time:'04:00'}),student('2102'),unknown('2103')],finalAssignment:final});
  assert.deepEqual(frozen.allocation.rooms,initial.allocation.rooms);assert.equal(frozen.genderReviewRequired,false);assert.equal(frozen.genderWaitingCount,1);
  const conflicting=strictView({...input,surveys:[student('2101',{reported_gender:'female'}),student('2102')],finalAssignment:final});
  assert.equal(conflicting.genderReviewRequired,true);assert.equal(conflicting.assignedCount,1);
  const archived=structuredClone(final);delete archived.gender_policy_version;archived.rooms.forEach(r=>r.students.forEach(s=>{delete s.gender;delete s.gender_verified;}));
  const original=JSON.stringify(archived);const legacy=strictView({...input,finalAssignment:archived});
  assert.equal(legacy.assignedCount,0);assert(legacy.genderReviewRequired);assert.equal(JSON.stringify(archived),original);
});

test('admin counts split each grade by verified gender and keep unknown students out of available seats',()=>{
  const people=[student('1101'),female('1102'),student('2101'),female('2102'),unknown('2103'),student('3101')];
  const profiles=people.filter(s=>s.gender!=='unknown').map(s=>profile(s.student_id,s.gender));
  const view=strictView(genderInput(people,profiles));const summary=summarizeDormitory(view);
  assert.equal(summary.rows.length,9);assert.equal(summary.totalStudents,6);assert.equal(summary.totalAssigned,5);
  assert.equal(summary.totalWaiting,1);assert.equal(summary.rows.reduce((n,row)=>n+row.students,0),6);
  assert.deepEqual(summary.rows.find(row=>row.grade===2&&row.gender==='unknown'),{grade:2,gender:'unknown',students:1,capacity:null,assigned:0,waiting:1});
  assert.equal(summary.reasons.find(reason=>reason.category==='gender').count,1);
  assert.equal(summarizeDormitory(strictView(genderInput([]))).totalStudents,0);
});

test('waiting reasons account for excluded receipts and ambiguous IDs exactly once',()=>{
  const people=[student('2101'),student('2101',{id:'different',student_name:'동일 학번 다른 이름'}),student('2201'),unknown('2102')];
  const view=strictView(genderInput(people,[profile('2101','male')]));const summary=summarizeDormitory(view);
  assert.equal(summary.totalStudents,2);assert.equal(summary.reviewCount,2);assert.equal(summary.totalWaiting,4);
  assert.equal(summary.reasons.reduce((n,reason)=>n+reason.count,0),4);
  assert.equal(summary.reasons.find(reason=>reason.category==='identity').count,2);
  assert.equal(summary.reasons.find(reason=>reason.category==='roster').count,1);
  assert.equal(summary.reasons.find(reason=>reason.category==='gender').count,1);
  assert.equal(new Set(summary.waiters.map(item=>item.student.id)).size,4);
});

test('admin waiting groups distinguish shortage, blocked vacancies, room setup and frozen final entrants',()=>{
  const people=['2101','2102','2103'].map(id=>student(id));const profiles=people.map(s=>profile(s.student_id,'male'));
  const small=genderLayout(1);const shortage=strictView(genderInput(people,profiles,{layout:small}));
  assert.equal(summarizeDormitory(shortage).reasons.find(reason=>reason.category==='capacity').count,1);
  const unconfigured=strictView(genderInput(people,profiles,{layout:rawDefaultLayout(8,2)}));
  assert.equal(summarizeDormitory(unconfigured).reasons.find(reason=>reason.category==='room').count,3);
  const a=student('2101'),b=student('2102');const request={id:'r',survey_id:a.id,requester_id:a.student_id,requester_name:a.student_name,target_student_id:b.student_id,target_student_name:b.student_name,reason:'',status:'approved'};
  const one=genderLayout();one[0].floors[0].leftRooms=1;
  const blocked=strictView(genderInput([a,b],profiles,{layout:one,avoidanceRequests:[request]}));
  assert.equal(summarizeDormitory(blocked).reasons.find(reason=>reason.category==='conditions').count,1);
  const input=genderInput([a,b],profiles);const initial=strictView(input);
  const finalAssignment={id:'summary-final',confirmed_at:'2026-11-18T01:00:00Z',source_revision:1,gender_policy_version:1,school:input.school,layout:input.layout,rooms:structuredClone(initial.allocation.rooms)};
  const frozen=strictView({...input,surveys:[a,b,people[2],unknown('2104')],finalAssignment});
  const summary=summarizeDormitory(frozen);
  assert.equal(summary.reasons.find(reason=>reason.category==='final').count,1);
  assert.equal(summary.reasons.find(reason=>reason.category==='gender').count,1);
  assert.equal(summary.totalWaiting,2);
});
