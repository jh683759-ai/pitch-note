import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata = { title: "기록원 신청 · pitch-note" };

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold">기록원 신청</h1>
      <p className="mt-1 text-sm text-muted">감독이 경기를 뛰는 날 대신 기록하는 팀원이에요.</p>
      <ul className="mt-3 mb-8 space-y-1 text-sm text-muted">
        <li>· 신청하면 감독이 확인하고 승인해요.</li>
        <li>· 경기 만들기, 출석, 골·실점 기록과 고치기를 할 수 있어요.</li>
        <li>· 기록 삭제는 감독만 할 수 있어요.</li>
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
