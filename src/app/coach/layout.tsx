import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";
import { logout } from "@/app/login/actions";
import { CoachNav } from "./nav";
import { RequestAccess } from "./request-access";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = await getRole();
  if (role === "player") redirect("/me");

  if (role === "pending" || role === "none") {
    const { data: me } = await supabase.from("members").select("display_name, wants").maybeSingle();
    const asPlayer = me?.wants === "player";
    return (
      <main className="mx-auto max-w-md px-5 py-10">
        {role === "pending" ? (
          <>
            <h1 className="text-xl font-bold">감독 승인을 기다리고 있어요</h1>
            <p className="mt-3 text-sm text-muted">
              {me?.display_name ? `${me.display_name}님, ` : ""}
              {asPlayer ? "선수" : "기록원"} 신청이 감독에게 전달됐어요. 감독이 승인하면 이 화면을 새로고침했을 때{" "}
              {asPlayer ? "내 기록 화면" : "경기 기록 화면"}이 열려요.
            </p>
            <p className="mt-2 text-sm text-muted">기록을 보기만 하려면 단톡방의 공유 링크를 쓰면 돼요. 로그인이 필요 없어요.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">아직 승인되지 않은 계정이에요</h1>
            <p className="mt-3 text-sm text-muted">선수나 기록원으로 신청하면 감독이 확인하고 승인해요.</p>
            <RequestAccess defaultName={String(user.user_metadata?.display_name ?? "")} />
            <details className="mt-8 text-xs text-muted">
              <summary className="cursor-pointer">감독 계정을 처음 등록하는 경우</summary>
              <p className="mt-2">Supabase SQL Editor에서 아래 한 줄을 실행하세요.</p>
              <pre className="card mt-2 overflow-x-auto p-3">
                {`insert into public.coaches (user_id, display_name)\nvalues ('${user.id}', '감독');`}
              </pre>
            </details>
          </>
        )}
        <form action={logout} className="mt-6">
          <button className="btn-ghost w-full">로그아웃</button>
        </form>
      </main>
    );
  }

  const isCoach = role === "coach";
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            {/* 홈 탭과 같은 동작이 겹쳐서 로고는 링크가 아니다 */}
            <span className="font-bold text-pitch">pitch-note</span>
            <CoachNav isCoach={isCoach} />
          </div>
          <div className="flex items-center gap-3">
            {!isCoach && <span className="rounded-full bg-pitch-soft px-2 py-0.5 text-xs font-semibold text-pitch">기록원</span>}
            <form action={logout}>
              <button className="text-sm text-muted">로그아웃</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-xl px-4 pb-24">{children}</div>
    </div>
  );
}
