import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { membershipLabel, positionLabel } from "@/lib/players";
import { PlayerGrowth, type GrowthRow } from "@/components/player-growth";

export const metadata = { title: "선수 기록 · pitch-note" };

// 선수 페이지: 순위가 아니라 이 선수의 경기별 흐름.
export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [playerRes, logRes, mvpRes, statsRes] = await Promise.all([
    supabase.from("players").select("*").eq("id", id).maybeSingle(),
    supabase.from("player_match_log").select("*").eq("player_id", id),
    supabase.from("matches").select("id").eq("mvp_player_id", id),
    supabase
      .from("player_season_stats")
      .select("season_id, attendance_rate, regular_matches")
      .eq("player_id", id),
  ]);
  if (playerRes.error) throw playerRes.error;
  const player = playerRes.data;
  if (!player) notFound();
  for (const r of [logRes, mvpRes, statsRes]) if (r.error) throw r.error;

  const mvp = new Set((mvpRes.data ?? []).map((m) => m.id));
  const log = logRes.data ?? [];
  // 오래된 경기부터
  const ordered = [...log].sort((a, b) =>
    (a.played_on ?? "").localeCompare(b.played_on ?? ""),
  );
  const rows: GrowthRow[] = ordered.map((l) => ({
    match_id: l.match_id ?? "",
    played_on: l.played_on ?? "",
    opponent: l.opponent ?? "",
    status: l.status ?? "absent",
    goals: Number(l.goals ?? 0),
    assists: Number(l.assists ?? 0),
    on_court_for: Number(l.on_court_for ?? 0),
    on_court_against: Number(l.on_court_against ?? 0),
    mvp: mvp.has(l.match_id ?? ""),
  }));

  // 출석률은 가장 최근 시즌, 고정 멤버로 참가한 경기 기준
  const latestSeason = ordered.at(-1)?.season_id ?? null;
  const season = (statsRes.data ?? []).find(
    (s) => s.season_id === latestSeason,
  );
  const rate =
    season?.attendance_rate != null && Number(season.regular_matches) >= 3
      ? Math.round(Number(season.attendance_rate) * 100)
      : null;

  return (
    <main className="pt-6 pb-10">
      <Link
        href="/coach/players"
        className="inline-flex min-h-10 items-center text-sm text-muted"
      >
        ← 선수 목록
      </Link>
      <div className="mt-1 mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pitch-soft text-lg font-bold text-pitch tabular-nums">
            {player.jersey_number ?? "-"}
          </span>
          <div>
            <h1 className="text-2xl font-bold">{player.name}</h1>
            <p className="text-sm text-muted">
              {positionLabel(player.main_position)} ·{" "}
              {membershipLabel(player.membership)}
              {!player.is_active && " · 보관됨"}
              {rate != null && ` · 출석률 ${rate}%`}
            </p>
          </div>
        </div>
        <Link
          href={`/coach/players/${id}/edit`}
          className="shrink-0 py-1 text-sm text-muted"
        >
          정보 수정
        </Link>
      </div>
      {player.coach_note && (
        <p className="mb-4 rounded-xl bg-background px-3 py-2 text-sm text-muted">
          메모: {player.coach_note}
        </p>
      )}
      <PlayerGrowth
        rows={rows}
        coach
        matchHref={(m) => `/coach/matches/${m}`}
      />
    </main>
  );
}
