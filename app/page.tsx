"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const [status, setStatus] = useState("연결 확인 중...");

  useEffect(() => {
    async function checkConnection() {
      const { error } = await supabase.auth.getSession();
      setStatus(error ? `연결 오류: ${error.message}` : "Supabase 연결 완료");
    }

    void checkConnection();
  }, []);

  return (
    <main>
      <section className="card">
        <p className="eyebrow">INFORMATION SCIENCE PROJECT</p>
        <h1>프로젝트 기초 틀</h1>
        <p className="description">
          Next.js 앱과 Supabase 클라이언트가 준비되었습니다. 이제 데이터베이스와
          화면 기능을 하나씩 추가하면 됩니다.
        </p>
        <div className="status" role="status">
          <span aria-hidden="true" />
          {status}
        </div>
      </section>
    </main>
  );
}
