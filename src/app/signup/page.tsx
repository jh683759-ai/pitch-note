import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata = { title: "가입 신청 · pitch-note" };

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold">가입 신청</h1>
      <p className="mt-1 text-sm text-muted">신청하면 감독이 확인하고 승인해요.</p>
      <ul className="mt-3 mb-8 space-y-1 text-sm text-muted">
        <li>· 선수: 내 경기 기록과 성장 추이를 보고, 경기마다 내 기록 노트를 써요.</li>
        <li>· 기록원: 감독이 경기를 뛰는 날 대신 출석, 골·실점을 기록해요. 삭제는 감독만 해요.</li>
      </ul>
      <SignupForm />
      <p className="mt-8 text-center text-sm text-muted">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="text-pitch underline">
          로그인
        </Link>
      </p>
    </main>
  );
}
