import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updatePlayer } from "../../actions";
import { PlayerForm } from "../../player-form";
import { DangerZone } from "./danger-zone";

export const metadata = { title: "선수 수정 · pitch-note" };

export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: player } = await supabase.from("players").select("*").eq("id", id).maybeSingle();
  if (!player) notFound();

  // 기록이 있으면 일반 삭제 대신 보관 또는 '기록까지 함께 삭제'(무엇이 지워지는지 숫자로 보여 준다)
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const head = { count: "exact" as const, head: true };
  const [matches, onCourt, goals, assists, keeper, mvp, notes, account] = await Promise.all([
    count(supabase.from("match_attendance").select("match_id", head).eq("player_id", id)),
    count(supabase.from("goal_event_on_court").select("event_id", head).eq("player_id", id)),
    count(supabase.from("goal_events").select("id", head).eq("scorer_id", id)),
    count(supabase.from("goal_events").select("id", head).eq("assist_id", id)),
    count(supabase.from("goal_events").select("id", head).eq("goalkeeper_id", id)),
    count(supabase.from("matches").select("id", head).eq("mvp_player_id", id)),
    count(supabase.from("match_notes").select("id", head).eq("player_id", id)),
    count(supabase.from("members").select("user_id", head).eq("player_id", id)),
  ]);
  const hasRecords = matches + onCourt + goals + assists + keeper + mvp + notes > 0;

  return (
    <main className="pt-6">
      <Link href={`/coach/players/${player.id}`} className="text-sm text-muted">
        ← {player.name} 기록
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">{player.name}</h1>
      <PlayerForm action={updatePlayer.bind(null, player.id)} player={player} submitLabel="저장" />
      <DangerZone
        id={player.id}
        name={player.name}
        isActive={player.is_active}
        records={hasRecords ? { matches, goals, assists, mvp, account: account > 0 } : null}
      />
    </main>
  );
}
