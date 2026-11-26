import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dDayLabel, formatKickoff, formatMatchDate, todayKST } from "@/lib/matches";

/**
 * 홈: 다가오는 경기 하나 + 참석 현황 막대 + 그 경기에 가져갈 포인트(children)를 한 카드로.
 * 다가오는 경기가 없으면 포인트만 따로 보이고, 감독에게는 만들기 링크.
 */
export async function UpcomingStrip({ isCoach, children }: { isCoach: boolean; children?: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data: m }, { data: players }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, played_on, kickoff_time, opponent, match_rsvp(answer, player_id), match_notes(kind)")
      .eq("status", "scheduled")
      .gte("played_on", todayKST())
      .order("played_on")
      .order("kickoff_time", { nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("players").select("id, is_active, membership"),
  ]);

  if (!m) {
    return (
      <>
        {isCoach && (
          <Link
            href="/coach/matches/new?upcoming=1"
            className="flex min-h-12 items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted"
          >
            <span className="min-w-0 flex-1">다음 경기 계획을 미리 만들면 선수들이 준비하고 참석을 눌러요</span>
            <span className="shrink-0 font-semibold text-pitch">+ 다음 경기</span>
          </Link>
        )}
        {children && <section className="card px-4 py-3">{children}</section>}
      </>
    );
  }

  // 고정 멤버 + 응답한 용병 (경기 준비 화면과 같은 기준)
  const answered = new Map(m.match_rsvp.map((r) => [r.player_id, r.answer]));
  const roster = (players ?? []).filter((p) => (p.is_active && p.membership === "regular") || answered.has(p.id));
  const yes = m.match_rsvp.filter((r) => r.answer === "yes").length;
  const no = m.match_rsvp.length - yes;
  const waiting = roster.filter((p) => !answered.has(p.id)).length;
  const total = Math.max(roster.length, m.match_rsvp.length, 1);
  const hasPlan = m.match_notes.some((n) => n.kind === "plan");
  const kickoff = formatKickoff(m.kickoff_time);

  return (
    <section className="card overflow-hidden">
      <Link href={`/coach/matches/${m.id}`} className="block p-4">
        <span className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pitch-soft text-[13px] font-bold text-pitch">
            {dDayLabel(m.played_on)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">vs {m.opponent}</span>
            <span className="block truncate text-[13px] text-muted">
              {formatMatchDate(m.played_on)}
              {kickoff ? ` ${kickoff}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-pitch">{isCoach && !hasPlan ? "계획 쓰기 ›" : <span className="text-muted">›</span>}</span>
        </span>
        <span className="mt-3 flex justify-between gap-2 text-[13px]">
          <span className="truncate">
            <b className="text-pitch">갈게요 {yes}</b>
            <span className="text-muted">
              {no ? ` · 못 가요 ${no}` : ""}
              {waiting ? ` · 미응답 ${waiting}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-muted tabular-nums">
            {yes}/{total}
          </span>
        </span>
        <span aria-hidden className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-line">
          <span className="bg-pitch" style={{ width: `${(yes / total) * 100}%` }} />
          <span className="bg-muted/40" style={{ width: `${(no / total) * 100}%` }} />
        </span>
      </Link>
      {children && <div className="border-t border-line px-4 py-3">{children}</div>}
    </section>
  );
}
