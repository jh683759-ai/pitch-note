"use client";

import { useState, useTransition } from "react";
import { MAX_ON_COURT, type Side } from "@/lib/matches";
import { deleteGoalEvent, saveGoalEvent, type GoalEventInput } from "./actions";
import { ErrorBox, StickyActions, TapChip } from "./ui";

type P = { id: string; name: string; jersey: number | null; gk: boolean };
type Tag = { id: number; kind: string; label: string };

export function EventForm({
  matchId,
  eventId,
  players,
  tags,
  initial,
  prefilledFromLast,
  canDelete,
}: {
  matchId: string;
  eventId: string | null;
  players: P[];
  tags: Tag[];
  initial: GoalEventInput;
  prefilledFromLast: boolean;
  /** 기록 삭제는 감독만 (기록원은 고치기만) */
  canDelete: boolean;
}) {
  const [v, setV] = useState<GoalEventInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(Boolean(initial.note));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  const isFor = v.side === "for";
  const fieldPlayers = players.filter((p) => p.id !== v.goalkeeperId);
  const sideTags = tags.filter((t) => t.kind === (isFor ? "goal_type" : "concede_cause"));
  const courtFull = v.onCourt.length >= MAX_ON_COURT;

  const patch = (p: Partial<GoalEventInput>) => {
    setError(null);
    setV((prev) => ({ ...prev, ...p }));
  };

  // 득점자·어시스트는 당연히 코트 위에 있었다 → 자리가 있으면 자동으로 넣는다
  const withOnCourt = (court: string[], id: string | null) =>
    id && id !== v.goalkeeperId && !court.includes(id) && court.length < MAX_ON_COURT ? [...court, id] : court;

  const pickScorer = (id: string) => {
    const scorerId = v.scorerId === id ? null : id;
    patch({
      scorerId,
      isOwnGoal: false,
      assistId: v.assistId === scorerId ? null : v.assistId,
      onCourt: withOnCourt(v.onCourt, scorerId),
    });
  };
  const pickAssist = (id: string | null) => {
    const assistId = v.assistId === id ? null : id;
    patch({ assistId, onCourt: withOnCourt(v.onCourt, assistId) });
  };
  const pickGk = (id: string) => {
    const goalkeeperId = v.goalkeeperId === id ? null : id;
    patch({ goalkeeperId, onCourt: v.onCourt.filter((p) => p !== goalkeeperId) });
  };
  const toggleCourt = (id: string) =>
    patch({ onCourt: v.onCourt.includes(id) ? v.onCourt.filter((p) => p !== id) : [...v.onCourt, id] });
  const toggleTag = (id: number) =>
    patch({ tagIds: v.tagIds.includes(id) ? v.tagIds.filter((t) => t !== id) : [...v.tagIds, id] });
  const switchSide = (side: Side) =>
    side !== v.side && patch({ side, tagIds: [], scorerId: null, assistId: null, isOwnGoal: false });

  const missingScorerOnCourt =
    isFor && v.scorerId && v.scorerId !== v.goalkeeperId && !v.onCourt.includes(v.scorerId);

  const save = (next: "match" | "another") =>
    start(async () => {
      const res = await saveGoalEvent(matchId, eventId, v, next);
      if (res.error) setError(res.error);
    });

  return (
    <div className="mt-5 space-y-6 pb-28">
      {/* 우리 골 / 실점 */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-line/40 p-1">
        <TapChip selected={isFor} onClick={() => switchSide("for")}>
          우리 골
        </TapChip>
        <TapChip selected={!isFor} tone="danger" onClick={() => switchSide("against")}>
          실점
        </TapChip>
      </div>

      {isFor ? (
        <>
          <Field label="누가 넣었나요">
            <Grid>
              {players.map((p) => (
                <TapChip key={p.id} selected={v.scorerId === p.id} onClick={() => pickScorer(p.id)}>
                  <Name p={p} />
                </TapChip>
              ))}
              <TapChip
                selected={v.isOwnGoal}
                onClick={() => patch({ isOwnGoal: !v.isOwnGoal, scorerId: null, assistId: null })}
                className="text-sm"
              >
                상대 자책골
              </TapChip>
            </Grid>
          </Field>

          {!v.isOwnGoal && (
            <Field label="어시스트">
              <Grid>
                <TapChip selected={v.assistId === null} onClick={() => pickAssist(null)} className="text-sm">
                  없음
                </TapChip>
                {players
                  .filter((p) => p.id !== v.scorerId)
                  .map((p) => (
                    <TapChip key={p.id} selected={v.assistId === p.id} onClick={() => pickAssist(p.id)}>
                      <Name p={p} />
                    </TapChip>
                  ))}
              </Grid>
            </Field>
          )}
        </>
      ) : (
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-card px-4">
          <input
            type="checkbox"
            checked={v.isOwnGoal}
            onChange={(e) => patch({ isOwnGoal: e.target.checked })}
            className="h-5 w-5 accent-[var(--danger)]"
          />
          <span>우리 자책골</span>
        </label>
      )}

      <Field label={isFor ? "어떻게 넣었나요" : "왜 먹었나요"} hint="여러 개 골라도 돼요">
        <div className="flex flex-wrap gap-2">
          {sideTags.map((t) => (
            <TapChip key={t.id} selected={v.tagIds.includes(t.id)} tone={isFor ? "pitch" : "danger"} onClick={() => toggleTag(t.id)} className="px-4">
              {t.label}
            </TapChip>
          ))}
        </div>
      </Field>

      <Field
        label={`그 순간 코트 위 필드 4명`}
        hint={
          <span className={v.onCourt.length === MAX_ON_COURT ? "text-pitch" : ""}>
            {v.onCourt.length}/{MAX_ON_COURT}
            {prefilledFromLast && v.onCourt.length > 0 ? " · 직전 기록에서 가져옴" : ""}
          </span>
        }
      >
        <Grid>
          {fieldPlayers.map((p) => {
            const on = v.onCourt.includes(p.id);
            return (
              <TapChip key={p.id} selected={on} disabled={!on && courtFull} onClick={() => toggleCourt(p.id)}>
                <Name p={p} />
              </TapChip>
            );
          })}
        </Grid>
        {missingScorerOnCourt && (
          <p className="mt-2 text-xs text-danger">득점자가 코트 위 4명에 없어요. 한 명을 빼고 득점자를 넣어주세요.</p>
        )}
      </Field>

      <Field label="골키퍼">
        <Grid>
          {players.map((p) => (
            <TapChip key={p.id} selected={v.goalkeeperId === p.id} onClick={() => pickGk(p.id)} className="text-sm">
              <Name p={p} />
            </TapChip>
          ))}
        </Grid>
      </Field>

      {showNote ? (
        <label className="block">
          <span className="text-sm text-muted">메모 (선택)</span>
          <input
            value={v.note}
            onChange={(e) => patch({ note: e.target.value })}
            maxLength={200}
            placeholder="예) 후반 초반, 킥인 약속 2번"
            className="input mt-1"
            autoFocus={!initial.note}
          />
        </label>
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="text-sm text-muted">
          + 메모 추가
        </button>
      )}

      <ErrorBox error={error} />

      {eventId && !canDelete && (
        <p className="border-t border-line pt-4 text-center text-xs text-muted">기록 삭제는 감독만 할 수 있어요. 잘못 넣었으면 고쳐서 저장하세요.</p>
      )}
      {eventId && canDelete && (
        <div className="border-t border-line pt-4">
          {confirmDelete ? (
            <div className="flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setConfirmDelete(false)}>
                취소
              </button>
              <button
                type="button"
                disabled={pending}
                className="btn-ghost flex-1 border-danger text-danger"
                onClick={() => start(async () => setError((await deleteGoalEvent(matchId, eventId)).error))}
              >
                이 기록 삭제
              </button>
            </div>
          ) : (
            <button type="button" className="w-full py-3 text-sm text-danger" onClick={() => setConfirmDelete(true)}>
              기록 삭제 (스코어는 그대로, 필요하면 직접 고치세요)
            </button>
          )}
        </div>
      )}

      <StickyActions>
        {!eventId && (
          <button type="button" disabled={pending} onClick={() => save("another")} className="btn-ghost flex-1 px-2">
            저장하고 하나 더
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => save("match")} className="btn-primary flex-1">
          {pending ? "저장 중…" : "저장"}
        </button>
      </StickyActions>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 flex w-full items-baseline justify-between">
        <span className="text-sm font-semibold">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-2">{children}</div>;
}

function Name({ p }: { p: P }) {
  return (
    <span className="block truncate">
      {p.name}
      {p.jersey != null && <span className="ml-1 text-xs opacity-60">{p.jersey}</span>}
    </span>
  );
}
