import { assignmentPriority, optimizeRoomAssignments, roomCompatibilityScore, type MatchingStudent } from "./roommate-matching";
import { validateFloorGrid, type FloorGrid, type GridSpace } from "./floor-grid";

export type Grade = 1 | 2 | 3;
export type FloorLayout = {
  id: string; floor: number;
  leftGrade: Grade; rightGrade: Grade;
  leftRooms: number; rightRooms: number;
  leftCapacity: number; rightCapacity: number;
  leftStairs: boolean; centerStairs: boolean; rightStairs: boolean;
  leftWasher: boolean; rightWasher: boolean; leftDryer: boolean; rightDryer: boolean;
  grid?: FloorGrid;
};
export type BuildingLayout = { id: string; name: string; diningSide: "left" | "right" | "none"; provisional: boolean; floors: FloorLayout[] };
export type DormLayout = BuildingLayout[];
export type AssignedRoom<T> = { id: string; number: string; grade: Grade; capacity: number; students: T[]; score: number | null };

export function floorRooms(floor: FloorLayout) {
  if (floor.grid) return floor.grid.spaces.filter(space => space.kind === "room").map(space => ({ id:space.id, number:space.number!,grade:space.grade!,capacity:space.capacity! })).sort((a,b)=>a.number.localeCompare(b.number,"ko",{numeric:true})||a.id.localeCompare(b.id));
  return (["left", "right"] as const).flatMap(wing => Array.from({ length:floor[`${wing}Rooms`] }, (_, index) => ({ id:`${wing}/${index}`,number:`${floor.floor}${String(index + 1 + (wing === "right" ? floor.leftRooms : 0)).padStart(2,"0")}`,grade:floor[`${wing}Grade`],capacity:floor[`${wing}Capacity`] })));
}

export function gridFromLegacyFloor(floor: FloorLayout): FloorGrid {
  if (floor.grid) return floor.grid;
  const rows = Math.max(4, Math.ceil(Math.max(floor.leftRooms,floor.rightRooms) / 4) + 1); const cols = 11;
  const spaces: GridSpace[] = [];
  for (let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
    let space: GridSpace = { id:`cell-${row}-${col}`,kind:row===0||col===5?"corridor":"outside",row,col,rowSpan:1,colSpan:1 };
    if (row>0 && ((col>=1&&col<=4)||(col>=6&&col<=9))) {
      const wing=col<5?"left":"right"; const index=(row-1)*4+(col<5?col-1:col-6);
      const room=floorRooms(floor).find(room=>room.id===`${wing}/${index}`);
      if(room) space={...space,...room,kind:"room"};
    }
    if(row===0 && ((col===0&&floor.leftStairs)||(col===5&&floor.centerStairs)||(col===10&&floor.rightStairs))) space.kind="stairs";
    if(row===1 && ((col===0&&floor.leftWasher)||(col===10&&floor.rightWasher))) space.kind="laundry";
    if(row===2 && ((col===0&&floor.leftDryer)||(col===10&&floor.rightDryer))) space.kind="dryer";
    spaces.push(space);
  }
  return { rows,cols,spaces };
}

export function newFloor(floor: number, grade: Grade = 1, capacity = 2): FloorLayout {
  return { id: `floor-${floor}`, floor, leftGrade: grade, rightGrade: grade, leftRooms: 8, rightRooms: 8, leftCapacity: capacity, rightCapacity: capacity, leftStairs: true, centerStairs: true, rightStairs: true, leftWasher: true, rightWasher: true, leftDryer: floor % 2 === 0, rightDryer: floor % 2 === 0 };
}

function distribute(total: number, zones: number) {
  return Array.from({ length: zones }, (_, index) => Math.floor(total / zones) + (index < total % zones ? 1 : 0));
}

