"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Icon } from "@/components/icon";
import { DormitoryEditor } from "@/components/dormitory-editor";
import { FloorGridMap } from "@/components/floor-grid-map";
import { SurveyDeleteDialog } from "@/components/survey-delete-dialog";
import { useAdminRealtime } from "@/lib/supabase/use-admin-realtime";
import { allocateDormitory, createDefaultLayout, validateLayout, type AssignedRoom, type DormLayout, type FloorLayout } from "@/lib/dormitory-layout";
import { selectRoster, type SurveyRow } from "@/lib/student-roster";

const scoreDescription = "0~10점 생활 패턴 적합도: 취침·기상·청결·소음·온도·조명·환기·알람·활동의 유사성과 샤워 시간 분산을 가중 합산한 뒤 정규화합니다. 모든 조합 중 수학적 최적임을 보장하는 값은 아닙니다.";
type SchoolSettings = { classCount: number; studentsPerClass: number; roomCapacity: number };
type DeletedSurvey = { id: string; student_id: string; student_name: string; deleted_at: string };

function RoomCard({ room }: { room: AssignedRoom<SurveyRow> }) {
  const uncertain = room.students.some(student => student.is_default);
  return <section className="school-room-card" aria-label={room.number + "호"}>
    <div className="school-room-header"><div className="room-number-score"><strong>{room.number}</strong><span className={"room-score " + (room.score === null ? "unrated" : room.score >= 8 ? "score-high" : room.score >= 6 ? "score-mid" : "score-low")} title={room.score === null ? "생활 패턴을 비교하려면 2명 이상 필요합니다." : scoreDescription}>{room.score === null ? "평가 대기" : room.score.toFixed(1) + " / 10"}</span></div><span>{room.students.length}/{room.capacity}</span></div>
    <div className="compact-bed-list">{Array.from({ length: room.capacity }, (_, bedIndex) => {
      const student = room.students[bedIndex];
      return <div className={student ? "compact-bed occupied" : "compact-bed"} key={bedIndex}><i>{bedIndex + 1}</i>{student ? <div><b title={student.student_name}>{student.student_name}</b><small>{student.student_id} · 씻기 {student.shower_time.slice(0, 5)}{student.is_default ? " · 기본값" : student.is_test ? " · 테스트" : " · 실제"}</small></div> : <em>빈 자리</em>}</div>;
    })}</div>
    <small className="match-score">{uncertain ? "기본값 포함 · 응답 후 점수 변경" : room.students.length > 1 ? "생활 패턴 기반 임시 배정" : "룸메이트 응답 후 점수 산출"}</small>
  </section>;
}

