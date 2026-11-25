"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup, type SignupState } from "./actions";
import { MIN_PASSWORD } from "./rules";

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, { error: null });

  if (state.sentTo) {
    return (
      <div className="card p-5">
        <p className="font-semibold">인증 메일을 보냈어요</p>
        <p className="mt-2 text-sm text-muted">
          {state.sentTo} 메일함에서 인증 링크를 눌러 주세요. 그다음 로그인하면 감독 승인을 기다리는 화면이 나와요. 메일이 안 보이면 스팸함도
          확인해 주세요.
        </p>
        <Link href="/login" className="btn-primary mt-4 w-full">
          로그인 화면으로
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm text-muted">팀에서 부르는 이름</span>
        <input name="display_name" maxLength={20} required autoComplete="nickname" placeholder="예) 김주장" className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-sm text-muted">이메일</span>
        <input name="email" type="email" autoComplete="email" required className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-sm text-muted">비밀번호 ({MIN_PASSWORD}자 이상)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required className="input mt-1" />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "보내는 중…" : "기록원 신청"}
      </button>
    </form>
  );
}
