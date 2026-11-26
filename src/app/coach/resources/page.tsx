import { createClient } from "@/lib/supabase/server";
import { positionLabel } from "@/lib/players";
import { archiveResource } from "./actions";
import { ResourceForm } from "./resource-form";

export const metadata = { title: "자료 · pitch-note" };

// 선수용 자료: 링크만 저장. 선수 계정이 있는 선수 중 누가 봤는지가 보인다.
export default async function CoachResourcesPage() {
  const supabase = await createClient();
  const [resRes, viewRes, playersRes, membersRes] = await Promise.all([
    supabase.from("resources").select("*").eq("is_archived", false).order("created_at", { ascending: false }),
    supabase.from("resource_views").select("resource_id, player_id"),
    supabase.from("players").select("id, name, main_position, is_active").eq("is_active", true).order("name"),
    supabase.from("members").select("player_id").eq("status", "player"),
  ]);
  for (const r of [resRes, viewRes, playersRes, membersRes]) if (r.error) throw r.error;

  const players = playersRes.data ?? [];
  const name = new Map(players.map((p) => [p.id, p.name]));
  // '봤어요'는 선수 계정이 있어야 누를 수 있다
  const linked = players.filter((p) => (membersRes.data ?? []).some((m) => m.player_id === p.id));
  const views = viewRes.data ?? [];

  const items = (resRes.data ?? []).map((r) => {
    const targets = linked.filter(
      (p) => r.audience === "team" || (r.audience === "position" && p.main_position === r.position) || r.player_id === p.id,
    );
    const seenBy = new Set(views.filter((v) => v.resource_id === r.id).map((v) => v.player_id));
    const notYet = targets.filter((p) => !seenBy.has(p.id));
    const who =
      r.audience === "team" ? "팀 전체" : r.audience === "position" ? positionLabel(r.position) : (name.get(r.player_id ?? "") ?? "선수");
    return { ...r, who, seen: targets.length - notYet.length, total: targets.length, notYet };
  });

  return (
    <main className="space-y-4 pt-6">
      <div>
        <h1 className="text-2xl font-bold">선수용 자료</h1>
        <p className="mt-1 text-sm text-muted">팁이나 훈련 영상 링크를 올리면 선수 내 페이지에 최신 3개만 떠요.</p>
      </div>
      <ResourceForm players={players.map((p) => ({ id: p.id, name: p.name }))} />
      {items.length > 0 && (
        <ul className="card divide-y divide-line">
          {items.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.title} ↗</span>
                  <span className="block text-xs text-muted">
                    {r.who}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                </a>
                <span className="shrink-0 text-sm tabular-nums">
                  {r.total > 0 ? `봤어요 ${r.seen}/${r.total}` : <span className="text-muted">계정 연결된 선수 없음</span>}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="truncate text-xs text-muted">
                  {r.notYet.length > 0 && r.notYet.length <= 6 ? `아직: ${r.notYet.map((p) => p.name).join(", ")}` : ""}
                </span>
                <form action={archiveResource.bind(null, r.id)}>
                  <button className="min-h-10 px-1 text-xs text-muted">내리기</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
