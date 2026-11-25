"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="block">
        <span className="text-sm text-muted">이메일</span>
        <input name="email" type="email" autoComplete="email" required className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-sm text-muted">비밀번호</span>
        <input name="password" type="password" autoComplete="current-password" required className="input mt-1" />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
