export type SpaceKind = "room" | "corridor" | "stairs" | "laundry" | "dryer" | "lounge" | "outside";
export type GridSpace = {
  id: string; kind: SpaceKind; row: number; col: number; rowSpan: number; colSpan: number;
  number?: string; grade?: 1 | 2 | 3; capacity?: number;
};
export type FloorGrid = { rows: number; cols: number; spaces: GridSpace[] };
export type GridSelection = { top: number; left: number; bottom: number; right: number };
export const spaceNames: Record<SpaceKind, string> = { room: "호실", corridor: "복도", stairs: "계단", laundry: "세탁실", dryer: "건조실", lounge: "휴게실", outside: "건물 밖" };
export const spaceSymbols: Record<SpaceKind, string> = { room: "▣", corridor: "↔", stairs: "↗", laundry: "◎", dryer: "◉", lounge: "☕", outside: "·" };
const freshId = () => "space-" + crypto.randomUUID();
const bounds = (space: GridSpace): GridSelection => ({ top: space.row, left: space.col, bottom: space.row + space.rowSpan - 1, right: space.col + space.colSpan - 1 });
export const intersects = (a: GridSelection, b: GridSelection) => a.top <= b.bottom && a.bottom >= b.top && a.left <= b.right && a.right >= b.left;
export function selectedSpaces(grid: FloorGrid, selection: GridSelection | null) {
  return selection ? grid.spaces.filter(space => intersects(bounds(space), selection)) : [];
}
export function expandSelection(grid: FloorGrid, start: { row: number; col: number }, end = start): GridSelection {
  const area = { top: Math.min(start.row, end.row), left: Math.min(start.col, end.col), bottom: Math.max(start.row, end.row), right: Math.max(start.col, end.col) };
  let changed = true;
  while (changed) {
    changed = false;
    for (const space of grid.spaces) if (intersects(area, bounds(space))) {
      const next = { top: Math.min(area.top, space.row), left: Math.min(area.left, space.col), bottom: Math.max(area.bottom, space.row + space.rowSpan - 1), right: Math.max(area.right, space.col + space.colSpan - 1) };
      if (JSON.stringify(next) !== JSON.stringify(area)) { Object.assign(area, next); changed = true; }
    }
  }
  return area;
}
function roomNumber(used: Set<string>, floor: number) {
  const format = (n: number) => n < 100 ? String(floor) + String(n).padStart(2, "0") : `${floor}-${n}`;
  let n = 1;
  while (used.has(format(n))) n++;
  const number = format(n); used.add(number); return number;
}
function converted(space: GridSpace, kind: SpaceKind, floor: number, grade: 1 | 2 | 3, capacity: number, used: Set<string>): GridSpace {
  const base = { id: space.id, kind, row: space.row, col: space.col, rowSpan: space.rowSpan, colSpan: space.colSpan };
  return kind === "room" ? { ...base, number: space.kind === "room" ? space.number : roomNumber(used, floor), grade, capacity } : base;
}
export function createFloorGrid(rows: number, cols: number, floor: number, grade: 1 | 2 | 3, capacity: number, fillRooms = true): FloorGrid {
  const spaces: GridSpace[] = []; const used = new Set<string>();
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) spaces.push(converted({ id: freshId(), kind: "outside", row, col, rowSpan: 1, colSpan: 1 }, fillRooms ? "room" : "outside", floor, grade, capacity, used));
  return { rows, cols, spaces };
}
export function paintGrid(grid: FloorGrid, area: GridSelection, kind: SpaceKind, floor: number, grade: 1 | 2 | 3, capacity: number): FloorGrid {
  const used = new Set(grid.spaces.filter(s => s.kind === "room").map(s => s.number!));
  return { ...grid, spaces: grid.spaces.map(space => intersects(area, bounds(space)) ? converted(space, kind, floor, grade, capacity, used) : space) };
}
export function mergeGrid(grid: FloorGrid, area: GridSelection, kind: SpaceKind, floor: number, grade: 1 | 2 | 3, capacity: number): FloorGrid {
  const selected = selectedSpaces(grid, area).sort((a, b) => a.row - b.row || a.col - b.col);
  if (!selected.length) return grid;
  const keeper = selected.find(space => space.kind === kind) ?? selected[0];
  const used = new Set(grid.spaces.filter(s => s.kind === "room").map(s => s.number!));
  return { ...grid, spaces: [...grid.spaces.filter(space => !intersects(area, bounds(space))), converted({ ...keeper, row: area.top, col: area.left, rowSpan: area.bottom - area.top + 1, colSpan: area.right - area.left + 1 }, kind, floor, grade, capacity, used)] };
}
export function splitGrid(grid: FloorGrid, area: GridSelection, floor: number): FloorGrid {
  const used = new Set(grid.spaces.filter(s => s.kind === "room").map(s => s.number!));
  return { ...grid, spaces: grid.spaces.flatMap(space => {
    if (!intersects(area, bounds(space)) || space.rowSpan * space.colSpan === 1) return [space];
    const cells: GridSpace[] = [];
    for (let row = space.row; row < space.row + space.rowSpan; row++) for (let col = space.col; col < space.col + space.colSpan; col++) {
      const first = row === space.row && col === space.col;
      cells.push({ ...space, id: first ? space.id : freshId(), row, col, rowSpan: 1, colSpan: 1, ...(space.kind === "room" ? { number: first ? space.number : roomNumber(used, floor) } : {}) });
    }
    return cells;
  }) };
}
export function moveGridSpace(grid: FloorGrid, id: string, row: number, col: number): FloorGrid {
  const moving = grid.spaces.find(space => space.id === id);
  if (!moving) throw new Error("이동할 공간을 먼저 선택해 주세요.");
  const target = { ...moving, row, col };
  if (row < 0 || col < 0 || row + moving.rowSpan > grid.rows || col + moving.colSpan > grid.cols) throw new Error("공간이 격자 밖으로 나갑니다.");
  if (grid.spaces.some(space => space.id !== id && space.kind !== "outside" && intersects(bounds(space), bounds(target)))) throw new Error("다른 공간과 겹칩니다. 건물 밖으로 비운 위치에 놓아 주세요.");
  const spaces = grid.spaces.filter(space => space.id !== id && space.kind !== "outside");
  spaces.push(target);
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) if (!spaces.some(space => intersects(bounds(space), { top:r,bottom:r,left:c,right:c }))) spaces.push({ id: freshId(), kind:"outside",row:r,col:c,rowSpan:1,colSpan:1 });
  return { ...grid, spaces };
}
export function validateFloorGrid(grid: FloorGrid): string | null {
  if (!grid || !Number.isInteger(grid.rows) || !Number.isInteger(grid.cols) || grid.rows < 1 || grid.cols < 1 || grid.rows > 24 || grid.cols > 24 || !Array.isArray(grid.spaces)) return "격자는 가로·세로 각각 1~24칸으로 만들어 주세요.";
  const occupied = new Set<string>(); const ids = new Set<string>();
  for (const space of grid.spaces) {
    if (!space || typeof space.id !== "string" || !space.id || space.id.length > 100 || ids.has(space.id) || !Object.hasOwn(spaceNames, space.kind)) return "공간의 종류와 식별자를 확인해 주세요.";
    ids.add(space.id);
    if (![space.row,space.col,space.rowSpan,space.colSpan].every(Number.isInteger) || space.row < 0 || space.col < 0 || space.rowSpan < 1 || space.colSpan < 1 || space.row + space.rowSpan > grid.rows || space.col + space.colSpan > grid.cols) return "격자를 벗어나는 공간이 있습니다.";
    if (space.kind === "room" && (typeof space.number !== "string" || !space.number.trim() || space.number !== space.number.trim() || space.number.length > 12 || ![1,2,3].includes(space.grade!) || !Number.isInteger(space.capacity) || space.capacity! < 1 || space.capacity! > 6)) return "호실 번호(1~12자), 학년(1~3), 인실(1~6)을 확인해 주세요.";
    for (let row = space.row; row < space.row + space.rowSpan; row++) for (let col = space.col; col < space.col + space.colSpan; col++) {
      const key = `${row}/${col}`; if (occupied.has(key)) return "공간이 서로 겹칩니다."; occupied.add(key);
    }
  }
  return occupied.size === grid.rows * grid.cols ? null : "비어 있는 칸은 ‘건물 밖’으로 지정해 주세요.";
}
