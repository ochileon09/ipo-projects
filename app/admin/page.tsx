"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type SurveyRow = {
  id: string; student_id: string; student_name: string; grade: number;
  wake_time: string; sleep_time: string; tidiness: number;
  noise_sensitivity: number; preferred_temperature: number;
  is_test: boolean; created_at: string;
};

type RoomInfo = { number: string; students: SurveyRow[] };
type FloorInfo = { floor: number; rooms: RoomInfo[] };

const ROOMS_PER_FLOOR = 4;

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [totalCapacity, setTotalCapacity] = useState(8);
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
      setSurveys((surveyResult.data ?? []) as SurveyRow[]);
      const settings = settingsResult.data?.[0];
      if (settings) {
        setTotalCapacity(Number(settings.total_capacity));
        setRoomCapacity(Number(settings.room_capacity));
      }
    }
    setIsLoading(false);
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAuthError("");
    const data = new FormData(event.currentTarget);
    const schoolKey = String(data.get("schoolKey") ?? "").trim();
    const { data: isValid, error } = await supabase.rpc("verify_school_admin_key", {
      p_admin_key: schoolKey,
    });
    if (error || !isValid) {
      setAuthError("관리자 인증키를 확인해 주세요.");
      return;
    }
    setAdminKey(schoolKey);
    setIsAuthenticated(true);
    await loadDashboard(schoolKey);
  }

  function signOut() {
    setIsAuthenticated(false);
    setAdminKey("");
    setSurveys([]);
    setAuthError("");
    setSettingsNotice("");
    setErrorMessage("");
  }

  async function createTestStudents() {
    if (isSeeding) return;
    setIsSeeding(true); setSettingsNotice(""); setErrorMessage("");
    const { data, error } = await supabase.rpc("seed_test_student_surveys_by_key", {
      p_admin_key: adminKey,
      p_count: totalCapacity,
    });
    setIsSeeding(false);
    if (error) { setErrorMessage(`테스트 데이터 생성 실패: ${error.message}`); return; }
    const insertedCount = Number(data ?? 0);
    setSettingsNotice(insertedCount > 0 ? `가상 학생 ${insertedCount}명이 저장되었습니다.` : `가상 학생 ${totalCapacity}명이 이미 저장되어 있습니다.`);
    await loadDashboard(adminKey);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingSettings(true); setSettingsNotice(""); setErrorMessage("");
    const { data, error } = await supabase.rpc("set_dormitory_settings_by_key", {
      p_admin_key: adminKey,
      p_total_capacity: totalCapacity,
      p_room_capacity: roomCapacity,
    });
    setIsSavingSettings(false);
    if (error) { setErrorMessage(`설정 저장 실패: ${error.message}`); return; }
    const saved = data?.[0];
    if (saved) {
      setTotalCapacity(Number(saved.total_capacity));
      setRoomCapacity(Number(saved.room_capacity));
    }
    setSettingsNotice("기숙사 정원과 방 인원 설정이 저장되었습니다.");
  }

  const assignedStudents = useMemo(() => [...surveys]
    .sort((a, b) => a.student_id.localeCompare(b.student_id, "ko"))
    .slice(0, totalCapacity), [surveys, totalCapacity]);
  const waitingCount = Math.max(0, surveys.length - totalCapacity);
  const totalRooms = Math.ceil(totalCapacity / roomCapacity);
  const testCount = surveys.filter((survey) => survey.is_test).length;

  const floors = useMemo<FloorInfo[]>(() => {
    const floorCount = Math.ceil(totalRooms / ROOMS_PER_FLOOR);
    return Array.from({ length: floorCount }, (_, floorIndex) => {
      const floor = floorIndex + 1;
      const firstRoomIndex = floorIndex * ROOMS_PER_FLOOR;
      const roomsOnFloor = Math.min(ROOMS_PER_FLOOR, totalRooms - firstRoomIndex);
      return {
        floor,
        rooms: Array.from({ length: roomsOnFloor }, (_, roomOffset) => {
          const roomIndex = firstRoomIndex + roomOffset;
          return {
            number: `${floor}${String(roomOffset + 1).padStart(2, "0")}`,
            students: assignedStudents.slice(roomIndex * roomCapacity, (roomIndex + 1) * roomCapacity),
          };
        }),
      };
    }).reverse();
  }, [assignedStudents, roomCapacity, totalRooms]);

  if (!isAuthenticated) return <main className="admin-login-page">
    <form className="admin-login-card" onSubmit={signIn}>
      <div className="login-symbol" aria-hidden="true">⌁</div>
      <p className="eyebrow">MANAGER ACCESS</p><h1>관리자 인증</h1>
      <p>기숙사 배정 관리 화면은 관리자 인증키 확인 후 이용할 수 있습니다.</p>
      <label><span>관리자 인증키</span><input type="password" name="schoolKey" autoComplete="off" placeholder="인증키를 입력하세요" required /></label>
      {authError && <p className="login-error" role="alert">{authError}</p>}
      <button type="submit">인증하기</button>
      <small className="login-helper">현재 임시 인증키를 사용합니다. 발급·변경 방식은 추후 관리자 정책에 맞춰 연결합니다.</small>
    </form>
  </main>;

  return <main className="subpage">
    <div className="page-kicker">사감 관리용</div>
    <div className="admin-title-row">
      <div><h1>기숙사 배정 지도</h1><p className="page-lead">정원과 방 인원을 설정하고, 층별 호실의 사용 학생을 확인합니다.</p></div>
      <div className="admin-actions"><button type="button" className="secondary-button" onClick={signOut}>로그아웃</button><button type="button" className="refresh-button" onClick={() => void loadDashboard(adminKey)} disabled={isLoading}>{isLoading ? "불러오는 중..." : "DB 새로고침"}</button></div>
    </div>

    {errorMessage && <p className="notice error" role="alert">{errorMessage}</p>}
    {settingsNotice && <p className="notice success" role="status">{settingsNotice}</p>}

    <section className="capacity-panel" aria-labelledby="capacity-title">
      <div><p className="eyebrow">DORMITORY SETTING</p><h2 id="capacity-title">기숙사 운영 설정</h2><p>전체 정원과 한 방에 배정할 학생 수를 지정하세요. 지도와 테스트 인원이 자동으로 바뀝니다.</p></div>
      <form className="capacity-form" onSubmit={saveSettings}>
        <label><span>전체 정원</span><div className="number-input"><input type="number" min="2" max="120" value={totalCapacity} onChange={(event) => setTotalCapacity(Number(event.target.value))} required /><b>명</b></div></label>
        <label><span>방당 인원</span><div className="number-input"><input type="number" min="1" max="6" value={roomCapacity} onChange={(event) => setRoomCapacity(Number(event.target.value))} required /><b>인실</b></div></label>
        <button type="submit" disabled={isSavingSettings}>{isSavingSettings ? "저장 중..." : "설정 저장"}</button>
      </form>
    </section>

    <section className="test-panel admin-test-panel" aria-labelledby="test-mode-title">
      <div><p className="eyebrow">DEMO TOOL</p><h2 id="test-mode-title">정원 연동 테스트 모드</h2><p>현재 정원 {totalCapacity}명과 {roomCapacity}인실 설정에 맞춰 가상 설문을 생성하고 지도에 배치합니다.</p></div>
      <div className="test-actions"><button type="button" className="secondary-button" onClick={() => void createTestStudents()} disabled={isSeeding}>{isSeeding ? "생성 중..." : `가상 설문 ${totalCapacity}명 생성`}</button></div>
    </section>

    <section className="summary-grid" aria-label="기숙사 배정 요약">
      <article><span>기숙사 정원</span><strong>{totalCapacity}명</strong><small>{roomCapacity}인실 · 총 {totalRooms}개 호실</small></article>
      <article><span>현재 신청</span><strong>{isLoading ? "—" : surveys.length}명</strong><small>테스트 학생 {testCount}명 포함</small></article>
      <article><span>배정 / 대기</span><strong>{assignedStudents.length} / {waitingCount}명</strong><small>정원 초과 인원은 대기 처리</small></article>
    </section>

    <section className="dorm-map" aria-labelledby="map-title">
      <div className="map-heading"><div><p className="eyebrow">VIRTUAL DORMITORY · A동</p><h2 id="map-title">층별 호실 지도</h2></div><div className="map-legend"><span><i className="occupied-dot" />사용 중</span><span><i className="empty-dot" />빈 자리 있음</span></div></div>
      {floors.map((floor) => <article className="floor-plan" key={floor.floor}>
        <div className="floor-label"><strong>{floor.floor}F</strong><span>{floor.rooms.length}개 호실</span></div>
        <div className="floor-rooms">
          {floor.rooms.map((room) => <section className="room-card" key={room.number}>
            <div className="room-header"><strong>{room.number}호</strong><span>{room.students.length}/{roomCapacity}명</span></div>
            <div className="bed-list">
              {Array.from({ length: roomCapacity }, (_, bedIndex) => {
                const student = room.students[bedIndex];
                return <div className={student ? "bed occupied" : "bed"} key={bedIndex}>
                  <span>{bedIndex + 1}</span><div>{student ? <><strong>{student.student_name}</strong><small>{student.student_id} · {student.grade}학년{student.is_test ? " · 테스트" : ""}</small></> : <em>빈 자리</em>}</div>
                </div>;
              })}
            </div>
          </section>)}
        </div>
        <div className="corridor"><span>계단</span><b>{floor.floor}층 복도</b><span>비상구</span></div>
      </article>)}
    </section>

    <section className="admin-board">
      <div className="board-heading"><div><h2>저장된 설문 목록</h2><p>현재 임시 배치는 학번순입니다. 유사도 배정은 다음 단계에서 연결합니다.</p></div><span>{surveys.length}건</span></div>
      <div className="table-wrap"><table className="survey-table">
        <thead><tr><th>구분</th><th>학번</th><th>이름</th><th>학년</th><th>기상</th><th>취침</th><th>정리</th><th>소음</th><th>온도</th><th>제출 시각</th></tr></thead>
        <tbody>
          {!isLoading && surveys.map((survey) => <tr key={survey.id}><td><span className={survey.is_test ? "test-badge" : "live-badge"}>{survey.is_test ? "테스트" : "실제"}</span></td><td>{survey.student_id}</td><td><strong>{survey.student_name}</strong></td><td>{survey.grade}학년</td><td>{survey.wake_time.slice(0, 5)}</td><td>{survey.sleep_time.slice(0, 5)}</td><td>{survey.tidiness}/5</td><td>{survey.noise_sensitivity}/5</td><td>{survey.preferred_temperature}℃</td><td>{new Date(survey.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td></tr>)}
          {!isLoading && surveys.length === 0 && !errorMessage && <tr><td colSpan={10}><div className="empty-table"><strong>저장된 설문이 없습니다</strong><span>학생 신청 화면에서 설문을 제출하거나 테스트 모드를 실행해 주세요.</span></div></td></tr>}
          {isLoading && <tr><td colSpan={10}><div className="empty-table"><strong>DB에서 설문을 불러오는 중입니다</strong></div></td></tr>}
        </tbody>
      </table></div>
    </section>
  </main>;
}
