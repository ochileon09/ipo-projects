export type MatchingStudent = {
  is_test?: boolean;
  is_default?: boolean;
  student_id: string;
  grade: number;
  wake_time: string;
  sleep_time: string;
  shower_time: string;
  shower_frequency: number;
  tidiness: number;
  noise_sensitivity: number;
  preferred_temperature: number;
  light_sensitivity: number;
  ventilation_preference: number;
  alarm_sensitivity: number;
  room_activity: number;
};

function timeToMinutes(value: string) {
  const [hours = 0, minutes = 0] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function circularTimeDifference(first: string, second: string) {
  const difference = Math.abs(timeToMinutes(first) - timeToMinutes(second));
  return Math.min(difference, 1440 - difference);
}

function similarity(first: number, second: number, range: number) {
  return Math.max(0, 1 - Math.abs(first - second) / range);
}

export function roommateCompatibility(first: MatchingStudent, second: MatchingStudent) {
  const wakeSimilarity = similarity(circularTimeDifference(first.wake_time, second.wake_time), 0, 180);
  const sleepSimilarity = similarity(circularTimeDifference(first.sleep_time, second.sleep_time), 0, 240);
  const showerGap = circularTimeDifference(first.shower_time, second.shower_time);
  const showerSeparation = Math.min(1, showerGap / 240);
  const showerConflictPenalty = showerGap < 45 ? 3.5 * (1 - showerGap / 45) : 0;

  return (
    wakeSimilarity * 1.2 +
    sleepSimilarity * 1.4 +
    similarity(first.tidiness, second.tidiness, 4) * 1.1 +
    similarity(first.noise_sensitivity, second.noise_sensitivity, 4) * 1.4 +
    similarity(first.preferred_temperature, second.preferred_temperature, 8) * 0.8 +
    similarity(first.light_sensitivity, second.light_sensitivity, 4) * 1.0 +
    similarity(first.ventilation_preference, second.ventilation_preference, 4) * 0.8 +
    similarity(first.alarm_sensitivity, second.alarm_sensitivity, 4) * 1.0 +
    similarity(first.room_activity, second.room_activity, 4) * 0.8 +
    similarity(first.shower_frequency, second.shower_frequency, 2) * 0.3 +
    (first.grade === second.grade ? 0.25 : 0) +
    showerSeparation * 3.8 -
    showerConflictPenalty
  );
}

export function matchRoommates<T extends MatchingStudent>(students: T[], roomCapacity: number) {
  const waiting = [...students].sort((a, b) => a.student_id.localeCompare(b.student_id, "ko"));
  const rooms: T[][] = [];

  while (waiting.length > 0) {
    const room = [waiting.shift()!];
    while (room.length < roomCapacity && waiting.length > 0) {
      let bestIndex = 0;
      let bestScore = Number.NEGATIVE_INFINITY;

      waiting.forEach((candidate, index) => {
        const averageScore = room.reduce(
          (total, member) => total + roommateCompatibility(member, candidate),
          0,
        ) / room.length;
        if (averageScore > bestScore) {
          bestScore = averageScore;
          bestIndex = index;
        }
      });

      room.push(waiting.splice(bestIndex, 1)[0]);
    }
    rooms.push(room);
  }

  return rooms;
}

export function roomCompatibilityScore<T extends MatchingStudent>(students: T[]) {
  if (students.length < 2) return null;
  let total = 0;
  let pairs = 0;
  students.forEach((student, index) => {
    students.slice(index + 1).forEach((roommate) => {
      total += roommateCompatibility(student, roommate);
      pairs += 1;
    });
  });
  // Maximum same-grade weighted score: 13.85. The shared minimum is -3.5.
  // Map the complete theoretical range to 0–10, rather than presenting a raw sum.
  return Math.round(Math.max(0, Math.min(10, ((total / pairs + 3.5) / 17.35) * 10)) * 10) / 10;
}

export function assignmentPriority(student: MatchingStudent) {
  return student.is_default ? 2 : student.is_test ? 1 : 0;
}

/** Recompute the proposal from scratch; capacity is physical, not inferred from responses. */
export function optimizeRoomAssignments<T extends MatchingStudent>(students: T[], capacities: number[]) {
  const seatCount = capacities.reduce((sum, value) => sum + value, 0);
  const ordered = [...students].sort((a, b) => assignmentPriority(a) - assignmentPriority(b) || a.student_id.localeCompare(b.student_id));
  const remaining = ordered.slice(0, seatCount);
  const waiting = ordered.slice(seatCount);
  const scoreCache = new Map<string, number>();
  function score(a: T, b: T) {
    const key = [a.student_id, b.student_id].sort().join(":");
    if (!scoreCache.has(key)) scoreCache.set(key, roommateCompatibility(a, b));
    return scoreCache.get(key)!;
  }
  const rooms = capacities.map((capacity) => {
    const room: T[] = [];
    if (remaining.length && capacity > 0) room.push(remaining.shift()!);
    while (room.length < capacity && remaining.length) {
      let bestIndex = 0;
      let bestScore = -Infinity;
      remaining.forEach((candidate, index) => {
        const value = room.reduce((total, member) => total + score(member, candidate), 0) / room.length;
        if (value > bestScore) { bestScore = value; bestIndex = index; }
      });
      room.push(remaining.splice(bestIndex, 1)[0]);
    }
    return room;
  });
  // Improve the greedy proposal using bounded pairwise swaps. Stable ties avoid churn.
  for (let pass = 0; pass < 3; pass += 1) {
    let improved = false;
    for (let first = 0; first < rooms.length; first += 1) {
      for (let second = first + 1; second < rooms.length; second += 1) {
        const a = rooms[first]; const b = rooms[second];
        const aPairs = Math.max(1, a.length * (a.length - 1) / 2);
        const bPairs = Math.max(1, b.length * (b.length - 1) / 2);
        let bestGain = 0.0001; let best: [number, number] | null = null;
        for (let ai = 0; ai < a.length; ai += 1) for (let bi = 0; bi < b.length; bi += 1) {
          const left = a[ai]; const right = b[bi];
          const gainA = a.reduce((sum, other, index) => sum + (index === ai ? 0 : score(right, other) - score(left, other)), 0) / aPairs;
          const gainB = b.reduce((sum, other, index) => sum + (index === bi ? 0 : score(left, other) - score(right, other)), 0) / bPairs;
          if (gainA + gainB > bestGain) { bestGain = gainA + gainB; best = [ai, bi]; }
        }
        if (best) {
          const [ai, bi] = best;
          [a[ai], b[bi]] = [b[bi], a[ai]];
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { rooms, waiting };
}
