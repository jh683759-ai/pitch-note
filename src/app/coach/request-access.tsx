"use client";

import { useActionState } from "react";
import { requestAccess, type MemberState } from "./team/actions";

/** 권한이 빠졌거나 신청 기록이 없는 계정이 다시 기록원 신청을 한다 */
export function RequestAccess({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<MemberState, FormData>(requestAccess, { error: null });
  return (
    <form action={action} className="mt-4 space-y-3">
      <label className="block">
        <span className="text-sm text-muted">팀에서 부르는 이름</span>
        <input name="display_name" defaultValue={defaultName} maxLength={20} required className="input mt-1" />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="btn-primary w-full">
        {pending ? "보내는 중…" : "기록원 신청"}
      </button>
    </form>
  );
}
