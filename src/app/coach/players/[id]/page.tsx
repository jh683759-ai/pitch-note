import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { membershipLabel, positionLabel } from "@/lib/players";
import { formatMatchDate } from "@/lib/matches";
import { PlayerGrowth, type GrowthRow } from "@/components/player-growth";
import { prepLine } from "@/lib/prep";

export const metadata = { title: "선수 기록 · pitch-note" };

// 선수 페이지: 순위가 아니라 이 선수의 경기별 흐름.
export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [playerRes, logRes, mvpRes, statsRes, notesRes, accountRes, trainRes, prepRes] = await Promise.all([
    supabase.from("players").select("*").eq("id", id).maybeSingle(),
    supabase.from("player_match_log").select("*").eq("player_id", id),
    supabase.from("matches").select("id").eq("mvp_player_id", id),
    supabase
      .from("player_season_stats")
      .select("season_id, attendance_rate, regular_matches")
      .eq("player_id", id),
    // 선수가 직접 쓴 기록 노트 (감독은 읽기만)
    supabase
      .from("player_notes")
      .select("match_id, kind, body, sort_order")
      .eq("player_id", id),
    supabase.from("members").select("user_id").eq("player_id", id).maybeSingle(),
    // 선수가 직접 쓴 개인 훈련 기록 (감독은 읽기만)
    supabase.from("training_logs").select("id, trained_on, body, minutes").eq("player_id", id).order("trained_on", { ascending: false }).order("created_at", { ascending: false }).limit(3),
    supabase.rpc("prep_summary"),
  ]);
  if (playerRes.error) throw playerRes.error;
  const player = playerRes.data;
  if (!player) notFound();
  for (const r of [logRes, mvpRes, statsRes, notesRes, accountRes, trainRes]) if (r.error) throw r.error;

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

  // 선수 노트는 최근 경기 2개만 (많이 보여주면 지금 할 일이 묻힌다)
  const byMatch = new Map<string, { kind: string; body: string; sort_order: number }[]>();
  for (const n of notesRes.data ?? []) byMatch.set(n.match_id, [...(byMatch.get(n.match_id) ?? []), n]);
  const recentNotes = [...ordered]
    .reverse()
    .filter((l) => byMatch.has(l.match_id ?? ""))
    .slice(0, 2)
    .map((l) => ({
      match_id: l.match_id ?? "",
      played_on: l.played_on ?? "",
      opponent: l.opponent ?? "",
      notes: (byMatch.get(l.match_id ?? "") ?? []).sort((a, b) => a.sort_order - b.sort_order),
    }));
  const hasAccount = !!accountRes.data;
  const prep = hasAccount ? prepLine((prepRes.data ?? []).find((r) => r.player_id === id)) : null;
  const trainings = trainRes.data ?? [];

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
              {hasAccount && " · 선수 계정 연결됨"}
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
      {prep && (
        <section className="card mb-4 p-4">
          <h2 className="font-semibold">다음 경기 준비</h2>
          <p className="text-sm text-pitch">{prep}</p>
          <p className="text-xs text-muted">지난 경기 뒤 선수가 직접 쓴 연습 기록이에요. 경기 기록에는 안 들어가요.</p>
          {trainings.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {trainings.map((t) => (
                <li key={t.id}>
                  <span className="mr-1 text-xs text-muted">
                    {formatMatchDate(t.trained_on)}
                    {t.minutes ? ` · ${t.minutes}분` : ""}
                  </span>
                  {t.body ?? "포인트 연습"}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {recentNotes.length > 0 && (
        <section className="card mb-4 p-4">
          <h2 className="font-semibold">선수 기록 노트</h2>
          <p className="text-xs text-muted">{player.name} 선수가 직접 쓴 노트예요. 최근 2경기.</p>
          <ul className="mt-2 divide-y divide-line">
            {recentNotes.map((r) => (
              <li key={r.match_id} className="py-3 text-sm">
                <p className="text-xs text-muted">
                  {formatMatchDate(r.played_on)} vs {r.opponent}
                </p>
                {r.notes.map((n, i) => (
                  <p key={i} className="mt-1">
                    <span className={`mr-1 text-xs font-semibold ${n.kind === "good" ? "text-pitch" : "text-muted"}`}>
                      {n.kind === "good" ? "잘된 점" : n.kind === "improve" ? "아쉬운 점" : "다음 포인트"}
                    </span>
                    {n.body}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      <PlayerGrowth
        rows={rows}
        coach
        matchHref={(m) => `/coach/matches/${m}`}
      />
    </main>
  );
}
