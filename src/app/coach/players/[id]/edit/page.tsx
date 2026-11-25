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

  // 기록이 있는지에 따라 "삭제"를 보여줄지 정한다 (기록 있는 선수는 보관만)
  const { count } = await supabase
    .from("match_attendance")
    .select("match_id", { count: "exact", head: true })
    .eq("player_id", id);

  return (
    <main className="pt-6">
      <Link href={`/coach/players/${player.id}`} className="text-sm text-muted">
        ← {player.name} 기록
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">{player.name}</h1>
      <PlayerForm action={updatePlayer.bind(null, player.id)} player={player} submitLabel="저장" />
      <DangerZone id={player.id} isActive={player.is_active} hasRecords={(count ?? 0) > 0} />
    </main>
  );
}
