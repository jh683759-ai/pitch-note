import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/matches";
import { createMatch } from "../actions";
import { MatchForm } from "../match-form";
import { BackLink } from "../ui";

export const metadata = { title: "경기 기록 · pitch-note" };

export default async function NewMatchPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("matches").select("opponent").order("played_on", { ascending: false }).limit(30);
  const recent = [...new Set((data ?? []).map((m) => m.opponent))].slice(0, 5);

  return (
    <main className="pt-6">
      <BackLink href="/coach/matches">경기 목록</BackLink>
      <h1 className="mt-2 text-2xl font-bold">경기 기록</h1>
      <p className="mt-1 mb-6 text-sm text-muted">1 경기 정보 → 2 출석 → 3 골·실점 → 4 메모</p>
      <MatchForm action={createMatch} today={todayKST()} recentOpponents={recent} submitLabel="다음: 출석 체크" />
    </main>
  );
}
