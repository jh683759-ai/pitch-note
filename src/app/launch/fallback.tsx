"use client";

import { useEffect } from "react";
import { LAST_SHARE_KEY } from "@/components/install-app";

// 로그인 안 한 사람: 마지막으로 본 팀 공유 링크가 있으면 거기로, 없으면 로그인.
export function LaunchFallback() {
  useEffect(() => {
    let to = "/login";
    try {
      const last = localStorage.getItem(LAST_SHARE_KEY);
      if (last && /^\/s\/[A-Za-z0-9_-]+$/.test(last)) to = last;
    } catch {}
    location.replace(to);
  }, []);
  return <main className="flex min-h-dvh items-center justify-center text-sm text-muted">여는 중…</main>;
}
