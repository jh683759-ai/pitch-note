import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dDayLabel, formatKickoff, formatMatchDate, matchTypeLabel, type Match, type MatchNote, type RsvpAnswer } from "@/lib/matches";
import { positionLabel } from "@/lib/players";
import { loadActivePlayers } from "../load";
import { BackLink } from "../ui";
import { FinishButton, RsvpBoard } from "./rsvp-board";

/** 다가오는 경기: 계획 → 참석 응답 → (경기 후) 결과 기록. 지금 할 일 하나만 강조한다. */
export async function UpcomingHub({ match, notes, isCoach }: { match: Match; notes: MatchNote[]; isCoach: boolean }) {
  const supabase = await createClient();
  const [players, rsvpRes, lineupRes, resRes, membersRes] = await Promise.all([
    loadActivePlayers(),
    supabase.from("match_rsvp").select("player_id, answer, answered_by").eq("match_id", match.id),
    // 감독만 보인다 (RLS)
    supabase.from("match_lineup").select("player_id, position, squad").eq("match_id", match.id),
    supabase.from("match_resources").select("sort_order, resource:resources(id, title, url)").eq("match_id", match.id).order("sort_order"),
    supabase.from("members").select("user_id, player_id").eq("status", "player"),
  ]);
  const rsvp = new Map((rsvpRes.data ?? []).map((r) => [r.player_id, r]));
  const accountOf = new Map((membersRes.data ?? []).map((m) => [m.player_id, m.user_id]));
  const lineup = lineupRes.data ?? [];
  const resources = (resRes.data ?? []).map((r) => r.resource).filter((r) => r != null);
  const points = notes.filter((n) => n.kind === "plan");
  const scout = notes.filter((n) => n.kind === "scout");
  const hasPlan = points.length + scout.length + resources.length + lineup.length > 0;
  const name = new Map(players.map((p) => [p.id, p.name]));

  // 고정 멤버 + 응답한 용병
  const rows = players
    .filter((p) => p.membership === "regular" || rsvp.has(p.id))
    .map((p) => {
      const r = rsvp.get(p.id);
      return {
        id: p.id,
        name: p.name,
        jersey: p.jersey_number,
        guest: p.membership === "guest",
        answer: (r?.answer ?? null) as RsvpAnswer | null,
        byPlayer: !!r && !!r.answered_by && r.answered_by === accountOf.get(p.id),
      };
    });

  const kickoff = formatKickoff(match.kickoff_time);
  const squads = [1, 2, 3]
    .map((s) => ({ s, names: lineup.filter((l) => l.squad === s).map((l) => `${name.get(l.player_id) ?? "?"}${l.position ? `(${positionLabel(l.position)})` : ""}`) }))
    .filter((x) => x.names.length > 0);
  const noSquad = lineup.filter((l) => !l.squad && l.position);

  return (
    <main className="pt-6 pb-10">
      <BackLink href="/coach/matches">경기 목록</BackLink>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-pitch">다음 경기 · {dDayLabel(match.played_on)}</p>
          <h1 className="truncate text-2xl font-bold">vs {match.opponent}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatMatchDate(match.played_on)}
            {kickoff ? ` ${kickoff}` : ""} · {matchTypeLabel(match.match_type)}
            {match.venue ? ` · ${match.venue}` : ""}
          </p>
        </div>
        <Link href={`/coach/matches/${match.id}/edit`} className="shrink-0 py-1 text-sm text-muted">
          수정
        </Link>
      </div>

      {/* 1. 경기 계획 */}
      <section className={`card mt-4 p-4 ${isCoach && !hasPlan ? "border-pitch ring-1 ring-pitch/30" : ""}`}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">경기 계획</h2>
          {isCoach && (
            <Link href={`/coach/matches/${match.id}/plan`} className={`min-h-10 content-center px-1 text-sm ${hasPlan ? "text-muted" : "font-semibold text-pitch"}`}>
              {hasPlan ? "고치기" : "쓰기"} →
            </Link>
          )}
        </div>
        {!hasPlan ? (
          <p className="text-sm text-muted">팀 포인트 1~3개면 충분해요. 선수 내 페이지 맨 위에 떠요.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {points.length > 0 && (
              <ol className="space-y-1">
                {points.map((n, i) => (
                  <li key={n.id} className="flex gap-2 font-semibold">
                    <span className="text-pitch">{i + 1}</span>
                    {n.body}
                  </li>
                ))}
              </ol>
            )}
            {scout.length > 0 && (
              <ul className="space-y-1">
                {scout.map((n) => (
                  <li key={n.id} className="flex gap-2">
                    <span className="shrink-0 text-muted">상대</span>
                    <span className="flex-1">{n.body}</span>
                    <span className={`shrink-0 text-xs ${n.visibility === "team" ? "text-pitch" : "text-muted"}`}>
                      {n.visibility === "team" ? "팀 공개" : "감독만"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {resources.length > 0 && (
              <p className="text-muted">
                자료 ·{" "}
                {resources.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && ", "}
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline">
                      {r.title}
                    </a>
                  </span>
                ))}
              </p>
            )}
            {(squads.length > 0 || noSquad.length > 0) && (
              <div className="space-y-0.5 text-muted">
                {squads.map((x) => (
                  <p key={x.s}>
                    <span className="mr-1 font-semibold text-foreground">{x.s}조</span>
                    {x.names.join(" ")}
                  </p>
                ))}
                {noSquad.length > 0 && (
                  <p>{noSquad.map((l) => `${name.get(l.player_id) ?? "?"}(${positionLabel(l.position)})`).join(" ")}</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2. 참석 응답 */}
      <section className="card mt-4 p-4">
        <h2 className="mb-2 font-semibold">참석 응답</h2>
        <RsvpBoard matchId={match.id} rows={rows} editable={isCoach} />
        <p className="mt-2 text-xs text-muted">선수 계정이 있으면 내 페이지에서 직접 눌러요. 경기 후 출석 입력의 기본값이 돼요.</p>
      </section>

      {/* 3. 경기 후 */}
      <FinishButton matchId={match.id} />
    </main>
  );
}
