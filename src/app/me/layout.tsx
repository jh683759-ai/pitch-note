import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";
import { logout } from "@/app/login/actions";
import { InstallApp } from "@/components/install-app";

// 선수 계정 화면. 감독·기록원·승인 대기는 /coach가 맡는다.
export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if ((await getRole()) !== "player") redirect("/coach");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <span className="font-bold text-pitch">pitch-note</span>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-pitch-soft px-2 py-0.5 text-xs font-semibold text-pitch">선수</span>
            <form action={logout}>
              <button className="text-sm text-muted">로그아웃</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-xl px-4 pt-6 pb-24">
        <InstallApp />
        {children}
      </div>
    </div>
  );
}