function facilities(floor: FloorLayout, side: "left" | "right") {
  const items = [floor[side === "left" ? "leftStairs" : "rightStairs"] && "계단", floor[side === "left" ? "leftWasher" : "rightWasher"] && "세탁기", floor[side === "left" ? "leftDryer" : "rightDryer"] && "건조기"].filter(Boolean);
  return items.length ? (side === "left" ? "왼쪽 " : "오른쪽 ") + items.join(" · ") : "공용 시설 없음";
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [deletedSurveys, setDeletedSurveys] = useState<DeletedSurvey[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<SurveyRow | null>(null);
  const [changingSurveyId, setChangingSurveyId] = useState<string | null>(null);
  const [school, setSchool] = useState<SchoolSettings>({ classCount: 6, studentsPerClass: 16, roomCapacity: 2 });
  const [draftSchool, setDraftSchool] = useState(school);
  const [savedLayout, setSavedLayout] = useState<DormLayout | null>(null);
  const [draftLayout, setDraftLayout] = useState<DormLayout | null>(null);
  const [testEnabled, setTestEnabled] = useState(false);
  const [includeDefaults, setIncludeDefaults] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [isChangingMode, setIsChangingMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [movedCount, setMovedCount] = useState(0);
  const requestVersion = useRef(0);
  const previousAssignments = useRef(new Map<string, string>());
  const schoolDraftDirty = useRef(false);

  const loadDashboard = useCallback(async (schoolKey: string, withSettings = false) => {
    const version = ++requestVersion.current;
    if (withSettings) setIsLoading(true);
    const [surveyResult, managementResult, settingsResult, deletedResult] = await Promise.all([
      supabase.rpc("get_student_surveys_for_admin_by_key", { p_admin_key: schoolKey }),
      supabase.rpc("get_dormitory_management_by_key", { p_admin_key: schoolKey }),
      supabase.rpc("get_dormitory_settings_by_key", { p_admin_key: schoolKey }),
      supabase.rpc("get_deleted_student_surveys_by_key", { p_admin_key: schoolKey }),
    ]);
    if (version !== requestVersion.current) return;
    const error = surveyResult.error ?? managementResult.error ?? settingsResult.error ?? deletedResult.error;
    if (error) setErrorMessage("DB 조회 실패: " + error.message);
    else {
      setErrorMessage("");
      const next = ((surveyResult.data ?? []) as Omit<SurveyRow, "is_default">[]).map(survey => ({ ...survey, is_default: false }));
      setSurveys(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      const nextDeleted = (deletedResult.data ?? []) as DeletedSurvey[];
      setDeletedSurveys(previous => JSON.stringify(previous) === JSON.stringify(nextDeleted) ? previous : nextDeleted);
      const management = managementResult.data?.[0];
      if (management) {
        setSavedLayout(previous => JSON.stringify(previous) === JSON.stringify(management.layout) ? previous : management.layout as DormLayout | null);
        setIncludeDefaults(management.include_defaults);
      }
      const settings = settingsResult?.data?.[0];
      if (settings) {
        const nextSchool = { classCount: Number(settings.class_count), studentsPerClass: Number(settings.students_per_class), roomCapacity: Number(settings.room_capacity) };
        setSchool(previous => JSON.stringify(previous) === JSON.stringify(nextSchool) ? previous : nextSchool);
        if (withSettings || !schoolDraftDirty.current) {
          setDraftSchool(previous => JSON.stringify(previous) === JSON.stringify(nextSchool) ? previous : nextSchool);
          schoolDraftDirty.current = false;
        }
      }
      setUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour12: false }));
    }
    setIsLoading(false);
  }, []);

  const refresh = useCallback(() => loadDashboard(adminKey), [adminKey, loadDashboard]);
  const syncState = useAdminRealtime(isAuthenticated, refresh);
  useEffect(() => {
    if (!settingsNotice) return;
    const timeout = window.setTimeout(() => setSettingsNotice(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [settingsNotice]);

  function editSchool(patch: Partial<SchoolSettings>) {
    schoolDraftDirty.current = true;
    setDraftSchool(previous => ({ ...previous, ...patch }));
  }

  async function changeSurvey(surveyId: string, restore: boolean) {
    if (changingSurveyId) return;
    setChangingSurveyId(surveyId); setErrorMessage(""); setSettingsNotice("");
    const { data, error } = await supabase.rpc(restore ? "restore_student_survey_by_key" : "delete_student_survey_by_key", { p_admin_key: adminKey, p_survey_id: surveyId });
    if (error) setErrorMessage(error.message);
    else {
      setDeleteTarget(null);
      await loadDashboard(adminKey);
      setSettingsNotice(data ? restore ? "설문을 복구했습니다." : "설문을 삭제했습니다." : "다른 화면에서 이미 처리된 설문입니다.");
    }
    setChangingSurveyId(null);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (isSigningIn) return;
    setAuthError(""); setIsSigningIn(true);
    const schoolKey = String(new FormData(event.currentTarget).get("schoolKey") ?? "").trim();
    const { data: isValid, error } = await supabase.rpc("verify_school_admin_key", { p_admin_key: schoolKey });
    setIsSigningIn(false);
    if (error) { setAuthError("인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); return; }
    if (!isValid) { setAuthError("관리자 인증키를 확인해 주세요."); return; }
    setTestEnabled(false); setAdminKey(schoolKey); setIsAuthenticated(true); await loadDashboard(schoolKey, true);
  }

  function signOut() {
    requestVersion.current += 1;
    setIsAuthenticated(false); setTestEnabled(false); setAdminKey(""); setSurveys([]); setAuthError(""); setSettingsNotice(""); setErrorMessage(""); setDraftLayout(null);
    setDeletedSurveys([]); setDeleteTarget(null); schoolDraftDirty.current = false;
    previousAssignments.current = new Map(); setMovedCount(0);
  }

  async function createTestStudents() {
    if (isChangingMode) return;
    setIsChangingMode(true); setErrorMessage(""); setSettingsNotice("");
    const { error } = await supabase.rpc("seed_test_student_surveys_by_key", { p_admin_key: adminKey });
    if (error) setErrorMessage("테스트 데이터 생성 실패: " + error.message);
    else { setTestEnabled(true); await loadDashboard(adminKey); setSettingsNotice("테스트 모드를 켰습니다."); }
    setIsChangingMode(false);
  }

  async function changeOperation(nextTest: boolean, nextDefaults: boolean) {
    if (isChangingMode) return;
    setIsChangingMode(true); setErrorMessage(""); setSettingsNotice("");
    const { error } = await supabase.rpc("set_dormitory_operation_by_key", { p_admin_key: adminKey, p_test_enabled: nextTest, p_include_defaults: nextDefaults });
    if (error) setErrorMessage("운영 모드 변경 실패: " + error.message);
    else { setTestEnabled(nextTest); await loadDashboard(adminKey); setSettingsNotice(nextTest ? "배정 옵션을 저장했습니다." : "실제 운영 모드로 전환했습니다."); }
    setIsChangingMode(false);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSavingSettings(true); setSettingsNotice(""); setErrorMessage("");
    const { error } = await supabase.rpc("set_dormitory_settings_by_key", { p_admin_key: adminKey, p_room_capacity: draftSchool.roomCapacity, p_class_count: draftSchool.classCount, p_students_per_class: draftSchool.studentsPerClass });
    if (error) setErrorMessage("설정 저장 실패: " + error.message);
    else { await loadDashboard(adminKey, true); setSettingsNotice("학교 명단 설정을 저장했습니다."); }
    setIsSavingSettings(false);
  }

  async function saveLayout(layout: DormLayout | null) {
    if (layout && validateLayout(layout)) { setErrorMessage(validateLayout(layout)!); return; }
    setIsSavingLayout(true); setSettingsNotice(""); setErrorMessage("");
    const { error } = await supabase.rpc("save_dormitory_layout_by_key", { p_admin_key: adminKey, p_layout: layout });
    if (error) setErrorMessage("건물 구조 저장 실패: " + error.message);
    else { await loadDashboard(adminKey); setDraftLayout(null); setSettingsNotice(layout ? "건물 구조를 저장했습니다." : "자동 구조로 복원했습니다."); }
    setIsSavingLayout(false);
  }

  const schoolRosterSize = 3 * school.classCount * school.studentsPerClass;
  const studentsPerGrade = school.classCount * school.studentsPerClass;
  const automaticLayout = useMemo(() => createDefaultLayout(studentsPerGrade, school.roomCapacity), [studentsPerGrade, school.roomCapacity]);
  const effectiveLayout = savedLayout ?? automaticLayout;
  const roster = useMemo(() => selectRoster(surveys, school.classCount, school.studentsPerClass, testEnabled, includeDefaults), [surveys, school.classCount, school.studentsPerClass, testEnabled, includeDefaults]);
  const allocation = useMemo(() => allocateDormitory(roster.activeStudents, effectiveLayout), [roster.activeStudents, effectiveLayout]);
  const roomsById = useMemo(() => new Map(allocation.rooms.map(room => [room.id, room])), [allocation.rooms]);
  const actualCount = roster.allStudents.filter(student => !student.is_default && !student.is_test).length;
  const testCount = roster.allStudents.filter(student => student.is_test).length;
  const storedTestCount = surveys.filter(student => student.is_test).length;
  const missingCount = roster.allStudents.filter(student => student.is_default).length;
  const assignedCount = allocation.rooms.reduce((sum, room) => sum + room.students.length, 0);
  const totalBeds = allocation.rooms.reduce((sum, room) => sum + room.capacity, 0);
  const defaultCount = roster.activeStudents.filter(student => student.is_default).length;
  const gradeBeds = [1, 2, 3].map(grade => allocation.rooms.filter(room => room.grade === grade).reduce((sum, room) => sum + room.capacity, 0));
  const waitingActual = allocation.waiting.filter(student => !student.is_default && !student.is_test);
  const actualAssignments = useMemo(() => new Map(allocation.rooms.flatMap(room => room.students.filter(student => !student.is_default && !student.is_test).map(student => [student.id, { building: effectiveLayout.find(building => room.id.startsWith(building.id + "/"))?.name, room: room.number }] as const))), [allocation.rooms, effectiveLayout]);
  const eligibleResponseIds = new Set(roster.allStudents.filter(student => !student.is_default && !student.is_test).map(student => student.id));
  const rosterReviewCount = roster.receivedStudents.length - actualCount;

  useEffect(() => {
    const next = new Map<string, string>();
    allocation.rooms.forEach(room => room.students.forEach(student => { if (!student.is_default && !student.is_test) next.set(student.student_id, room.id); }));
    let count = 0;
    next.forEach((room, studentId) => { const previous = previousAssignments.current.get(studentId); if (previous && previous !== room) count += 1; });
    setMovedCount(count);
    previousAssignments.current = next;
  }, [allocation.rooms]);

  if (!isAuthenticated) return <main className="admin-login-page"><form className="admin-login-card" onSubmit={signIn}>
    <div className="login-symbol"><Icon name="shield" size={25} /></div><p className="eyebrow">MANAGER ACCESS</p><h1>관리자 인증</h1>
    <p>기숙사 배정 관리 화면은 관리자 인증키 확인 후 이용할 수 있습니다.</p>
    <label><span>관리자 인증키</span><input type="password" name="schoolKey" autoComplete="off" placeholder="인증키를 입력하세요" required /></label>
    {authError && <p className="login-error" role="alert">{authError}</p>}<button type="submit" disabled={isSigningIn}>{isSigningIn ? "확인 중..." : "인증하기"}</button>
    <small className="login-helper">인증키 발급·변경 방식은 추후 관리자 정책에 맞춰 확장합니다.</small>
  </form></main>;

  return <main className="subpage">
    <div className="page-kicker">사감 관리용</div>
    <div className="admin-title-row"><div><h1>기숙사 배정 지도</h1><p className="page-lead">새 응답이 들어오면 전체 조합을 다시 계산합니다. 현재 위치는 확정 배정이 아닌 임시 제안입니다.</p><div className="admin-sync-meta"><span className={"sync-state " + syncState} role="status" aria-label="동기화 상태"><i />{syncState === "connected" ? "실시간 연결됨" : syncState === "connecting" ? "실시간 연결 중" : "연결 복구 중"}</span><small>{updatedAt ? "최근 반영 " + updatedAt : "데이터 확인 중"}{movedCount > 0 ? " · " + movedCount + "명 배정 변경" : ""}</small></div></div><div className="admin-actions"><button className="secondary-button" onClick={signOut} disabled={!!changingSurveyId}>로그아웃</button><button onClick={() => void loadDashboard(adminKey, true)} disabled={isLoading}>{isLoading ? "불러오는 중..." : "DB 새로고침"}</button><span className="admin-action-feedback" role="status">{settingsNotice}</span></div></div>
    {errorMessage && <p className="notice error" role="alert">{errorMessage}</p>}
    <section className="matching-policy" aria-label="배정 기준"><div><span>실제 응답 우선</span><strong>동일 학번은 실제 응답으로 대체 · 부족한 자리도 실제 응답자 우선</strong></div><div><span>학년 분리</span><strong>구역에 지정한 학년만 배정 · 다른 학년끼리 같은 방 사용 안 함</strong></div><div><span>10점 적합도</span><strong>생활 패턴 유사성과 샤워 시간 분산을 함께 계산</strong></div><div><span>유동적인 임시 배정</span><strong>새 설문에 따라 기존 학생의 방과 룸메이트도 바뀔 수 있음</strong></div></section>

    <section className="capacity-panel" aria-labelledby="capacity-title"><div><p className="eyebrow">SCHOOL ROSTER</p><h2 id="capacity-title">학교 명단과 기본 인실</h2><p>전체 명단 = 3개 학년 × 반 수 × 반당 학생 수. {savedLayout ? "직접 관리 구조에서는 아래 인실이 자동으로 방 구조를 덮어쓰지 않습니다." : "자동 구조에서는 명단과 인실에 맞춰 방 수를 계산합니다."}</p></div>
      <form className="capacity-form" onSubmit={saveSettings}>
        <label><span>학년별 반 수</span><div className="number-input"><input type="number" min="1" max="9" value={draftSchool.classCount} onChange={event => editSchool({ classCount: Number(event.target.value) })} required /><b>반</b></div></label>
        <label><span>반당 학생 수</span><div className="number-input"><input type="number" min="1" max="30" value={draftSchool.studentsPerClass} onChange={event => editSchool({ studentsPerClass: Number(event.target.value) })} required /><b>명</b></div></label>
        <label><span>기본 방당 인원</span><div className="number-input"><input type="number" min="1" max="6" value={draftSchool.roomCapacity} onChange={event => editSchool({ roomCapacity: Number(event.target.value) })} required /><b>인실</b></div></label>
        <div className="calculated-capacity"><span>설정할 학교 명단</span><strong>{3 * draftSchool.classCount * draftSchool.studentsPerClass}명</strong><small>저장 후 반영 · 현재 명단 {schoolRosterSize}명</small></div><button disabled={isSavingSettings}>{isSavingSettings ? "저장 중..." : "명단 설정 저장"}</button>
      </form>
    </section>

    <DormitoryEditor value={draftLayout ?? effectiveLayout} onChange={setDraftLayout} onSave={() => void saveLayout(draftLayout ?? effectiveLayout)} onAuto={() => void saveLayout(null)} busy={isSavingLayout} dirty={draftLayout !== null} students={roster.activeStudents} />

    <section className="test-panel admin-test-panel" aria-labelledby="test-mode-title"><div><p className="eyebrow">OPERATION MODE</p><h2 id="test-mode-title">{testEnabled ? "테스트 모드 사용 중" : "실제 운영 모드"}</h2><p>관리자 페이지를 새로 열면 테스트 모드는 꺼집니다. 테스트 학생 생성 버튼을 누른 경우에만 가상 학생을 배정에 포함합니다.</p>{!testEnabled && storedTestCount > 0 && <p>저장된 가상 학생 {storedTestCount}명은 현재 배정에서 제외되어 있습니다. 제거 버튼으로 DB에서도 정리할 수 있습니다.</p>}<label className="check-label defaults-option"><input type="checkbox" checked={includeDefaults} disabled={isChangingMode} onChange={event => void changeOperation(testEnabled, event.target.checked)} />미응답 학생도 기본값으로 배정 (취침 00:30 · 기상 07:30 · 씻기 07:40)</label></div><div className="test-actions"><button className="secondary-button" onClick={() => void createTestStudents()} disabled={isChangingMode || isLoading}>{isChangingMode ? "변경 중..." : testEnabled ? "테스트 학생 다시 생성" : "테스트 학생 생성"}</button>{(testEnabled || storedTestCount > 0) && <button className="danger-outline" onClick={() => void changeOperation(false, includeDefaults)} disabled={isChangingMode || isLoading}>{testEnabled ? "테스트 종료 · 가상 학생 제거" : "저장된 가상 학생 제거"}</button>}</div></section>

    <section className="summary-grid four-summary" aria-label="기숙사 배정 요약"><article><span>실제 설문 접수</span><strong>{roster.receivedStudents.length}명</strong><small>배정 대상 {actualCount}명 · 명단 확인 필요 {rosterReviewCount}명</small></article><article><span>건물 수용 정원</span><strong>{totalBeds}명</strong><small>{allocation.rooms.length}개 방 · 학교 명단 {schoolRosterSize}명</small></article><article><span>배정 / 미배정</span><strong>{assignedCount} / {allocation.waiting.length + rosterReviewCount}명</strong><small>실제 자리 부족 {waitingActual.length}명 · 명단 확인 {rosterReviewCount}명</small><small>테스트 {testCount}명 · 기본값 배정 {defaultCount}명</small></article><article><span>학년별 수용 정원</span><strong>{gradeBeds.join(" / ")}</strong><small>1학년 / 2학년 / 3학년 · 미응답 {missingCount}명</small></article></section>
    {allocation.waiting.length > 0 && <section className="waiting-panel"><h2>자리 부족으로 배정 대기</h2><p>해당 학년의 방이나 인실을 늘리면 다시 계산합니다. 실제 응답자부터 배정합니다.</p><div>{allocation.waiting.map(student => <span key={student.student_id}>{student.student_name} · {student.student_id}{student.is_test ? " (테스트)" : student.is_default ? " (기본값)" : " (실제)"}</span>)}</div></section>}

    <section className="admin-board received-surveys" aria-labelledby="received-title"><div className="board-heading"><div><h2 id="received-title">실제 설문 접수 명단</h2><p>학교 명단 범위와 관계없이 접수된 실제 응답을 모두 표시합니다. 같은 학번·이름은 마지막 제출 내용으로 갱신됩니다.</p></div><span>{roster.receivedStudents.length}명</span></div>
      <div className="table-wrap"><table className="survey-table"><thead><tr><th>학번</th><th>이름</th><th>배정 상태</th><th>기상</th><th>취침</th><th>주로 씻기</th><th>최근 제출</th><th>관리</th></tr></thead><tbody>
        {!isLoading && roster.receivedStudents.map(student => {
          const outside = roster.outsideRoster.some(response => response.id === student.id);
          const assignment = actualAssignments.get(student.id);
          const status = outside ? "학교 명단 범위 밖" : !eligibleResponseIds.has(student.id) ? "같은 학번의 다른 이름 확인 필요" : assignment ? `${assignment.building} ${assignment.room}호 · 임시 배정` : "자리 부족 · 배정 대기";
          return <tr key={student.id}><td>{student.student_id}</td><td><strong>{student.student_name}</strong></td><td><span className={assignment ? "live-badge" : "default-badge"}>{status}</span>{outside && <small className="roster-row-reason">{Number(student.student_id[1])}반 {Number(student.student_id.slice(2))}번 · 설정: {school.classCount}개 반, 반당 {school.studentsPerClass}명</small>}</td><td>{student.wake_time.slice(0, 5)}</td><td>{student.sleep_time.slice(0, 5)}</td><td>{student.shower_time.slice(0, 5)}</td><td>{new Date(student.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}</td><td><button type="button" className="survey-row-delete" aria-label={`${student.student_id} ${student.student_name} 설문 삭제`} disabled={!!changingSurveyId} onClick={() => { setErrorMessage(""); setDeleteTarget(student); }}>삭제</button></td></tr>;
        })}
        {(isLoading || roster.receivedStudents.length === 0) && <tr><td colSpan={8}><div className="empty-table">{isLoading ? "실제 설문을 불러오는 중입니다" : "아직 접수된 실제 설문이 없습니다"}</div></td></tr>}
      </tbody></table></div>
    </section>

    <details className="deleted-survey-history"><summary>삭제된 설문 <span>{deletedSurveys.length}건</span></summary><p>실수로 삭제한 응답을 복구할 수 있습니다. 같은 학번·이름으로 새 설문이 접수된 경우에는 최신 응답을 우선합니다.</p><div className="table-wrap"><table className="survey-table"><thead><tr><th>학번</th><th>이름</th><th>삭제 시각</th><th>관리</th></tr></thead><tbody>{deletedSurveys.map(student => <tr key={student.id}><td>{student.student_id}</td><td>{student.student_name}</td><td>{new Date(student.deleted_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}</td><td><button type="button" className="secondary-button survey-row-restore" aria-label={`${student.student_id} ${student.student_name} 설문 복구`} disabled={!!changingSurveyId} onClick={() => void changeSurvey(student.id, true)}>{changingSurveyId === student.id ? "복구 중..." : "복구"}</button></td></tr>)}{deletedSurveys.length === 0 && <tr><td colSpan={4}><div className="empty-table">삭제된 설문이 없습니다</div></td></tr>}</tbody></table></div></details>
    {deleteTarget && <SurveyDeleteDialog student={deleteTarget} busy={changingSurveyId === deleteTarget.id} error={errorMessage} onCancel={() => setDeleteTarget(null)} onDelete={() => void changeSurvey(deleteTarget.id, false)} />}

    <section className="dorm-map school-dorm-map" aria-labelledby="map-title"><div className="map-heading"><div><p className="eyebrow">LIVE ROOM PROPOSAL</p><h2 id="map-title">학년별 건물·층·구역 지도</h2><p>호수 옆 숫자는 10점 만점의 생활 패턴 적합도입니다. 2명 미만은 평가 대기로 표시합니다.</p></div><div className="grade-legend"><span><i className="grade1-dot" />1학년</span><span><i className="grade2-dot" />2학년</span><span><i className="grade3-dot" />3학년</span></div></div>
      <details className="score-explanation"><summary>적합도 점수는 어떻게 계산하나요?</summary><p>{scoreDescription} 각 방의 학생 쌍별 점수를 평균내며 빈 침대 수는 점수에 반영하지 않습니다. 기본값이 포함된 방은 설문 응답 후 점수가 달라집니다.</p></details>
      {effectiveLayout.map(building => <div className="building-block" key={building.id}><div className="building-heading"><div><strong>{building.name}</strong>{building.provisional && <span>임시 지도</span>}</div><p>{savedLayout ? "관리자가 저장한 구조" : "명단·기본 인실에 맞춘 자동 구조"}</p></div>
        {[...building.floors].sort((a, b) => b.floor - a.floor).map(floor => {
          if (floor.grid) return <article className="school-floor" key={floor.id}><header><div><strong>{floor.floor}F</strong><span>관리자가 구성한 층 지도</span></div><small>{floor.grid.spaces.filter(space => space.kind === "room").length}개 호실 · {building.diningSide === "none" ? "식당 방향 미지정" : building.diningSide === "left" ? "왼쪽 식당 방향" : "오른쪽 식당 방향"}</small></header><FloorGridMap floor={floor} buildingId={building.id} rooms={allocation.rooms} /></article>;
          const left = Array.from({ length: floor.leftRooms }, (_, i) => roomsById.get(building.id + "/" + floor.id + "/left/" + i)!);
          const right = Array.from({ length: floor.rightRooms }, (_, i) => roomsById.get(building.id + "/" + floor.id + "/right/" + i)!);
          return <article className="school-floor" key={floor.id}><header><div><strong>{floor.floor}F</strong><span>왼쪽 {floor.leftGrade}학년 · 오른쪽 {floor.rightGrade}학년</span></div><small>{left.length + right.length}개 호실</small></header>
            <div className="facility-strip"><span>{building.diningSide === "left" ? "식당 방향" : "왼쪽 끝"}</span><b>{facilities(floor, "left")}</b><b>{floor.centerStairs ? "중앙 계단" : "중앙 복도"}</b><b>{facilities(floor, "right")}</b><span>{building.diningSide === "right" ? "식당 방향" : "오른쪽 끝"}</span></div>
            <div className="wing-labels"><span className={"grade-" + floor.leftGrade}>왼쪽 구역 · {floor.leftGrade}학년 · {floor.leftCapacity}인실</span><i>중앙 복도</i><span className={"grade-" + floor.rightGrade}>오른쪽 구역 · {floor.rightGrade}학년 · {floor.rightCapacity}인실</span></div>
            <div className="school-room-layout"><div className="room-wing">{left.map(room => <RoomCard room={room} key={room.id} />)}</div><div className="central-corridor"><span>{floor.centerStairs ? "계단" : "복도"}</span><b>{floor.floor}층 중앙</b><span>복도</span></div><div className="room-wing">{right.map(room => <RoomCard room={room} key={room.id} />)}</div></div>
          </article>;
        })}
      </div>)}
    </section>

    <section className="admin-board"><div className="board-heading"><div><h2>학생별 생활 패턴</h2><p>미응답 학생은 기본값을 표시합니다. 기본값 배정 옵션을 끄면 응답 도착 전까지 방을 차지하지 않습니다.</p></div><span>{schoolRosterSize}명</span></div>
      <div className="table-wrap"><table className="survey-table expanded-table"><thead><tr><th>구분</th><th>학번</th><th>이름</th><th>학년</th><th>기상</th><th>취침</th><th>주로 씻기</th><th>횟수</th><th>청결</th><th>소음</th><th>조명</th><th>환기</th><th>알람</th><th>활동</th><th>온도</th></tr></thead><tbody>
        {!isLoading && roster.allStudents.map(student => <tr key={student.id}><td><span className={student.is_default ? "default-badge" : student.is_test ? "test-badge" : "live-badge"}>{student.is_default ? "미응답" : student.is_test ? "테스트" : "실제"}</span></td><td>{student.student_id}</td><td><strong>{student.student_name}</strong></td><td>{student.grade}학년</td><td>{student.wake_time.slice(0, 5)}</td><td>{student.sleep_time.slice(0, 5)}</td><td>{student.shower_time.slice(0, 5)}</td><td>{student.shower_frequency}회</td><td>{student.tidiness}/5</td><td>{student.noise_sensitivity}/5</td><td>{student.light_sensitivity}/5</td><td>{student.ventilation_preference}/5</td><td>{student.alarm_sensitivity}/5</td><td>{student.room_activity}/5</td><td>{student.preferred_temperature}℃</td></tr>)}
        {isLoading && <tr><td colSpan={15}><div className="empty-table">DB에서 설문을 불러오는 중입니다</div></td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}
