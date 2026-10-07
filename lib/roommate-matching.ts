export type MatchingStudent = {
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
  return Math.round((total / pairs) * 10);
}
