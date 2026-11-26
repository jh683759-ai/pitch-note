import { createClient } from "@/lib/supabase/server";
import { formatKickoff, formatMatchDate } from "@/lib/matches";
import { loadActivePlayers, loadMatch } from "../../load";
import { BackLink } from "../../ui";
import { PlanForm } from "./plan-form";

export const metadata = { title: "경기 계획 · pitch-note" };

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params;
  const isNew = (await searchParams).new === "1";
  const supabase = await createClient();
  const [{ match, notes }, players, resRes, linkedRes, lineupRes, prevRes] = await Promise.all([
    loadMatch(id),
    loadActivePlayers(),
    supabase.from("resources").select("id, title, audience, position").eq("is_archived", false).order("created_at", { ascending: false }).limit(30),
    supabase.from("match_resources").select("resource_id").eq("match_id", id).order("sort_order"),
    supabase.from("match_lineup").select("player_id, position, squad").eq("match_id", id),
    // 지난 경기 '다음 경기 포인트'를 가져와 시작점으로
    supabase
      .from("matches")
      .select("match_notes(kind, body, sort_order)")
      .eq("status", "finished")
      .order("played_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  for (const r of [resRes, linkedRes, lineupRes]) if (r.error) throw r.error;

  const lastFocus = (prevRes.data?.match_notes ?? [])
    .filter((n) => n.kind === "next_focus")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((n) => n.body);
  const kickoff = formatKickoff(match.kickoff_time);

  return (
    <main className="pt-6 pb-28">
      <BackLink href={`/coach/matches/${id}`}>경기로</BackLink>
      <h1 className="mt-2 text-2xl font-bold">경기 계획</h1>
      <p className="mt-1 text-sm text-muted">
        {formatMatchDate(match.played_on)}
        {kickoff ? ` ${kickoff}` : ""} vs {match.opponent}
      </p>
      {isNew && <p className="mt-3 rounded-xl bg-pitch-soft px-4 py-3 text-sm text-pitch">다음 경기를 만들었어요. 팀 포인트만 써도 충분해요.</p>}
      <PlanForm
        matchId={id}
        initialPoints={notes.filter((n) => n.kind === "plan").map((n) => n.body)}
        lastFocus={lastFocus}
        initialScout={notes.filter((n) => n.kind === "scout").map((n) => ({ body: n.body, visibility: n.visibility === "team" ? "team" : "coach" }))}
        resources={(resRes.data ?? []).map((r) => ({ id: r.id, title: r.title }))}
        initialResourceIds={(linkedRes.data ?? []).map((r) => r.resource_id)}
        players={players.filter((p) => p.membership === "regular").map((p) => ({ id: p.id, name: p.name, jersey: p.jersey_number, main: p.main_position }))}
        initialLineup={lineupRes.data ?? []}
      />
    </main>
  );
}
