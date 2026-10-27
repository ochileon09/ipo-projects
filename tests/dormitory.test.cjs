const { test } = require('node:test');
const assert = require('node:assert/strict');
const { roomCompatibilityScore, optimizeRoomAssignments } = require('../.codex_tmp/matching-tests/roommate-matching.js');
const { createDefaultLayout, allocateDormitory, newFloor, validateLayout } = require('../.codex_tmp/matching-tests/dormitory-layout.js');
const { selectRoster, createDefaultRoster } = require('../.codex_tmp/matching-tests/student-roster.js');

function student(studentId, overrides = {}) {
  return { ...createDefaultRoster(6, 16).find(row => row.student_id === studentId), id: studentId, is_default: false, student_name: '학생' + studentId, created_at: '2026-10-01T00:00:00Z', ...overrides };
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
