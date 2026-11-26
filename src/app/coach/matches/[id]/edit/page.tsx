import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/matches";
import { updateMatch } from "../../actions";
import { MatchForm } from "../../match-form";
import { BackLink } from "../../ui";
import { loadMatch } from "../../load";
import { DeleteMatch } from "./delete-match";
import { getRole } from "@/lib/role";

export const metadata = { title: "경기 정보 · pitch-note" };

export default async function EditMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { match, events, roster } = await loadMatch(id);
  const supabase = await createClient();
  const { data } = await supabase.from("matches").select("opponent").order("played_on", { ascending: false }).limit(30);
  const isCoach = (await getRole()) === "coach";
  const recent = [...new Set((data ?? []).map((m) => m.opponent))].slice(0, 5);

  return (
    <main className="pt-6">
      <BackLink href={`/coach/matches/${id}`}>경기로</BackLink>
      <h1 className="mt-2 mb-6 text-2xl font-bold">경기 정보</h1>
      <MatchForm
        action={updateMatch.bind(null, id)}
        match={match}
        today={todayKST()}
        recentOpponents={recent}
        submitLabel="저장"
        upcoming={match.status === "scheduled"}
      />
      {isCoach ? (
        <DeleteMatch id={id} summary={`출석 ${roster.length}명, 골·실점 기록 ${events.length}개`} />
      ) : (
        <p className="mt-10 border-t border-line pt-6 text-sm text-muted">경기 삭제는 감독만 할 수 있어요.</p>
      )}
    </main>
  );
}
