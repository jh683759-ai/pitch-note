import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dDayLabel, formatKickoff, formatMatchDate, resultOf } from "@/lib/matches";
import { getRole } from "@/lib/role";

export const metadata = { title: "경기 · pitch-note" };

export default async function MatchesPage() {
  const supabase = await createClient();
  const [{ data, error }, upcomingRes, role] = await Promise.all([
    supabase.from("match_summary").select("*").neq("status", "scheduled").order("played_on", { ascending: false }).limit(50),
    supabase
      .from("matches")
      .select("id, played_on, kickoff_time, opponent, venue, match_rsvp(answer)")
      .eq("status", "scheduled")
      .order("played_on")
      .order("kickoff_time", { nullsFirst: false }),
    getRole(),
  ]);

  if (error) return <p className="mt-8 text-danger">경기 목록을 불러오지 못했어요: {error.message}</p>;
  const matches = data ?? [];
  const upcoming = upcomingRes.data ?? [];

  return (
    <main className="pt-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">경기</h1>
          {matches.length > 0 && <p className="mt-1 text-sm text-muted">{matches.length}경기 기록</p>}
        </div>
        <div className="flex gap-2">
          {role === "coach" && (
            <Link href="/coach/matches/new?upcoming=1" className="btn-ghost px-4">
              + 다음 경기
            </Link>
          )}
          <Link href="/coach/matches/new" className="btn-primary px-4">
            + 경기 기록
          </Link>
        </div>
      </div>

      {/* 다가오는 경기: 계획과 참석 응답 */}
      {upcoming.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">다가오는 경기</h2>
          <ul className="space-y-2">
            {upcoming.map((m) => {
              const yes = m.match_rsvp.filter((r) => r.answer === "yes").length;
              const no = m.match_rsvp.length - yes;
              return (
                <li key={m.id}>
                  <Link href={`/coach/matches/${m.id}`} className="card flex min-h-16 items-center gap-3 border-pitch/40 px-4 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pitch text-xs font-bold text-white dark:text-black">
                      {dDayLabel(m.played_on)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">vs {m.opponent}</span>
                      <span className="block text-xs text-muted">
                        {formatMatchDate(m.played_on)}
                        {m.kickoff_time ? ` ${formatKickoff(m.kickoff_time)}` : ""}
                      </span>
                    </span>
                    <span className="text-right text-sm">
                      <span className="block font-semibold text-pitch">갈게요 {yes}</span>
                      {no > 0 && <span className="block text-xs text-muted">못 가요 {no}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {matches.length > 0 && upcoming.length > 0 && <h2 className="mt-6 -mb-4 text-sm font-semibold text-muted">지난 경기</h2>}

      {matches.length === 0 && (
        <div className="card mt-8 p-6 text-center">
          <p className="font-medium">아직 기록한 경기가 없어요</p>
          <p className="mt-1 text-sm text-muted">경기가 끝나면 5분이면 돼요. 출석 → 골·실점 → 메모 순서예요.</p>
        </div>
      )}

      <ul className="mt-6 space-y-2">
        {matches.map((m) => {
          const result = resultOf(m.our_score, m.their_score, Number(m.players_played ?? 0));
          const missing = Number(m.events_missing ?? 0);
          const noRoster = Number(m.players_played ?? 0) === 0;
          return (
            <li key={m.match_id}>
              <Link href={`/coach/matches/${m.match_id}`} className="card flex min-h-16 items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    result === "승" ? "bg-pitch-soft text-pitch" : result === "패" ? "bg-danger/10 text-danger" : "bg-line/60"
                  }`}
                >
                  {result ?? "-"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.opponent}</span>
                  <span className="block text-xs text-muted">{formatMatchDate(m.played_on)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-lg font-bold tabular-nums">
                    {m.our_score ?? "-"} : {m.their_score ?? "-"}
                  </span>
                  {(noRoster || missing > 0) && (
                    <span className="block text-xs text-danger">{noRoster ? "출석 미입력" : `기록 ${missing}개 남음`}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