export function createDefaultLayout(studentsPerGrade: number, capacity: number): DormLayout {
  const count = Math.ceil(studentsPerGrade / Math.max(1, capacity));
  const a = distribute(count, 3); const b = distribute(count, 6);
  return [
    { id: "a", name: "A동", diningSide: "left", provisional: false, floors: [
      { ...newFloor(4, 2, capacity), leftRooms: a[1], rightRooms: a[2] },
      { ...newFloor(3, 3, capacity), rightGrade: 2, leftRooms: a[2], rightRooms: a[0] },
      { ...newFloor(2, 3, capacity), leftRooms: a[0], rightRooms: a[1] },
    ] },
    { id: "b", name: "B동", diningSide: "none", provisional: true, floors: [
      { ...newFloor(4, 1, capacity), leftRooms: b[4], rightRooms: b[5] },
      { ...newFloor(3, 1, capacity), leftRooms: b[2], rightRooms: b[3] },
      { ...newFloor(2, 1, capacity), leftRooms: b[0], rightRooms: b[1] },
    ] },
  ];
}

export function validateLayout(layout: DormLayout): string | null {
  if (!Array.isArray(layout) || !layout.length || layout.length > 8) return "건물은 1~8개로 구성해 주세요.";
  const buildingIds = new Set<string>(); let rooms = 0;
  for (const building of layout) {
    if (!building.name.trim() || building.name.length > 30 || buildingIds.has(building.id)) return "건물 이름과 식별자를 확인해 주세요.";
    buildingIds.add(building.id);
    if (!building.floors.length || building.floors.length > 12) return "건물마다 1~12개 층을 지정해 주세요.";
    const floors = new Set<number>(); const ids = new Set<string>(); const numbers = new Set<string>();
    for (const floor of building.floors) {
      if (!Number.isInteger(floor.floor) || floor.floor < 1 || floor.floor > 12 || floors.has(floor.floor) || ids.has(floor.id)) return "층 번호는 1~12이며 같은 건물에서 중복될 수 없습니다.";
      floors.add(floor.floor); ids.add(floor.id);
      if (floor.grid) {
        const issue = validateFloorGrid(floor.grid); if (issue) return issue;
      } else for (const wing of ["left", "right"] as const) {
        const count = floor[`${wing}Rooms`]; const capacity = floor[`${wing}Capacity`]; const grade = floor[`${wing}Grade`];
        if (!Number.isInteger(count) || count < 0 || count > 49) return "구역당 방 수는 0~49개로 지정해 주세요.";
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 6) return "인실은 1~6명으로 지정해 주세요.";
        if (![1, 2, 3].includes(grade)) return "구역의 학년을 지정해 주세요.";
      }
      for (const room of floorRooms(floor)) {
        if (numbers.has(room.number)) return `${building.name}의 ${room.number}호가 중복됩니다.`;
        numbers.add(room.number); rooms++;
      }
    }
  }
  return rooms > 1000 ? "전체 방 수는 1,000개 이하여야 합니다." : null;
}

export function allocateDormitory<T extends MatchingStudent>(students: T[], layout: DormLayout) {
  const slots: AssignedRoom<T>[] = [];
  for (const building of layout) for (const floor of [...building.floors].sort((a, b) => a.floor - b.floor)) {
    for (const room of floorRooms(floor)) {
      slots.push({ ...room, id:`${building.id}/${floor.id}/${room.id}`, students: [], score: null });
    }
  }
  const waiting: T[] = [];
  for (const grade of [1, 2, 3]) {
    const gradeSlots = slots.filter(room => room.grade === grade);
    const result = optimizeRoomAssignments(students.filter(student => student.grade === grade), gradeSlots.map(room => room.capacity));
    gradeSlots.forEach((slot, index) => { slot.students = result.rooms[index]; slot.score = roomCompatibilityScore(slot.students); });
    waiting.push(...result.waiting);
  }
  return { rooms: slots, waiting: waiting.sort((a, b) => assignmentPriority(a) - assignmentPriority(b) || a.student_id.localeCompare(b.student_id)) };
}
