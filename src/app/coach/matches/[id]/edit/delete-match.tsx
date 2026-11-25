"use client";

import { useState, useTransition } from "react";
import { deleteMatch } from "../../actions";
import { ErrorBox } from "../../ui";

export function DeleteMatch({ id, summary }: { id: string; summary: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="mt-10 border-t border-line pt-6">
      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm">이 경기의 {summary}와 메모가 모두 지워져요. 되돌릴 수 없어요.</p>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={() => setConfirming(false)}>
              취소
            </button>
            <button
              type="button"
              disabled={pending}
              className="btn-ghost flex-1 border-danger text-danger"
              onClick={() => start(async () => setError((await deleteMatch(id)).error))}
            >
              정말 삭제
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="w-full py-3 text-sm text-danger" onClick={() => setConfirming(true)}>
          잘못 만든 경기 삭제
        </button>
      )}
      <div className="mt-3">
        <ErrorBox error={error} />
      </div>
    </section>
  );
}
