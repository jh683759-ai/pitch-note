"use client";

import { useActionState, useEffect, useRef } from "react";
import { ErrorBox } from "@/app/coach/matches/ui";
import { POSITIONS } from "@/lib/players";
import { createResource, type ResourceState } from "./actions";

export function ResourceForm({ players }: { players: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ResourceState, FormData>(createResource, { error: null });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="card space-y-3 p-4">
      <h2 className="font-semibold">자료 올리기</h2>
      <input name="title" required maxLength={80} placeholder="제목 예) 압박 타이밍 3분 영상" className="input" />
      <input name="url" required inputMode="url" maxLength={500} placeholder="링크 (유튜브, 블로그 등)" className="input" />
      <input name="note" maxLength={200} placeholder="한 줄 (선택) 예) 2분 30초부터 보세요" className="input" />
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">누구에게</span>
        <select name="target" defaultValue="team" className="input">
          <option value="team">팀 전체</option>
          <optgroup label="포지션">
            {POSITIONS.map((p) => (
              <option key={p.value} value={`pos:${p.value}`}>
                {p.label} ({p.hint})
              </option>
            ))}
          </optgroup>
          {players.length > 0 && (
            <optgroup label="선수 한 명">
              {players.map((p) => (
                <option key={p.id} value={`player:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <ErrorBox error={state.error} />
      {state.ok && <p className="text-sm text-pitch">올렸어요. 선수 내 페이지에 떠요.</p>}
      <button disabled={pending} className="btn-primary w-full">
        {pending ? "올리는 중…" : "올리기"}
      </button>
    </form>
  );
}
