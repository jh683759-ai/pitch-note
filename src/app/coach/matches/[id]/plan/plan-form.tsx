"use client";

import { useState, useTransition } from "react";
import { MAX_NEXT_FOCUS, type Visibility } from "@/lib/matches";
import { POSITIONS } from "@/lib/players";
import { saveMatchPlan } from "../../actions";
import { ErrorBox, StickyActions } from "../../ui";

type P = { id: string; name: string; jersey: number | null; main: string | null };
type Line = { position: string | null; squad: number | null };

export function PlanForm({
  matchId,
  initialPoints,
  lastFocus,
  initialScout,
  resources,
  initialResourceIds,
  players,
  initialLineup,
}: {
  matchId: string;
  initialPoints: string[];
  lastFocus: string[];
  initialScout: { body: string; visibility: Visibility }[];
  resources: { id: string; title: string }[];
  initialResourceIds: string[];
  players: P[];
  initialLineup: { player_id: string; position: string | null; squad: number | null }[];
}) {
  const pad = (xs: string[]) => [...xs, ...Array(MAX_NEXT_FOCUS).fill("")].slice(0, MAX_NEXT_FOCUS);
  const [points, setPoints] = useState(pad(initialPoints));
  const [scout, setScout] = useState(initialScout[0]?.body ?? "");
  const [scoutTeam, setScoutTeam] = useState(initialScout[0]?.visibility === "team");
  const [picked, setPicked] = useState<string[]>(initialResourceIds);
  const [lineup, setLineup] = useState<Record<string, Line>>(() =>
    Object.fromEntries(initialLineup.map((l) => [l.player_id, { position: l.position, squad: l.squad }])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setLine = (id: string, patch: Partial<Line>) =>
    setLineup((prev) => {
      const cur = prev[id] ?? { position: null, squad: null };
      return { ...prev, [id]: { ...cur, ...patch } };
    });

  const onSave = () =>
    start(async () => {
      const res = await saveMatchPlan(matchId, {
        points,
        scout: [{ body: scout, visibility: scoutTeam ? "team" : "coach" }],
        resourceIds: picked,
        lineup: Object.entries(lineup).map(([player_id, l]) => ({ player_id, ...l })),
      });
      setError(res?.error ?? null);
    });

  const empty = points.every((p) => !p.trim());

  return (
    <div className="mt-6 space-y-4">
      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">팀 포인트</h2>
        <p className="text-xs text-muted">이번 경기에서 꼭 할 것 1~3개. 선수 내 페이지 맨 위에 떠요.</p>
        {points.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center font-bold text-pitch">{i + 1}</span>
            <input
              value={p}
              maxLength={200}
              onChange={(e) => setPoints((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={i === 0 ? "예) 킥인은 약속한 패턴 2개만" : ""}
              className="input"
            />
          </div>
        ))}
        {empty && lastFocus.length > 0 && (
          <button type="button" onClick={() => setPoints(pad(lastFocus))} className="text-sm text-pitch underline">
            지난 경기 &lsquo;다음 경기 포인트&rsquo; 가져오기
          </button>
        )}
      </section>

      <section className="card space-y-2 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">상대 메모</h2>
          <button
            type="button"
            onClick={() => setScoutTeam((v) => !v)}
            aria-pressed={scoutTeam}
            className={`min-h-10 rounded-lg border px-3 text-xs ${scoutTeam ? "border-pitch font-semibold text-pitch" : "border-line text-muted"}`}
          >
            {scoutTeam ? "팀 공개" : "감독만"}
          </button>
        </div>
        <textarea
          value={scout}
          maxLength={500}
          rows={2}
          onChange={(e) => setScout(e.target.value)}
          placeholder="예) 왼쪽 7번 빠름, 킥인 때 2명 붙음"
          className="input"
        />
      </section>

      {resources.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">이 경기 자료</h2>
          <p className="text-xs text-muted">붙이면 팀 전체가 내 페이지에서 봐요. 새 자료는 &lsquo;자료&rsquo; 탭에서 올려요.</p>
          <ul className="mt-2 divide-y divide-line">
            {resources.map((r) => {
              const on = picked.includes(r.id);
              return (
                <li key={r.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setPicked((xs) => (on ? xs.filter((x) => x !== r.id) : [...xs, r.id]))}
                      className="h-5 w-5 accent-[var(--color-pitch)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <details className="card p-4" open={Object.keys(lineup).length > 0}>
        <summary className="cursor-pointer font-semibold">
          예상 포지션 · 조 <span className="text-xs font-normal text-muted">(선택, 선수는 자기 것만 봐요)</span>
        </summary>
        <ul className="mt-3 divide-y divide-line">
          {players.map((p) => {
            const l = lineup[p.id] ?? { position: null, squad: null };
            return (
              <li key={p.id} className="py-2">
                <p className="mb-1 text-sm">
                  <span className="mr-1 text-xs text-muted tabular-nums">{p.jersey ?? ""}</span>
                  {p.name}
                </p>
                <div className="flex flex-wrap gap-1">
                  {POSITIONS.map((pos) => (
                    <Chip key={pos.value} on={l.position === pos.value} onClick={() => setLine(p.id, { position: l.position === pos.value ? null : pos.value })}>
                      {pos.label}
                    </Chip>
                  ))}
                  <span className="mx-1 w-px self-stretch bg-line" />
                  {[1, 2].map((s) => (
                    <Chip key={s} on={l.squad === s} onClick={() => setLine(p.id, { squad: l.squad === s ? null : s })}>
                      {s}조
                    </Chip>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </details>

      <ErrorBox error={error} />
      <StickyActions>
        <button type="button" disabled={pending} onClick={onSave} className="btn-primary flex-1">
          {pending ? "저장 중…" : "저장"}
        </button>
      </StickyActions>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-10 rounded-lg border px-2.5 text-xs ${on ? "border-pitch bg-pitch font-semibold text-white dark:text-black" : "border-line text-muted"}`}
    >
      {children}
    </button>
  );
}
