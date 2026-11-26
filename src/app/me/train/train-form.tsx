"use client";

import { useActionState, useState } from "react";
import { ErrorBox, TapChip } from "@/app/coach/matches/ui";
const MINUTE_CHOICES = [15, 30, 60] as const;
import { saveTraining, type TrainState } from "../actions";

/** 1분 안에: 연습한 포인트 탭 → (선택) 한 줄, 몇 분 → 저장 */
export function TrainForm({ focus, practiced, today }: { focus: string[]; practiced: number[]; today: string }) {
  const [state, action, pending] = useActionState<TrainState, FormData>(saveTraining, { error: null });
  const [picked, setPicked] = useState<number[]>([]);
  const [minutes, setMinutes] = useState<number | null>(null);
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));

  return (
    <form action={action} className="card space-y-4 p-4">
      {focus.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">연습한 내 포인트</legend>
          <div className="space-y-2">
            {focus.map((f, i) => (
              <TapChip key={i} selected={picked.includes(i)} onClick={() => toggle(i)} className="w-full text-left">
                {i + 1}. {f}
                {practiced.includes(i) && !picked.includes(i) && <span className="ml-1 text-xs text-muted">· 연습한 적 있음</span>}
              </TapChip>
            ))}
          </div>
          {picked.map((i) => (
            <input key={i} type="hidden" name="focus" value={i} />
          ))}
        </fieldset>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">한 일 {focus.length > 0 && <span className="font-normal text-muted">(선택)</span>}</span>
        <input name="body" maxLength={200} placeholder="예) 벽 패스 100개, 왼발만" className="input" />
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">
          몇 분 <span className="font-normal text-muted">(선택)</span>
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {MINUTE_CHOICES.map((m) => (
            <TapChip key={m} selected={minutes === m} onClick={() => setMinutes(minutes === m ? null : m)}>
              {m}분
            </TapChip>
          ))}
        </div>
        <input type="hidden" name="minutes" value={minutes ?? ""} />
      </fieldset>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">날짜</span>
        <input type="date" name="trained_on" defaultValue={today} max={today} className="input" />
      </label>
      <ErrorBox error={state.error} />
      <button disabled={pending} className="btn-primary w-full">
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}
