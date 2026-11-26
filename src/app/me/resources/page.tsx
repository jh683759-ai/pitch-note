import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/app/coach/matches/ui";
import { ResourceList } from "../resource-list";

export const metadata = { title: "자료 · pitch-note" };

// 나에게 온 자료 전체 (RLS가 팀·내 포지션·나에게 온 것만 돌려준다)
export default async function MyResourcesPage() {
  const supabase = await createClient();
  const [resRes, viewRes] = await Promise.all([
    supabase.from("resources").select("id, title, url, note, created_at").order("created_at", { ascending: false }),
    supabase.from("resource_views").select("resource_id"),
  ]);
  if (resRes.error) throw resRes.error;
  if (viewRes.error) throw viewRes.error;
  const seen = new Set((viewRes.data ?? []).map((v) => v.resource_id));
  const items = (resRes.data ?? []).map((r) => ({ ...r, seen: seen.has(r.id) }));

  return (
    <main className="space-y-4">
      <BackLink href="/me">내 기록</BackLink>
      <h1 className="text-xl font-bold">감독님이 준 자료</h1>
      {items.length === 0 ? (
        <p className="card p-4 text-sm text-muted">아직 받은 자료가 없어요.</p>
      ) : (
        <section className="card px-4">
          <ResourceList items={items} />
        </section>
      )}
    </main>
  );
}
