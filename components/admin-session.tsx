"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";

const storageKey = "roomfit-admin-session";
type SessionStatus = "restoring" | "signedOut" | "authenticated";
type AdminSession = {
  adminKey: string;
  status: SessionStatus;
  isAuthenticated: boolean;
  restoreError: string;
  authenticate: (key: string) => Promise<string | null>;
  retryRestore: () => void;
  logout: () => void;
  testEnabled: boolean;
  setTestEnabled: (enabled: boolean) => void;
};
const Context = createContext<AdminSession | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [adminKey, setAdminKey] = useState("");
  const [status, setStatus] = useState<SessionStatus>("restoring");
  const [restoreError, setRestoreError] = useState("");
  const [testEnabled, setTestEnabled] = useState(false);
  const version = useRef(0);

  const logout = useCallback(() => {
    version.current += 1;
    try { sessionStorage.removeItem(storageKey); } catch { /* 메모리의 인증도 함께 해제합니다. */ }
    setAdminKey(""); setStatus("signedOut"); setRestoreError(""); setTestEnabled(false);
  }, []);

  const restore = useCallback(async () => {
    const request = ++version.current;
    let saved = "";
    try { saved = sessionStorage.getItem(storageKey) ?? ""; } catch { /* 저장소를 사용할 수 없으면 직접 인증합니다. */ }
    if (!saved) { setAdminKey(""); setStatus("signedOut"); setRestoreError(""); return; }
    setAdminKey(saved); setStatus("restoring"); setRestoreError("");
    const { data, error } = await supabase.rpc("verify_school_admin_key", { p_admin_key: saved });
    if (request !== version.current) return;
    if (error) {
      // 연결 실패는 로그아웃으로 취급하지 않고 저장된 세션을 유지합니다.
      setRestoreError("인증 서버에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
      return;
    }
    if (data !== true) {
      logout(); setRestoreError("저장된 인증키가 유효하지 않습니다. 다시 인증해 주세요.");
      return;
    }
    setStatus("authenticated");
  }, [logout]);

  useEffect(() => {
    void restore();
    return () => { version.current += 1; };
  }, [restore]);

  const authenticate = useCallback(async (key: string) => {
    const request = ++version.current;
    const trimmed = key.trim();
    const { data, error } = await supabase.rpc("verify_school_admin_key", { p_admin_key: trimmed });
    if (request !== version.current) return "인증 요청이 취소되었습니다.";
    if (error) return "인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    if (data !== true) return "관리자 인증키를 확인해 주세요.";
    // sessionStorage는 이 탭의 세션에만 저장되며 창을 닫은 뒤 영구 유지하지 않습니다.
    try { sessionStorage.setItem(storageKey, trimmed); } catch { /* 화면 이동 중에는 메모리에서 인증을 유지합니다. */ }
    setAdminKey(trimmed); setStatus("authenticated"); setRestoreError("");
    return null;
  }, []);

  return <Context.Provider value={{ adminKey, status, isAuthenticated: status === "authenticated", restoreError, authenticate, retryRestore: () => { void restore(); }, logout, testEnabled, setTestEnabled }}>{children}</Context.Provider>;
}

export function useAdminSession() {
  const session = useContext(Context);
  if (!session) throw new Error("AdminSessionProvider가 필요합니다.");
  return session;
}
