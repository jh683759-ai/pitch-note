"use client";

import { useActionState, useState } from "react";
import { deletePlayer, deletePlayerWithRecords, setPlayerActive, type FormState } from "../../actions";

export type RecordCounts = { matches: number; goals: number; assists: number; mvp: number; account: boolean };

export function DangerZone({ id, name, isActive, records }: { id: string; name: string; isActive: boolean; records: RecordCounts | null }) {
  const [archiveState, archive, archiving] = useActionState<FormState>(setPlayerActive.bind(null, id, !isActive), {
    error: null,
  });
  const [deleteState, remove, deleting] = useActionState<FormState>(deletePlayer.bind(null, id), { error: null });
  const [wipeState, wipe, wiping] = useActionState<FormState, FormData>(deletePlayerWithRecords.bind(null, id), { error: null });
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const error = archiveState.error ?? deleteState.error ?? wipeState.error;

  return (
    <section className="mt-10 border-t border-line pt-6">
      <form action={archive}>
        <button className="btn-ghost w-full" disabled={archiving}>
          {isActive ? "보관하기 (명단에서 빼기, 기록은 유지)" : "다시 활동으로 되돌리기"}
        </button>
      </form>

      {!records && (
        <div className="mt-3">
          {confirming ? (
            <form action={remove} className="flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setConfirming(false)}>
                취소
              </button>
              <button className="btn-ghost flex-1 border-danger text-danger" disabled={deleting}>
                정말 삭제
              </button>
            </form>
          ) : (
            <button type="button" className="w-full py-3 text-sm text-danger" onClick={() => setConfirming(true)}>
              잘못 만든 선수 삭제
            </button>
          )}
        </div>
      )}

      {records && !confirming && (
        <button type="button" className="mt-3 w-full py-3 text-sm text-danger" onClick={() => setConfirming(true)}>
          기록까지 함께 삭제
        </button>
      )}

      {records && confirming && (
        <form action={wipe} className="mt-4 rounded-2xl border border-danger/40 p-4">
          <p className="font-semibold text-danger">{name} 선수를 기록까지 지울까요?</p>
          <p className="mt-1 text-sm text-muted">되돌릴 수 없어요. 기록을 남기려면 위의 보관하기를 쓰세요.</p>
          <ul className="mt-3 space-y-1 text-sm">
            <li>· 출석 {records.matches}경기, 코트 위 기록, 감독 코멘트가 지워져요.</li>
            {records.goals + records.assists > 0 && (
              <li>
                · 골 {records.goals}개·도움 {records.assists}개는 팀 스코어에 남고, 이름만 &lsquo;득점자 미입력&rsquo;으로 바뀌어요.
              </li>
            )}
            {records.mvp > 0 && <li>· MVP였던 {records.mvp}경기는 MVP가 비워져요.</li>}
            {records.account && <li>· 연결된 선수 계정은 지우지 않고 승인 대기로 돌아가요.</li>}
          </ul>
          <label className="mt-4 block">
            <span className="text-sm">
              확인을 위해 <b>{name}</b> 을(를) 입력하세요
            </span>
            <input
              name="confirm_name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="input mt-1"
              placeholder={name}
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
            >
              취소
            </button>
            <button className="btn-ghost flex-1 border-danger text-danger" disabled={wiping || typed.trim() !== name.trim()}>
              {wiping ? "지우는 중…" : "영구 삭제"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
