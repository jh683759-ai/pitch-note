import { createClient } from "@/lib/supabase/server";
import { formatMatchDate, type AttendanceStatus } from "@/lib/matches";
import { loadActivePlayers, loadMatch } from "../../load";
import { BackLink } from "../../ui";
import { AttendanceForm } from "./attendance-form";

export const metadata = { title: "출석 · pitch-note" };

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const supabase = await createClient();
  const [{ match, roster, events }, active, prev] = await Promise.all([
    loadMatch(id),
    loadActivePlayers(),
    supabase.rpc("previous_attendance", { p_match_id: id }),
  ]);

  // 활동 중인 선수 + 이미 이 경기 명단에 있는 보관 선수
  const players = [...active];
  for (const r of roster) if (!players.some((p) => p.id === r.player.id)) players.push(r.player);

  // 골·실점 기록에 이름이 있는 선수 (출전에서 못 뺀다)
  const locked = new Set<string>();
  for (const e of events) {
    for (const pid of [e.scorer_id, e.assist_id, e.goalkeeper_id, ...e.onCourt]) if (pid) locked.add(pid);
  }

  const previous = prev.data ?? [];
  const source = previous[0];

  return (
    <main className="pt-6 pb-8">
      <BackLink href={`/coach/matches/${id}`}>경기로</BackLink>
      <h1 className="mt-2 text-2xl font-bold">출석</h1>
      <p className="mt-1 text-sm text-muted">
        {formatMatchDate(match.played_on)} · {match.opponent}
      </p>
      <AttendanceForm
        matchId={id}
        players={players.map((p) => ({ id: p.id, name: p.name, jersey: p.jersey_number, membership: p.membership }))}
        initial={Object.fromEntries(roster.map((r) => [r.player.id, r.status]))}
        previous={
          source
            ? {
                label: `${formatMatchDate(source.source_played_on)} ${source.source_opponent}`,
                rows: Object.fromEntries(previous.map((r) => [r.player_id, r.status as AttendanceStatus])),
              }
            : null
        }
        locked={[...locked]}
        suggestCopy={Boolean(isNew) && roster.length === 0}
      />
    </main>
  );
}
