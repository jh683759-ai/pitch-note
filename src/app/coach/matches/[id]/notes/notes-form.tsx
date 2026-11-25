"use client";

import { useState, useTransition } from "react";
import type { ReviewKind, Visibility } from "@/lib/matches";
import { saveReview } from "../../actions";
import { ErrorBox, StickyActions } from "../../ui";

export type NoteDraft = { body: string; visibility: Visibility };

export function NotesForm({
  matchId,
  good: initialGood,
  improve: initialImprove,
  focus: initialFocus,
}: {
  matchId: string;
  good: NoteDraft;
  improve: NoteDraft;
  focus: NoteDraft[];
}) {
  const [good, setGood] = useState(initialGood);
  const [improve, setImprove] = useState(initialImprove);
  const [focus, setFocus] = useState(initialFocus);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setFocusAt = (i: number, d: Partial<NoteDraft>) => setFocus((prev) => prev.map((f, j) => (j === i ? { ...f, ...d } : f)));

  const onSave = () =>
    start(async () => {
      const notes: { kind: ReviewKind; body: string; visibility: Visibility }[] = [
        { kind: "good", ...good },
        { kind: "improve", ...improve },
        ...focus.map((f) => ({ kind: "next_focus" as const, ...f })),
      ];
      const res = await saveReview(matchId, notes);
      setError(res.error);
    });

  return (
    <div className="mt-6 space-y-6 pb-28">
      <Block label="잘된 점" value={good} onChange={(d) => setGood((p) => ({ ...p, ...d }))} placeholder="예) 전방 압박으로 2골. 박아라-정피보 연계 좋음" />
      <Block label="개선점" value={improve} onChange={(d) => setImprove((p) => ({ ...p, ...d }))} placeholder="예) 공 뺏긴 뒤 전환 수비가 늦음" />

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">다음 경기 포인트</legend>
        <p className="mb-2 text-xs text-muted">많으면 아무것도 기억 못 해요. 1~3개만.</p>
        <div className="space-y-2">
          {focus.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center font-bold text-pitch">{i + 1}</span>
              <input
                value={f.body}
                onChange={(e) => setFocusAt(i, { body: e.target.value })}
                maxLength={200}
                placeholder={i === 0 ? "예) 공 뺏기면 3초 안에 압박" : ""}
                className="input"
              />
              <VisibilityToggle value={f.visibility} onChange={(visibility) => setFocusAt(i, { visibility })} />
            </div>
          ))}
        </div>
      </fieldset>

      <p className="text-xs text-muted">
        &lsquo;팀 공개&rsquo;로 둔 메모만 선수용 공유 링크에 보여요. 처음에는 모두 &lsquo;감독만&rsquo;이에요.
      </p>

      <ErrorBox error={error} />

      <StickyActions>
        <button type="button" disabled={pending} onClick={onSave} className="btn-primary flex-1">
          {pending ? "저장 중…" : "저장"}
        </button>
      </StickyActions>
    </div>
  );
}

function Block({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: NoteDraft;
  onChange: (d: Partial<NoteDraft>) => void;
  placeholder: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <VisibilityToggle value={value.visibility} onChange={(visibility) => onChange({ visibility })} />
      </div>
      <textarea
        aria-label={label}
        value={value.body}
        onChange={(e) => onChange({ body: e.target.value })}
        rows={3}
        maxLength={1000}
        placeholder={placeholder}
        className="input"
      />
    </div>
  );
}

function VisibilityToggle({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  const team = value === "team";
  return (
    <button
      type="button"
      aria-pressed={team}
      onClick={() => onChange(team ? "coach" : "team")}
      className={`h-10 shrink-0 rounded-lg border px-3 text-xs font-medium ${team ? "border-pitch bg-pitch-soft text-pitch" : "border-line text-muted"}`}
    >
      {team ? "팀 공개" : "감독만"}
    </button>
  );
}
