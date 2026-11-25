"use client";

import { useActionState, useState } from "react";
import { deletePlayer, setPlayerActive, type FormState } from "../../actions";

export function DangerZone({ id, isActive, hasRecords }: { id: string; isActive: boolean; hasRecords: boolean }) {
  const [archiveState, archive, archiving] = useActionState<FormState>(setPlayerActive.bind(null, id, !isActive), {
    error: null,
  });
  const [deleteState, remove, deleting] = useActionState<FormState>(deletePlayer.bind(null, id), { error: null });
  const [confirming, setConfirming] = useState(false);
  const error = archiveState.error ?? deleteState.error;

  return (
    <section className="mt-10 border-t border-line pt-6">
      <form action={archive}>
        <button className="btn-ghost w-full" disabled={archiving}>
          {isActive ? "보관하기 (명단에서 빼기, 기록은 유지)" : "다시 활동으로 되돌리기"}
        </button>
      </form>

      {!hasRecords && (
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
      {hasRecords && <p className="mt-3 text-center text-xs text-muted">경기 기록이 있어서 삭제 대신 보관만 할 수 있어요.</p>}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
