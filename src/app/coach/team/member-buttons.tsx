"use client";

import { useState, useTransition } from "react";
import { approveAsNewPlayer, approveMember, removeMember } from "./actions";

const NEW = "__new__";

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
  linkable?: { id: string; name: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  // 신청 이름과 같은 명단 선수가 있으면 미리 골라 두고, 고를 선수가 없으면 바로 '새 선수'
  const sameName = linkable.find((p) => p.name.trim() === name.trim());
  const [playerId, setPlayerId] = useState(sameName?.id ?? (linkable.length === 0 ? NEW : ""));
  const [newName, setNewName] = useState(name);
  const [membership, setMembership] = useState<"regular" | "guest">("regular");
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => setError((await fn()).error));

  if (kind === "pending" && wants === "player") {
    const isNew = playerId === NEW;
    return (
      <div data-no-guard className="mt-2 space-y-2">
        <label className="block">
          <span className="text-xs text-muted">명단의 어느 선수인가요?</span>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="input mt-1">
            <option value="">선수 고르기</option>
            {linkable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value={NEW}>+ 명단에 없어요, 새 선수로 등록</option>
          </select>
        </label>
        {sameName && playerId === sameName.id && <p className="text-xs text-muted">신청 이름과 같은 선수를 골라 뒀어요.</p>}
        {isNew && (
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={30}
              aria-label="새 선수 이름"
              className="input min-w-0 flex-1"
            />
            <div className="flex shrink-0 rounded-xl border border-line p-0.5 text-sm" role="group" aria-label="고정 또는 용병">
              {(["regular", "guest"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={membership === m}
                  onClick={() => setMembership(m)}
                  className={`rounded-lg px-3 ${membership === m ? "bg-pitch-soft font-semibold text-pitch" : "text-muted"}`}
                >
                  {m === "regular" ? "고정" : "용병"}
                </button>
              ))}
            </div>
          </div>
        )}
        {isNew && <p className="text-xs text-muted">등번호·포지션은 나중에 선수 탭에서 넣어도 돼요.</p>}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending || !playerId || (isNew && !newName.trim())}
            className="btn-primary min-h-10 text-sm"
            onClick={() => run(() => (isNew ? approveAsNewPlayer(userId, newName, membership) : approveMember(userId, playerId)))}
          >
            {isNew ? "등록하고 승인" : "연결하고 승인"}
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
          <button
            type="button"
            disabled={pending}
            className="btn-primary min-h-10 text-sm"
            onClick={() => run(() => approveMember(userId))}
          >
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
