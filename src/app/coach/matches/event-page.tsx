import { formatMatchDate, type Side } from "@/lib/matches";
import { loadMatch } from "./load";
import { BackLink } from "./ui";
import { EventForm } from "./event-form";
import { notFound } from "next/navigation";

/** 골/실점 입력 화면 (새로 만들기·고치기 공용) */
export async function EventPage({
  matchId,
  eventId,
  side,
  saved,
}: {
  matchId: string;
  eventId: string | null;
  side: Side;
  saved?: boolean;
}) {
  const { match, roster, events, tags } = await loadMatch(matchId);
  const event = eventId ? events.find((e) => e.id === eventId) : null;
  if (eventId && !event) notFound();

  const played = roster.filter((r) => r.status === "played").map((r) => r.player);
  // 바로 전 기록의 코트 위 4명과 GK를 그대로 가져온다 (같은 라인이 연달아 뛰는 경우가 대부분)
  const last = events.at(-1);
  const defaultGk = last?.goalkeeper_id ?? played.find((p) => p.main_position === "GK")?.id ?? null;

  const usedTagIds = new Set(event?.tagIds ?? []);
  const visibleTags = tags.filter((t) => t.is_active || usedTagIds.has(t.id));

  const title = event ? `${event.seq}번째 기록 고치기` : side === "for" ? "우리 골" : "실점";

  return (
    <main className="pt-6">
      <BackLink href={`/coach/matches/${matchId}`}>경기로</BackLink>
      <h1 className="mt-2 text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted">
        {formatMatchDate(match.played_on)} · {match.opponent} · {match.our_score ?? 0}:{match.their_score ?? 0}
      </p>
      {saved && (
        <p className="mt-3 rounded-xl bg-pitch-soft px-4 py-2 text-sm text-pitch">저장했어요. 다음 기록을 이어서 적으세요.</p>
      )}
      {played.length === 0 ? (
        <p className="card mt-6 p-6 text-center text-sm text-muted">출석을 먼저 체크하세요. 출전한 선수만 고를 수 있어요.</p>
      ) : (
        <EventForm
          key={event?.id ?? `new-${events.length}`}
          matchId={matchId}
          eventId={event?.id ?? null}
          players={played.map((p) => ({ id: p.id, name: p.name, jersey: p.jersey_number, gk: p.main_position === "GK" }))}
          tags={visibleTags.map((t) => ({ id: t.id, kind: t.kind, label: t.label }))}
          initial={
            event
              ? {
                  side: event.side as Side,
                  scorerId: event.scorer_id,
                  assistId: event.assist_id,
                  isOwnGoal: event.is_own_goal,
                  goalkeeperId: event.goalkeeper_id,
                  tagIds: event.tagIds,
                  onCourt: event.onCourt,
                  note: event.note ?? "",
                }
              : {
                  side,
                  scorerId: null,
                  assistId: null,
                  isOwnGoal: false,
                  goalkeeperId: defaultGk,
                  tagIds: [],
                  onCourt: (last?.onCourt ?? []).filter((id) => played.some((p) => p.id === id) && id !== defaultGk),
                  note: "",
                }
          }
          prefilledFromLast={!event && Boolean(last?.onCourt.length)}
        />
      )}
    </main>
  );
}
