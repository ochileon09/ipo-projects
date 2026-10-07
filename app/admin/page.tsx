"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { matchRoommates, roomCompatibilityScore } from "@/lib/roommate-matching";
import { supabase } from "@/lib/supabase/client";

type SurveyRow = {
  id: string;
  student_id: string;
  student_name: string;
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
  is_test: boolean;
  is_default: boolean;
  created_at: string;
};

type RoomInfo = { number: string; students: SurveyRow[]; grade: 1 | 2 | 3; score: number | null };
type FloorInfo = { floor: 2 | 3 | 4; leftGrade: 1 | 2 | 3; rightGrade: 1 | 2 | 3; left: RoomInfo[]; right: RoomInfo[] };
type BuildingInfo = { name: string; description: string; provisional?: boolean; floors: FloorInfo[] };

function isSchoolStudentId(studentId: string, classCount: number, studentsPerClass: number) {
  if (!/^[1-3][1-9][0-9]{2}$/.test(studentId)) return false;
  const classNo = Number(studentId.charAt(1));
  const seatNo = Number(studentId.slice(2));
  return classNo >= 1 && classNo <= classCount && seatNo >= 1 && seatNo <= studentsPerClass;
}

function createDefaultRoster(classCount: number, studentsPerClass: number): SurveyRow[] {
  const students: SurveyRow[] = [];
  [1, 2, 3].forEach((grade) => {
    for (let classNo = 1; classNo <= classCount; classNo += 1) {
      for (let seatNo = 1; seatNo <= studentsPerClass; seatNo += 1) {
        const studentId = `${grade}${classNo}${String(seatNo).padStart(2, "0")}`;
        students.push({
          id: `default-${studentId}`,
          student_id: studentId,
          student_name: `미응답 ${studentId}`,
          grade,
          wake_time: "07:30:00",
          sleep_time: "00:30:00",
          shower_time: "07:40:00",
          shower_frequency: 1,
          tidiness: 3,
          noise_sensitivity: 3,
          preferred_temperature: 22,
          light_sensitivity: 3,
          ventilation_preference: 3,
          alarm_sensitivity: 3,
          room_activity: 3,
          is_test: false,
          is_default: true,
          created_at: "",
        });
      }
    }
  });
  return students;
}

