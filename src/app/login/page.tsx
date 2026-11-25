import { LoginForm } from "./login-form";

export const metadata = { title: "감독 로그인 · pitch-note" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold">감독 로그인</h1>
      <p className="mt-1 mb-8 text-sm text-muted">기록은 감독만 입력해요. 선수는 공유 링크로 봅니다.</p>
      <LoginForm next={next} />
    </main>
  );
}
