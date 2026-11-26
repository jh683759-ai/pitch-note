import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata = { title: "선수 가입 · pitch-note" };

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold">선수 가입</h1>
      <p className="mt-1 text-sm text-muted">신청하면 감독이 명단의 내 이름과 연결해서 승인해요.</p>
      <ul className="mt-3 mb-8 space-y-1 text-sm text-muted">
        <li>· 내 경기 기록과 성장 추이를 봐요.</li>
        <li>· 경기마다 내 기록 노트를 써요. 나와 감독만 봐요.</li>
      </ul>
      <SignupForm wants="player" />
      <p className="mt-8 text-center text-sm text-muted">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="text-pitch underline">
          로그인
        </Link>
      </p>
    </main>
  );
}
