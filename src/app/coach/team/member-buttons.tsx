"use client";

import { useState, useTransition } from "react";
import { approveMember, removeMember } from "./actions";

export function MemberButtons({
  userId,
  name,
  kind,
  wants = "recorder",
  linkable = [],
}: {
  userId: string;
  name: string;
  kind: "pending" | "recorder" | "player";
  wants?: "player" | "recorder";
  linkable?: { id: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => setError((await fn()).error));

  if (kind === "pending" && wants === "player") {
    return (
      <div className="mt-2 space-y-2">
        <label className="block">
          <span className="text-xs text-muted">명단의 어느 선수인가요?</span>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="input mt-1">
            <option value="">선수 고르기</option>
            {linkable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {linkable.length === 0 && <p className="text-xs text-muted">연결할 선수가 없어요. 선수 탭에서 먼저 추가하세요.</p>}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending || !playerId}
            className="btn-primary min-h-10 text-sm"
            onClick={() => run(() => approveMember(userId, playerId))}
          >
            연결하고 승인
          </button>
          <button type="button" disabled={pending} className="btn-ghost min-h-10 text-sm" onClick={() => run(() => removeMember(userId))}>
            거절
          </button>
        </div>
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
    );
  }

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
            {name} {kind === "player" ? "연결 끊기" : "권한 빼기"}
          </button>
        </div>
      ) : (
        <button type="button" className="min-h-10 px-1 text-sm text-muted" onClick={() => setConfirming(true)}>
          {kind === "player" ? "연결 끊기" : "권한 빼기"}
        </button>
      )}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
