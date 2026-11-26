import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dDayLabel, formatKickoff, formatMatchDate, todayKST } from "@/lib/matches";

/** 홈 맨 위: 다가오는 경기 하나와 참석 응답 수. 없으면 감독에게 만들기 링크만. */
export async function UpcomingStrip({ isCoach }: { isCoach: boolean }) {
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("matches")
    .select("id, played_on, kickoff_time, opponent, match_rsvp(answer), match_notes(kind)")
    .eq("status", "scheduled")
    .gte("played_on", todayKST())
    .order("played_on")
    .order("kickoff_time", { nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!m) {
    return isCoach ? (
      <Link href="/coach/matches/new?upcoming=1" className="flex min-h-12 items-center justify-between rounded-2xl border border-dashed border-line px-4 text-sm text-muted">
        <span>다음 경기 계획을 미리 만들면 선수들이 준비하고 참석을 눌러요</span>
        <span className="shrink-0 pl-2 font-semibold text-pitch">+ 다음 경기</span>
      </Link>
    ) : null;
  }

  const yes = m.match_rsvp.filter((r) => r.answer === "yes").length;
  const no = m.match_rsvp.length - yes;
  const hasPlan = m.match_notes.some((n) => n.kind === "plan");
  const kickoff = formatKickoff(m.kickoff_time);

  return (
    <Link href={`/coach/matches/${m.id}`} className="card flex items-center gap-3 border-pitch p-4 ring-1 ring-pitch/30">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pitch text-xs font-bold text-white dark:text-black">
        {dDayLabel(m.played_on)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">다음 경기 vs {m.opponent}</span>
        <span className="block text-xs text-muted">
          {formatMatchDate(m.played_on)}
          {kickoff ? ` ${kickoff}` : ""}
        </span>
        <span className="block text-xs">
          <span className="font-semibold text-pitch">갈게요 {yes}</span>
          {no ? <span className="text-muted"> · 못 가요 {no}</span> : null}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-pitch">{isCoach && !hasPlan ? "계획 쓰기 →" : "→"}</span>
    </Link>
  );
}
