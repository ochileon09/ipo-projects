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
  shower_duration_minutes?: number | null;
  night_noise_activity?: number | null;
  night_light_usage?: number | null;
  alarm_repeats?: number | null;
  flexible_preferences?: ("tidiness" | "ventilation" | "temperature")[];
  environment_answers?: { version?: number; humidity?: number; summer_ac?: number; winter_heater?: number };
  avoid_with?: string[];
  auto_filled_fields?: string[];
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

export function hasDetailedHabits(student: MatchingStudent) {
  if (student.environment_answers?.version === 1) return true;
  return [student.shower_duration_minutes, student.night_noise_activity, student.night_light_usage, student.alarm_repeats].every(value => value != null);
}

export function showerOverlapMinutes(first: MatchingStudent, second: MatchingStudent) {
  const start = timeToMinutes(first.shower_time);
  const otherStart = timeToMinutes(second.shower_time);
  const duration = first.shower_duration_minutes ?? 15;
  const otherDuration = second.shower_duration_minutes ?? 15;
  return Math.max(...[-1440, 0, 1440].map(offset => Math.max(0,
    Math.min(start + duration, otherStart + offset + otherDuration) - Math.max(start, otherStart + offset))));
}

function disturbance(activity: number | null | undefined, sensitivity: number) {
  return ((activity ?? 3) - 1) / 4 * (sensitivity - 1) / 4;
}

function alarmDisturbance(source: MatchingStudent, sleeper: MatchingStudent) {
  const sinceBedtime = (timeToMinutes(source.wake_time) - timeToMinutes(sleeper.sleep_time) + 1440) % 1440;
  const sleepLength = (timeToMinutes(sleeper.wake_time) - timeToMinutes(sleeper.sleep_time) + 1440) % 1440;
  if (sinceBedtime >= sleepLength) return 0;
  return (source.alarm_repeats ?? 2) / 5 * (sleeper.alarm_sensitivity - 1) / 4;
}

export type CompatibilityReason = {
  key: string; label: string; summary: string; value: number; weight: number;
  assessment: "good" | "difference" | "neutral" | "unknown";
};

