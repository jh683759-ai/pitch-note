"use client";

import { useState, useTransition } from "react";
import { approveMember, removeMember } from "./actions";

export function MemberButtons({ userId, name, kind }: { userId: string; name: string; kind: "pending" | "recorder" }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => setError((await fn()).error));

  if (kind === "pending") {
    return (
      <div className="mt-2">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={pending} className="btn-primary min-h-10 text-sm" onClick={() => run(() => approveMember(userId))}>
            승인
          </button>
          <button type="button" disabled={pending} className="btn-ghost min-h-10 text-sm" onClick={() => run(() => removeMember(userId))}>
            거절
          </button>
        </div>
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="shrink-0 text-right">
      {confirming ? (
        <div className="flex gap-1">
          <button type="button" className="btn-ghost min-h-10 px-3 text-sm" onClick={() => setConfirming(false)}>
            취소
          </button>
          <button
            type="button"
            disabled={pending}
            className="btn-ghost min-h-10 border-danger/40 px-3 text-sm text-danger"
            onClick={() => run(() => removeMember(userId))}
          >
            {name} 권한 빼기
          </button>
        </div>
      ) : (
        <button type="button" className="min-h-10 px-1 text-sm text-muted" onClick={() => setConfirming(true)}>
          권한 빼기
        </button>
      )}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
