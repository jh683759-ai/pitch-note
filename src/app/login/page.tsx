import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "팀 로그인 · pitch-note" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; confirmed?: string }> }) {
  const { next, confirmed } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold">팀 로그인</h1>
      <p className="mt-1 mb-8 text-sm text-muted">감독과 기록원이 로그인해요. 선수는 로그인 없이 단톡방의 공유 링크로 봐요.</p>
      {confirmed && (
        <p className="mb-6 rounded-xl bg-pitch-soft px-4 py-3 text-sm text-pitch">메일 인증이 끝났어요. 로그인하세요.</p>
      )}
      <LoginForm next={next} />
      <div className="mt-8 border-t border-line pt-6 text-center">
        <p className="text-sm text-muted">감독 대신 경기를 기록할 팀원인가요?</p>
        <Link href="/signup" className="btn-ghost mt-2 w-full">
          기록원 신청
        </Link>
      </div>
    </main>
  );
}
