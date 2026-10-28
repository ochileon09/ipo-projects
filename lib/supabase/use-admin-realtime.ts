"use client";

import { useEffect, useState } from "react";
import { supabase } from "./client";

export function useAdminRealtime(enabled: boolean, refresh: () => Promise<void>) {
  const [state, setState] = useState<"connecting" | "connected" | "retrying">("connecting");
  useEffect(() => {
    if (!enabled) return;
    setState("connecting");
    let active = true;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { if (active) void refresh(); }, 120);
    };
    const catchUp = () => { if (document.visibilityState === "visible") schedule(); };
    const channel = supabase.channel("roomfit-admin-refresh", { config: { private: false } })
      .on("broadcast", { event: "refresh" }, schedule)
      .subscribe(status => {
        if (!active) return;
        if (status === "SUBSCRIBED") { setState("connected"); schedule(); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setState("retrying");
      });
    // Catch events missed during a disconnected or sleeping browser session.
    const fallback = window.setInterval(catchUp, 30000);
    window.addEventListener("focus", catchUp);
    document.addEventListener("visibilitychange", catchUp);
    return () => {
      active = false;
      if (pending) clearTimeout(pending);
      window.clearInterval(fallback);
      window.removeEventListener("focus", catchUp);
      document.removeEventListener("visibilitychange", catchUp);
      void supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);
  return state;
}
