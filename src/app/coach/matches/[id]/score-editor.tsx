"use client";

import { useState, useTransition } from "react";
import { setScore } from "../actions";

/** 스코어는 골을 적으면 따라 올라가고, 기억 안 나는 골이 있으면 여기서 직접 맞춘다. */
export function ScoreEditor({
  matchId,
  our,
  their,
  result,
}: {
  matchId: string;
  our: number;
  their: number;
  result: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [o, setO] = useState(our);
  const [t, setT] = useState(their);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setO(our);
          setT(their);
          setEditing(true);
        }}
        className="card mt-4 flex w-full items-center justify-center gap-4 py-4"
        aria-label="스코어 고치기"
      >
        <span className="text-4xl font-bold tabular-nums">{our}</span>
        <span className="text-muted">:</span>
        <span className="text-4xl font-bold tabular-nums">{their}</span>
        {result && (
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-sm font-semibold ${
              result === "승" ? "bg-pitch-soft text-pitch" : result === "패" ? "bg-danger/10 text-danger" : "bg-line"
            }`}
          >
            {result}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-center justify-center gap-6">
        <Stepper label="우리" value={o} onChange={setO} />
        <span className="text-muted">:</span>
        <Stepper label="상대" value={t} onChange={setT} />
      </div>
      {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
          취소
        </button>
        <button
          type="button"
          disabled={pending}
          className="btn-primary"
          onClick={() =>
            start(async () => {
              const res = await setScore(matchId, o, t);
              setError(res.error);
              if (!res.error) setEditing(false);
            })
          }
        >
          스코어 저장
        </button>
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`${label} 1 빼기`} className="btn-ghost h-12 w-12 px-0 text-xl" onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </button>
        <span className="w-10 text-center text-3xl font-bold tabular-nums">{value}</span>
        <button type="button" aria-label={`${label} 1 더하기`} className="btn-ghost h-12 w-12 px-0 text-xl" onClick={() => onChange(Math.min(99, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}