/** The score and the explanation use the same component values and weights. */
export function compatibilityBreakdown(first: MatchingStudent, second: MatchingStudent): CompatibilityReason[] {
  const preferenceSimilarity = (preference: "tidiness" | "ventilation" | "temperature", a: number, b: number, range: number) =>
    first.flexible_preferences?.includes(preference) || second.flexible_preferences?.includes(preference) ? 1 : similarity(a, b, range);
  const showerConflict = showerOverlapMinutes(first, second) / Math.min(first.shower_duration_minutes ?? 15, second.shower_duration_minutes ?? 15);
  const noise = 1 - (disturbance(first.environment_answers?.version ? 1 : first.night_noise_activity, second.noise_sensitivity) + disturbance(second.environment_answers?.version ? 1 : second.night_noise_activity, first.noise_sensitivity)) / 2;
  const light = first.environment_answers?.version && second.environment_answers?.version ? similarity(first.light_sensitivity, second.light_sensitivity, 4) : 1 - (disturbance(first.environment_answers?.version ? 1 : first.night_light_usage, second.light_sensitivity) + disturbance(second.environment_answers?.version ? 1 : second.night_light_usage, first.light_sensitivity)) / 2;
  const alarm = 1 - (alarmDisturbance(first.environment_answers?.version ? {...first,alarm_repeats:0} : first, second) + alarmDisturbance(second.environment_answers?.version ? {...second,alarm_repeats:0} : second, first)) / 2;
  function reason(key: string, label: string, summary: string, value: number, weight: number,
    assessment?: CompatibilityReason["assessment"]): CompatibilityReason {
    const unknown = first.is_default || second.is_default || first.auto_filled_fields?.includes(key) || second.auto_filled_fields?.includes(key);
    return { key, label, summary: unknown ? summary + " · 기본값 포함" : summary, value, weight,
      assessment: unknown ? "unknown" : assessment ?? (value >= 0.75 ? "good" : "difference") };
  }
  const preference = (key: "tidiness" | "ventilation" | "temperature", label: string, a: number, b: number, range: number, detail: string) => {
    const flexible = first.flexible_preferences?.includes(key) || second.flexible_preferences?.includes(key);
    return reason(key, label, flexible ? "한쪽 이상이 상관없음 선택 · 감점 없음" : detail,
      preferenceSimilarity(key, a, b, range), key === "tidiness" ? 1.1 : 0.8, flexible ? "neutral" : undefined);
  };
  const newNoise = !!first.environment_answers?.version && !!second.environment_answers?.version;
  const results = [
    reason("wake_time", "기상 시간", `기상 시간 차이 ${circularTimeDifference(first.wake_time, second.wake_time)}분`, similarity(circularTimeDifference(first.wake_time, second.wake_time), 0, 180), 1.2),
    reason("sleep_time", "취침 시간", `취침 시간 차이 ${circularTimeDifference(first.sleep_time, second.sleep_time)}분`, similarity(circularTimeDifference(first.sleep_time, second.sleep_time), 0, 240), 1.4),
    preference("tidiness", "청결 기준", first.tidiness, second.tidiness, 4, Math.abs(first.tidiness - second.tidiness) <= 1 ? "청결 기준이 비슷함" : `청결 기준 ${Math.abs(first.tidiness - second.tidiness)}단계 차이`),
    preference("temperature", "실내 온도", first.preferred_temperature, second.preferred_temperature, 8, `선호 온도 차이 ${Math.abs(first.preferred_temperature - second.preferred_temperature)}℃`),
    preference("ventilation", "창문·환기", first.ventilation_preference, second.ventilation_preference, 4, Math.abs(first.ventilation_preference - second.ventilation_preference) <= 1 ? "창문·환기 선호가 비슷함" : "창문·환기 선호에 차이가 있음"),
    reason("noise", "수면 중 소음", newNoise ? "야간 소음 행동을 묻지 않아 충돌 여부는 평가하지 않음" : "이전 설문의 야간 소음 행동과 상대의 민감도를 비교", noise, 1.8, newNoise || first.night_noise_activity == null || second.night_noise_activity == null ? "unknown" : undefined),
    reason("light", "수면 중 조명", newNoise ? first.light_sensitivity === second.light_sensitivity ? "큰 불·작은 불 사용 기준이 같음" : "큰 불·작은 불 사용 기준에 차이가 있음" : "이전 설문의 야간 조명 사용과 상대의 민감도를 비교", light, 1.4, !newNoise && (first.night_light_usage == null || second.night_light_usage == null) ? "unknown" : undefined),
    reason("alarm", "이전 알람 응답", newNoise ? "현재 설문에서는 알람 반복을 묻지 않아 감점하지 않음" : "이전 알람 반복 응답과 상대 수면 시간의 충돌을 비교", alarm, 1, newNoise || first.alarm_repeats == null || second.alarm_repeats == null ? "unknown" : undefined),
    reason("shower_duration_minutes", "샤워 사용", showerOverlapMinutes(first, second) ? `샤워 사용 시간이 ${showerOverlapMinutes(first, second)}분 겹침` : "샤워 사용 시간이 겹치지 않음", 1 - showerConflict, 2,
      first.shower_duration_minutes == null || second.shower_duration_minutes == null ? "unknown" : showerConflict > 0 ? "difference" : "good"),
  ];
  if (first.environment_answers?.version || second.environment_answers?.version) {
    for (const [key, label] of [["humidity", "습도"], ["summer_ac", "여름 에어컨"], ["winter_heater", "겨울 히터"]] as const) {
      const a = first.environment_answers?.[key]; const b = second.environment_answers?.[key];
      const unknown = a == null || b == null || first.auto_filled_fields?.includes(key) || second.auto_filled_fields?.includes(key);
      const flexible = a === 0 || b === 0;
      results.push(reason(key, label, unknown ? "미응답·자동 보완 값 포함 · 감점 없음" : flexible ? "한쪽 이상이 상관없음 선택 · 감점 없음" : a === b ? `${label} 선호가 같음` : `${label} 선호에 차이가 있음`,
        unknown || flexible ? 1 : similarity(a!, b!, 2), 1, unknown ? "unknown" : flexible ? "neutral" : a === b ? "good" : "difference"));
    }
  }
  return results;
}

export function roommateCompatibility(first: MatchingStudent, second: MatchingStudent) {
  return compatibilityBreakdown(first, second).reduce((sum, reason) => sum + reason.value * reason.weight, 0);
}

export function explainRoommates(first: MatchingStudent, second: MatchingStudent) {
  const reasons = compatibilityBreakdown(first, second);
  return { score: roomCompatibilityScore([first, second])!, reasons };
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
      total += roommateCompatibility(student, roommate) / (student.environment_answers?.version || roommate.environment_answers?.version ? 14.5 : 11.5);
      pairs += 1;
    });
  });
  // Normalize each pair using its actual legacy/new-survey weight total.
  return Math.round(Math.max(0, Math.min(10, total / pairs * 10)) * 10) / 10;
}

export function canShareRoom(a: MatchingStudent, b: MatchingStudent) {
  return !a.avoid_with?.includes(b.student_id) && !b.avoid_with?.includes(a.student_id);
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
    if (!scoreCache.has(key)) scoreCache.set(key, roommateCompatibility(a, b) / (a.environment_answers?.version || b.environment_answers?.version ? 14.5 : 11.5));
    return scoreCache.get(key)!;
  }
  const rooms = capacities.map((capacity) => {
    const room: T[] = [];
    if (remaining.length && capacity > 0) room.push(remaining.shift()!);
    while (room.length < capacity && remaining.length) {
      let bestIndex = -1;
      let bestScore = -Infinity;
      remaining.forEach((candidate, index) => {
        if (!room.every(member => canShareRoom(member,candidate))) return;
        const value = room.reduce((total, member) => total + score(member, candidate), 0) / room.length;
        if (value > bestScore) { bestScore = value; bestIndex = index; }
      });
      if (bestIndex < 0) break;
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
          if (!a.every((member,index)=>index===ai || canShareRoom(member,right)) || !b.every((member,index)=>index===bi || canShareRoom(member,left))) continue;
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
  return { rooms, waiting: [...remaining, ...waiting] };
}
