import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { CoachNav } from "./nav";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS로 본인 행만 보이므로, 행이 있으면 감독이다.
  const { data: coach } = await supabase.from("coaches").select("display_name").maybeSingle();

  if (!coach) {
    return (
      <main className="mx-auto max-w-md px-5 py-10">
        <h1 className="text-xl font-bold">감독 등록이 필요해요</h1>
        <p className="mt-3 text-sm text-muted">
          로그인은 됐지만 아직 감독으로 등록되지 않은 계정이에요. Supabase SQL Editor에서 아래 한 줄을 실행하세요.
        </p>
        <pre className="card mt-4 overflow-x-auto p-4 text-xs">
          {`insert into public.coaches (user_id, display_name)\nvalues ('${user.id}', '감독');`}
        </pre>
        <form action={logout} className="mt-6">
          <button className="btn-ghost w-full">로그아웃</button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link href="/coach" className="font-bold text-pitch">
              pitch-note
            </Link>
            <CoachNav />
          </div>
          <form action={logout}>
            <button className="text-sm text-muted">로그아웃</button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-xl px-4 pb-24">{children}</div>
    </div>
  );
}
