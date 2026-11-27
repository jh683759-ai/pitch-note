"use client";

import { useState, useTransition } from "react";
import { markSaved } from "@/components/unsaved-guard";
import { MAX_MY_FOCUS, type PlayerNote } from "@/lib/player-notes";
import { ErrorBox } from "@/app/coach/matches/ui";
import { saveMyNotes } from "./actions";

/** 선수 기록 노트: 감독 경기 노트와 같은 틀. 본인과 감독만 본다. */
export function NoteForm({ matchId, initial }: { matchId: string; initial: PlayerNote[] }) {
  const first = (kind: PlayerNote["kind"]) => initial.find((n) => n.kind === kind)?.body ?? "";
  const [good, setGood] = useState(first("good"));
  const [improve, setImprove] = useState(first("improve"));
  const [focus, setFocus] = useState(() => {
    const f = initial.filter((n) => n.kind === "next_focus").map((n) => n.body);
    return [...f, ...Array(MAX_MY_FOCUS).fill("")].slice(0, MAX_MY_FOCUS);
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const onSave = () =>
    start(async () => {
      const notes: PlayerNote[] = [
        { kind: "good", body: good },
        { kind: "improve", body: improve },
        ...focus.map((body) => ({ kind: "next_focus" as const, body })),
      ];
      const res = await saveMyNotes(matchId, notes);
      setError(res.error);
      setSaved(!res.error);
      if (!res.error) markSaved();
    });

  const touch = () => setSaved(false);

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="font-semibold">내 기록 노트</h2>
        <p className="text-xs text-muted">나와 감독님만 봐요. 한 줄이면 충분해요.</p>
      </div>
      <Field label="잘된 점" value={good} onChange={(v) => (setGood(v), touch())} placeholder="예) 공 뺏기고 바로 압박했다" />
      <Field label="아쉬운 점" value={improve} onChange={(v) => (setImprove(v), touch())} placeholder="예) 슈팅 전에 고개를 못 들었다" />
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">다음 경기 내 포인트</legend>
        <p className="mb-2 text-xs text-muted">1~3개만. 내 페이지 맨 위에 떠요.</p>
        <div className="space-y-2">
          {focus.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center font-bold text-pitch">{i + 1}</span>
              <input
                value={f}
                onChange={(e) => (setFocus((prev) => prev.map((x, j) => (j === i ? e.target.value : x))), touch())}
                maxLength={200}
                placeholder={i === 0 ? "예) 왼발로 한 번 더 패스" : ""}
                className="input"
              />
            </div>
          ))}
        </div>
      </fieldset>
      <ErrorBox error={error} />
      <button type="button" disabled={pending} onClick={onSave} className="btn-primary w-full">
        {pending ? "저장 중…" : saved ? "저장했어요" : "저장"}
      </button>
    </section>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} maxLength={500} placeholder={placeholder} className="input" />
    </label>
  );
}
