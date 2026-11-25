import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { positionLabel, type Player } from "@/lib/players";

export const metadata = { title: "선수 · pitch-note" };

export default async function PlayersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .order("jersey_number", { ascending: true, nullsFirst: false })
    .order("name");

  if (error) {
    return <p className="mt-8 text-danger">선수 목록을 불러오지 못했어요: {error.message}</p>;
  }

  const players = data ?? [];
  const regulars = players.filter((p) => p.is_active && p.membership === "regular");
  const guests = players.filter((p) => p.is_active && p.membership === "guest");
  const archived = players.filter((p) => !p.is_active);

  return (
    <main className="pt-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">선수</h1>
          <p className="mt-1 text-sm text-muted">
            고정 {regulars.length}명 · 용병 {guests.length}명
          </p>
        </div>
        <Link href="/coach/players/new" className="btn-primary">
          + 선수 추가
        </Link>
      </div>

      {players.length === 0 && (
        <div className="card mt-8 p-6 text-center">
          <p className="font-medium">아직 선수가 없어요</p>
          <p className="mt-1 text-sm text-muted">고정 멤버부터 등록하세요. 용병은 경기 날 추가해도 돼요.</p>
        </div>
      )}

      <PlayerSection title="고정 멤버" players={regulars} />
      <PlayerSection title="용병" players={guests} />

      {archived.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted">보관한 선수 {archived.length}명</summary>
          <PlayerSection players={archived} muted />
        </details>
      )}
    </main>
  );
}

function PlayerSection({ title, players, muted }: { title?: string; players: Player[]; muted?: boolean }) {
  if (players.length === 0) return null;
  return (
    <section className="mt-6">
      {title && <h2 className="mb-2 text-sm font-semibold text-muted">{title}</h2>}
      <ul className={`card divide-y divide-line ${muted ? "opacity-60" : ""}`}>
        {players.map((p) => (
          <li key={p.id}>
            <Link href={`/coach/players/${p.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pitch-soft font-bold text-pitch tabular-nums">
                {p.jersey_number ?? "-"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                {p.coach_note && <span className="block truncate text-xs text-muted">{p.coach_note}</span>}
              </span>
              <span className="text-sm text-muted">{positionLabel(p.main_position)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
