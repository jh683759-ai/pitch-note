import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";
import { TabBar } from "@/components/tab-bar";
import { AccountMenu } from "@/components/account-menu";
import { InstallApp } from "@/components/install-app";

// 선수 계정 화면. 감독·기록원·승인 대기는 /coach가 맡는다.
export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if ((await getRole()) !== "player") redirect("/coach");
  const { data: me } = await supabase.from("members").select("display_name").eq("user_id", user.id).maybeSingle();
  const displayName = me?.display_name ?? String(user.user_metadata?.display_name ?? "");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <span className="font-bold text-pitch">pitch-note</span>
          <AccountMenu initial={displayName.trim().charAt(0) || "나"} role={`${displayName || "내 계정"} · 선수`} />
        </div>
      </header>
      <div className="mx-auto max-w-xl px-4 pt-6 pb-28">
        <InstallApp />
        {children}
      </div>
      <TabBar
        tabs={[
          { href: "/me", label: "내 기록", icon: "home" },
          { href: "/me/train", label: "연습", icon: "plus", primary: true },
          { href: "/me/resources", label: "자료", icon: "doc" },
        ]}
        showOn={["/me", "/me/resources"]}
      />
    </div>
  );
}