function RoomCard({ room, roomCapacity }: { room: RoomInfo; roomCapacity: number }) {
  return <section className="school-room-card">
    <div className="school-room-header"><strong>{room.number}</strong><span>{room.students.length}/{roomCapacity}</span></div>
    <div className="compact-bed-list">
      {Array.from({ length: roomCapacity }, (_, bedIndex) => {
        const student = room.students[bedIndex];
        return <div className={student ? "compact-bed occupied" : "compact-bed"} key={bedIndex}>
          <i>{bedIndex + 1}</i>
          {student ? <div><b>{student.student_name}</b><small>{student.student_id} · 씻기 {student.shower_time.slice(0, 5)}{student.is_default ? " · 기본값" : ""}</small></div> : <em>빈 자리</em>}
        </div>;
      })}
    </div>
    {room.score !== null && <small className="match-score">생활 조합 {room.score}점</small>}
  </section>;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [classCount, setClassCount] = useState(6);
  const [studentsPerClass, setStudentsPerClass] = useState(16);
  const [roomCapacity, setRoomCapacity] = useState(2);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [isSeeding, setIsSeeding] = useState(false);

  const loadDashboard = useCallback(async (schoolKey: string) => {
    setIsLoading(true); setErrorMessage("");
    const [surveyResult, settingsResult] = await Promise.all([
      supabase.rpc("get_student_surveys_for_admin_by_key", { p_admin_key: schoolKey }),
      supabase.rpc("get_dormitory_settings_by_key", { p_admin_key: schoolKey }),
    ]);
    if (surveyResult.error || settingsResult.error) {
      setErrorMessage(`DB 조회 실패: ${(surveyResult.error ?? settingsResult.error)?.message}`);
    } else {
      setSurveys(((surveyResult.data ?? []) as Omit<SurveyRow, "is_default">[]).map((survey) => ({ ...survey, is_default: false })));
      const settings = settingsResult.data?.[0];
      if (settings) {
        setClassCount(Number(settings.class_count));
        setStudentsPerClass(Number(settings.students_per_class));
        setRoomCapacity(Number(settings.room_capacity));
      }
    }
    setIsLoading(false);
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAuthError("");
    const data = new FormData(event.currentTarget);
    const schoolKey = String(data.get("schoolKey") ?? "").trim();
    const { data: isValid, error } = await supabase.rpc("verify_school_admin_key", { p_admin_key: schoolKey });
    if (error || !isValid) { setAuthError("관리자 인증키를 확인해 주세요."); return; }
    setAdminKey(schoolKey); setIsAuthenticated(true); await loadDashboard(schoolKey);
  }

  function signOut() {
    setIsAuthenticated(false); setAdminKey(""); setSurveys([]); setAuthError(""); setSettingsNotice(""); setErrorMessage("");
  }

  async function createTestStudents() {
    if (isSeeding) return;
    setIsSeeding(true); setSettingsNotice(""); setErrorMessage("");
    const { data, error } = await supabase.rpc("seed_test_student_surveys_by_key", {
      p_admin_key: adminKey,
    });
    setIsSeeding(false);
    if (error) { setErrorMessage(`테스트 데이터 생성 실패: ${error.message}`); return; }
    setSettingsNotice(`실제 응답자를 제외한 가상 설문 ${Number(data ?? 0)}명이 생성되었습니다.`);
    await loadDashboard(adminKey);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingSettings(true); setSettingsNotice(""); setErrorMessage("");
    const { data, error } = await supabase.rpc("set_dormitory_settings_by_key", {
      p_admin_key: adminKey,
      p_room_capacity: roomCapacity,
      p_class_count: classCount,
      p_students_per_class: studentsPerClass,
    });
    setIsSavingSettings(false);
    if (error) { setErrorMessage(`설정 저장 실패: ${error.message}`); return; }
    const saved = data?.[0];
    if (saved) {
      setClassCount(Number(saved.class_count));
      setStudentsPerClass(Number(saved.students_per_class));
      setRoomCapacity(Number(saved.room_capacity));
    }
    setSettingsNotice("기숙사 정원과 방 인원 설정이 저장되었습니다.");
  }

  const schoolRosterSize = 3 * classCount * studentsPerClass;
  const studentsPerGrade = classCount * studentsPerClass;

  const rosterStudents = useMemo(() => {
    const preferredSurveyByStudent = new Map<string, SurveyRow>();
    [...surveys]
      .filter((survey) => isSchoolStudentId(survey.student_id, classCount, studentsPerClass))
      .sort((a, b) => {
        if (a.is_test !== b.is_test) return a.is_test ? 1 : -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .forEach((survey) => {
        if (!preferredSurveyByStudent.has(survey.student_id)) {
          preferredSurveyByStudent.set(survey.student_id, {
            ...survey,
            grade: Number(survey.student_id.charAt(0)),
          });
        }
      });
    return createDefaultRoster(classCount, studentsPerClass).map((defaultStudent) => preferredSurveyByStudent.get(defaultStudent.student_id) ?? defaultStudent);
  }, [classCount, studentsPerClass, surveys]);

  const grade1Rooms = useMemo(() => matchRoommates(rosterStudents.filter((student) => student.grade === 1), roomCapacity), [roomCapacity, rosterStudents]);
  const grade2Rooms = useMemo(() => matchRoommates(rosterStudents.filter((student) => student.grade === 2), roomCapacity), [roomCapacity, rosterStudents]);
  const grade3Rooms = useMemo(() => matchRoommates(rosterStudents.filter((student) => student.grade === 3), roomCapacity), [roomCapacity, rosterStudents]);

  const buildings = useMemo<BuildingInfo[]>(() => {
    function distributeRooms(rooms: SurveyRow[][], zoneCount: number) {
      const zones: SurveyRow[][][] = [];
      let cursor = 0;
      for (let zone = 0; zone < zoneCount; zone += 1) {
        const size = Math.floor(rooms.length / zoneCount) + (zone < rooms.length % zoneCount ? 1 : 0);
        zones.push(rooms.slice(cursor, cursor + size));
        cursor += size;
      }
      return zones;
    }
    function makeWing(floor: 2 | 3 | 4, startRoom: number, grade: 1 | 2 | 3, groups: SurveyRow[][]): RoomInfo[] {
      return groups.map((students, index) => ({
        number: `${floor}${String(startRoom + index).padStart(2, "0")}`,
        students,
        grade,
        score: roomCompatibilityScore(students),
      }));
    }

    const grade2Zones = distributeRooms(grade2Rooms, 3);
    const grade3Zones = distributeRooms(grade3Rooms, 3);
    const a2Left = makeWing(2, 1, 3, grade3Zones[0]);
    const a2Right = makeWing(2, a2Left.length + 1, 3, grade3Zones[1]);
    const a3Left = makeWing(3, 1, 3, grade3Zones[2]);
    const a3Right = makeWing(3, a3Left.length + 1, 2, grade2Zones[0]);
    const a4Left = makeWing(4, 1, 2, grade2Zones[1]);
    const a4Right = makeWing(4, a4Left.length + 1, 2, grade2Zones[2]);

    const grade1Zones = distributeRooms(grade1Rooms, 6);
    const b2Left = makeWing(2, 1, 1, grade1Zones[0]);
    const b2Right = makeWing(2, b2Left.length + 1, 1, grade1Zones[1]);
    const b3Left = makeWing(3, 1, 1, grade1Zones[2]);
    const b3Right = makeWing(3, b3Left.length + 1, 1, grade1Zones[3]);
    const b4Left = makeWing(4, 1, 1, grade1Zones[4]);
    const b4Right = makeWing(4, b4Left.length + 1, 1, grade1Zones[5]);

    return [
      {
        name: "A동",
        description: "2층 3학년 · 3층 왼쪽 3학년/오른쪽 2학년 · 4층 2학년",
        floors: [
          { floor: 4, leftGrade: 2, rightGrade: 2, left: a4Left, right: a4Right },
          { floor: 3, leftGrade: 3, rightGrade: 2, left: a3Left, right: a3Right },
          { floor: 2, leftGrade: 3, rightGrade: 3, left: a2Left, right: a2Right },
        ],
      },
      {
        name: "B동",
        description: "1학년 전용 · 실제 구조 확인 전 자동 최적화 배치",
        provisional: true,
        floors: [
          { floor: 4, leftGrade: 1, rightGrade: 1, left: b4Left, right: b4Right },
          { floor: 3, leftGrade: 1, rightGrade: 1, left: b3Left, right: b3Right },
          { floor: 2, leftGrade: 1, rightGrade: 1, left: b2Left, right: b2Right },
        ],
      },
    ];
  }, [grade1Rooms, grade2Rooms, grade3Rooms]);

  const assignedCount = rosterStudents.length;
  const waitingCount = 0;
  const actualCount = rosterStudents.filter((student) => !student.is_default && !student.is_test).length;
  const testCount = rosterStudents.filter((student) => student.is_test).length;
  const defaultCount = rosterStudents.filter((student) => student.is_default).length;

  if (!isAuthenticated) return <main className="admin-login-page">
    <form className="admin-login-card" onSubmit={signIn}>
      <div className="login-symbol" aria-hidden="true">⌁</div><p className="eyebrow">MANAGER ACCESS</p><h1>관리자 인증</h1>
      <p>기숙사 배정 관리 화면은 관리자 인증키 확인 후 이용할 수 있습니다.</p>
      <label><span>관리자 인증키</span><input type="password" name="schoolKey" autoComplete="off" placeholder="인증키를 입력하세요" required /></label>
      {authError && <p className="login-error" role="alert">{authError}</p>}
      <button type="submit">인증하기</button><small className="login-helper">인증키 발급·변경 방식은 추후 관리자 정책에 맞춰 확장합니다.</small>
    </form>
  </main>;

  return <main className="subpage">
    <div className="page-kicker">사감 관리용</div>
    <div className="admin-title-row">
      <div><h1>기숙사 배정 지도</h1><p className="page-lead">1·2·3학년을 분리하고, 몇 인실 설정에 맞춘 최적 방 수와 생활 패턴 조합을 확인합니다.</p></div>
      <div className="admin-actions"><button type="button" className="secondary-button" onClick={signOut}>로그아웃</button><button type="button" className="refresh-button" onClick={() => void loadDashboard(adminKey)} disabled={isLoading}>{isLoading ? "불러오는 중..." : "DB 새로고침"}</button></div>
    </div>
    {errorMessage && <p className="notice error" role="alert">{errorMessage}</p>}
    {settingsNotice && <p className="notice success" role="status">{settingsNotice}</p>}

    <section className="matching-policy" aria-label="배정 기준">
      <div><span>응답 우선순위</span><strong>실제 응답은 테스트 응답보다 항상 먼저 배정</strong></div>
      <div><span>학년 분리</span><strong>1·2·3학년은 서로 같은 방에 배정하지 않음</strong></div>
      <div><span>유사도 기준</span><strong>취침·기상·청결·소음 등은 비슷할수록 우선</strong></div>
      <div><span>씻는 시간</span><strong>시간이 겹치지 않을수록 우선</strong></div>
    </section>

    <section className="capacity-panel" aria-labelledby="capacity-title">
      <div><p className="eyebrow">DORMITORY SETTING</p><h2 id="capacity-title">학년별 정원 자동 계산</h2><p>전체 정원 = 3개 학년 × 반 수 × 반당 학생 수입니다. 몇 인실인지에 따라 필요한 방 수도 자동 계산합니다.</p></div>
      <form className="capacity-form" onSubmit={saveSettings}>
        <label><span>학년별 반 수</span><div className="number-input"><input type="number" min="1" max="9" value={classCount} onChange={(event) => setClassCount(Number(event.target.value))} required /><b>반</b></div></label>
        <label><span>반당 학생 수</span><div className="number-input"><input type="number" min="1" max="30" value={studentsPerClass} onChange={(event) => setStudentsPerClass(Number(event.target.value))} required /><b>명</b></div></label>
        <label><span>방당 인원</span><div className="number-input"><input type="number" min="1" max="6" value={roomCapacity} onChange={(event) => setRoomCapacity(Number(event.target.value))} required /><b>인실</b></div></label>
        <div className="calculated-capacity"><span>자동 계산 정원</span><strong>{schoolRosterSize}명</strong><small>학년당 {studentsPerGrade}명 · 학년당 {Math.ceil(studentsPerGrade / roomCapacity)}개 방</small></div>
        <button type="submit" disabled={isSavingSettings}>{isSavingSettings ? "저장 중..." : "설정 저장"}</button>
      </form>
    </section>

    <section className="test-panel admin-test-panel" aria-labelledby="test-mode-title">
      <div><p className="eyebrow">DEMO TOOL</p><h2 id="test-mode-title">학교 명단 테스트 모드</h2><p>현재 설정에 맞는 1~3학년 네 자리 학번을 만들고 실제 응답자를 제외한 가상 설문을 생성합니다.</p></div>
      <div className="test-actions"><button type="button" className="secondary-button" onClick={() => void createTestStudents()} disabled={isSeeding}>{isSeeding ? "생성 중..." : `${schoolRosterSize}명 명단으로 배정 시험`}</button></div>
    </section>

    <section className="summary-grid four-summary" aria-label="기숙사 배정 요약">
      <article><span>학교 명단</span><strong>{schoolRosterSize}명</strong><small>학년당 {classCount}반 × {studentsPerClass}명</small></article>
      <article><span>실제 / 테스트 응답</span><strong>{actualCount} / {testCount}명</strong><small>실제 응답 최우선 · 이후 최신 응답</small></article>
      <article><span>기본값 적용</span><strong>{defaultCount}명</strong><small>00:30 · 07:30 · 씻기 07:40</small></article>
      <article><span>배정 / 대기</span><strong>{assignedCount} / {waitingCount}명</strong><small>{roomCapacity}인실 · 학년당 {Math.ceil(studentsPerGrade / roomCapacity)}개 방</small></article>
    </section>

    <section className="dorm-map school-dorm-map" aria-labelledby="map-title">
      <div className="map-heading"><div><p className="eyebrow">SCHOOL DORMITORY · 자동 방 수 최적화</p><h2 id="map-title">학년별 건물·층·구역 지도</h2><p>필요한 방 수는 학년 인원과 몇 인실 설정으로 계산하며, 다른 학년은 같은 방을 사용하지 않습니다.</p></div><div className="grade-legend"><span><i className="grade1-dot" />1학년</span><span><i className="grade2-dot" />2학년</span><span><i className="grade3-dot" />3학년</span></div></div>
      {buildings.map((building) => <div className="building-block" key={building.name}>
        <div className="building-heading"><div><strong>{building.name}</strong>{building.provisional && <span>임시 지도</span>}</div><p>{building.description}</p></div>
        {building.floors.map((floor) => {
          const leftGrade = floor.leftGrade;
          const rightGrade = floor.rightGrade;
          return <article className="school-floor" key={`${building.name}-${floor.floor}`}>
            <header><div><strong>{floor.floor}F</strong><span>왼쪽 {leftGrade}학년 · 오른쪽 {rightGrade}학년</span></div><small>{floor.left.length + floor.right.length}개 호실</small></header>
            <div className="facility-strip"><span>{building.name === "A동" ? "식당 방향" : "왼쪽 끝"}</span><b>왼쪽 계단 · 세탁기{floor.floor === 2 || floor.floor === 4 ? " · 건조기" : ""}</b><b>중앙 계단</b><b>오른쪽 계단 · 세탁기{floor.floor === 2 || floor.floor === 4 ? " · 건조기" : ""}</b><span>오른쪽 끝</span></div>
            <div className="wing-labels"><span className={`grade-${leftGrade}`}>왼쪽 구역 · {leftGrade}학년</span><i>중앙 복도</i><span className={`grade-${rightGrade}`}>오른쪽 구역 · {rightGrade}학년</span></div>
            <div className="school-room-layout">
              <div className="room-wing">{floor.left.map((room) => <RoomCard room={room} roomCapacity={roomCapacity} key={room.number} />)}</div>
              <div className="central-corridor"><span>계단</span><b>{floor.floor}층 중앙</b><span>복도</span></div>
              <div className="room-wing">{floor.right.map((room) => <RoomCard room={room} roomCapacity={roomCapacity} key={room.number} />)}</div>
            </div>
          </article>;
        })}
      </div>)}
    </section>

    <section className="admin-board">
      <div className="board-heading"><div><h2>학생별 생활 패턴</h2><p>미응답 학생은 지정된 기본값으로 표시하며, 배정 계산에도 같은 값이 적용됩니다.</p></div><span>{schoolRosterSize}명</span></div>
      <div className="table-wrap"><table className="survey-table expanded-table">
        <thead><tr><th>구분</th><th>학번</th><th>이름</th><th>학년</th><th>기상</th><th>취침</th><th>주로 씻기</th><th>횟수</th><th>청결</th><th>소음</th><th>조명</th><th>환기</th><th>알람</th><th>활동</th><th>온도</th></tr></thead>
        <tbody>
          {!isLoading && rosterStudents.map((student) => <tr key={student.id}><td><span className={student.is_default ? "default-badge" : student.is_test ? "test-badge" : "live-badge"}>{student.is_default ? "기본값" : student.is_test ? "테스트" : "실제"}</span></td><td>{student.student_id}</td><td><strong>{student.student_name}</strong></td><td>{student.grade}학년</td><td>{student.wake_time.slice(0, 5)}</td><td>{student.sleep_time.slice(0, 5)}</td><td>{student.shower_time.slice(0, 5)}</td><td>{student.shower_frequency}회</td><td>{student.tidiness}/5</td><td>{student.noise_sensitivity}/5</td><td>{student.light_sensitivity}/5</td><td>{student.ventilation_preference}/5</td><td>{student.alarm_sensitivity}/5</td><td>{student.room_activity}/5</td><td>{student.preferred_temperature}℃</td></tr>)}
          {isLoading && <tr><td colSpan={15}><div className="empty-table"><strong>DB에서 설문을 불러오는 중입니다</strong></div></td></tr>}
        </tbody>
      </table></div>
    </section>
  </main>;
}
