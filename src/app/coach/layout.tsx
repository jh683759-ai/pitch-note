import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";
import { logout } from "@/app/login/actions";
import { TabBar, type Tab } from "@/components/tab-bar";
import { AccountMenu } from "@/components/account-menu";
import { RequestAccess } from "./request-access";
import { InstallApp } from "@/components/install-app";

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
  const { data: who } = isCoach
    ? await supabase.from("coaches").select("display_name").eq("user_id", user.id).maybeSingle()
    : await supabase.from("members").select("display_name").eq("user_id", user.id).maybeSingle();
  const displayName = who?.display_name ?? String(user.user_metadata?.display_name ?? "");

  // 가운데 '기록'이 경기 직후 가장 많이 누르는 버튼. 기록원은 선수·자료 탭이 없다.
  const tabs: Tab[] = isCoach
    ? [
        { href: "/coach", label: "홈", icon: "home" },
        { href: "/coach/matches", label: "경기", icon: "calendar" },
        { href: "/coach/matches/new", label: "기록", icon: "plus", primary: true },
        { href: "/coach/players", label: "선수", icon: "people" },
        { href: "/coach/resources", label: "자료", icon: "doc" },
      ]
    : [
        { href: "/coach", label: "홈", icon: "home" },
        { href: "/coach/matches/new", label: "기록", icon: "plus", primary: true },
        { href: "/coach/matches", label: "경기", icon: "calendar" },
      ];
  const showTabsOn = ["/coach", "/coach/matches", "/coach/players", "/coach/resources", "/coach/team"];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <span className="font-bold text-pitch">pitch-note</span>
          <AccountMenu
            initial={displayName.trim().charAt(0) || "나"}
            role={`${displayName || "내 계정"} · ${isCoach ? "감독" : "기록원"}`}
            links={isCoach ? [{ href: "/coach/team", label: "팀원 관리" }] : []}
          />
        </div>
      </header>
      <div className="mx-auto max-w-xl px-4 pb-28">
        <InstallApp />
        {children}
      </div>
      <TabBar tabs={tabs} showOn={showTabsOn} />
    </div>
  );
}
