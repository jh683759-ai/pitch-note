"use client";

import { useActionState, useState } from "react";
import { MATCH_TYPES, type Match } from "@/lib/matches";
import type { ActionResult } from "./actions";
import { ErrorBox, TapChip } from "./ui";

type Props = {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  match?: Pick<Match, "played_on" | "opponent" | "venue" | "match_type" | "kickoff_time">;
  today: string;
  recentOpponents: string[];
  submitLabel: string;
  /** 다가오는 경기: 시작 시간 칸, 오늘 이후만 */
  upcoming?: boolean;
};

export function MatchForm({ action, match, today, recentOpponents, submitLabel, upcoming }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [opponent, setOpponent] = useState(match?.opponent ?? "");
  const [type, setType] = useState<string>(match?.match_type ?? "friendly");

  return (
    <form action={formAction} className="space-y-6">
      <div className={upcoming ? "grid grid-cols-[3fr_2fr] gap-2" : ""}>
        <label className="block">
          <span className="text-sm text-muted">날짜</span>
          <input
            type="date"
            name="played_on"
            required
            defaultValue={match?.played_on ?? today}
            min={upcoming && !match ? today : undefined}
            max="2100-12-31"
            className="input mt-1"
          />
        </label>
        {upcoming && (
          <label className="block">
            <span className="text-sm text-muted">시작 (선택)</span>
            <input type="time" name="kickoff_time" defaultValue={match?.kickoff_time?.slice(0, 5) ?? ""} step={600} className="input mt-1" />
          </label>
        )}
      </div>

      <div>
        <label className="block">
          <span className="text-sm text-muted">상대 팀</span>
          <input
            name="opponent"
            required
            maxLength={40}
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="예) 청년부 B팀"
            className="input mt-1"
          />
        </label>
        {/* 같은 팀과 자주 하니까 최근 상대는 한 번에 */}
        {recentOpponents.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {recentOpponents.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOpponent(o)}
                className={`rounded-full border px-3 py-1.5 text-sm ${opponent === o ? "border-pitch text-pitch" : "border-line text-muted"}`}
              >
                {o}
              </button>
            ))}
          </div>
        )}
      </div>

      <fieldset>
        <legend className="text-sm text-muted">경기 종류</legend>
        <input type="hidden" name="match_type" value={type} />
        <div className="mt-1 grid grid-cols-4 gap-2">
          {MATCH_TYPES.map((t) => (
            <TapChip key={t.value} selected={type === t.value} onClick={() => setType(t.value)}>
              {t.label}
            </TapChip>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm text-muted">장소 (선택)</span>
        <input name="venue" maxLength={60} defaultValue={match?.venue ?? ""} placeholder="예) 교회 옆 풋살장" className="input mt-1" />
      </label>

      <ErrorBox error={state.error} />

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "저장 중…" : submitLabel}
      </button>
    </form>
  );
}
