"use client";

import { useState, useTransition } from "react";
import { RSVP, type RsvpAnswer } from "@/lib/matches";
import { finishMatch, setRsvpForPlayer } from "../actions";
import { ErrorBox } from "../ui";

type Row = { id: string; name: string; jersey: number | null; guest: boolean; answer: RsvpAnswer | null; byPlayer: boolean };

/** 참석 응답. 감독은 단톡방으로 답한 선수를 대신 눌러 줄 수 있다. */
export function RsvpBoard({ matchId, rows: initial, editable }: { matchId: string; rows: Row[]; editable: boolean }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const set = (id: string, answer: RsvpAnswer | null) => {
    const before = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, answer, byPlayer: false } : r)));
    start(async () => {
      const res = await setRsvpForPlayer(matchId, id, answer);
      if (res.error) {
        setRows(before);
        setError(res.error);
      } else setError(null);
    });
  };

  const yes = rows.filter((r) => r.answer === "yes");
  const no = rows.filter((r) => r.answer === "no");
  const none = rows.filter((r) => !r.answer && !r.guest);

  return (
    <div>
      <p className="text-sm">
        <span className="font-semibold text-pitch">갈게요 {yes.length}</span>
        <span className="text-muted"> · 못 가요 {no.length} · 아직 {none.length}</span>
      </p>
      {none.length > 0 && <p className="mt-1 text-xs text-muted">아직: {none.map((r) => r.name).join(", ")}</p>}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-muted">{editable ? "선수별 보기 · 대신 누르기" : "선수별 보기"}</summary>
        <ul className="mt-2 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex min-h-12 items-center gap-2 py-1.5">
              <span className="w-6 shrink-0 text-xs text-muted tabular-nums">{r.jersey ?? ""}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {r.name}
                {r.guest && <span className="ml-1 text-xs text-muted">용병</span>}
                {r.answer && r.byPlayer && <span className="ml-1 text-xs text-pitch">본인</span>}
              </span>
              {RSVP.map((o) =>
                editable ? (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={r.answer === o.value}
                    onClick={() => set(r.id, r.answer === o.value ? null : o.value)}
                    className={`min-h-10 rounded-lg border px-2.5 text-xs ${
                      r.answer === o.value
                        ? o.value === "yes"
                          ? "border-pitch bg-pitch font-semibold text-white dark:text-black"
                          : "border-danger bg-danger font-semibold text-white dark:text-black"
                        : "border-line text-muted"
                    }`}
                  >
                    {o.label}
                  </button>
                ) : r.answer === o.value ? (
                  <span key={o.value} className={`text-xs ${o.value === "yes" ? "text-pitch" : "text-danger"}`}>
                    {o.label}
                  </span>
                ) : null,
              )}
            </li>
          ))}
        </ul>
      </details>
      <ErrorBox error={error} />
    </div>
  );
}

/** 경기가 끝나면 같은 경기에서 결과 기록으로 */
export function FinishButton({ matchId }: { matchId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setError((await finishMatch(matchId)).error))}
        className="btn-ghost w-full"
      >
        {pending ? "넘어가는 중…" : "경기 끝났어요 · 결과 기록하기 →"}
      </button>
      <p className="mt-2 text-center text-xs text-muted">출석 → 골·실점 → 메모 순서로 이어져요. 계획은 그대로 남아요.</p>
      <ErrorBox error={error} />
    </div>
  );
}
