import { dDayLabel, formatKickoff, formatMatchDate } from "@/lib/matches";
import { positionLabel } from "@/lib/players";
import type { MyNextMatch } from "@/lib/next-match";
import { ResourceList } from "./resource-list";
import { RsvpButtons } from "./rsvp-buttons";

/** 내 페이지 맨 위: 다가오는 경기 하나. 응답 → 내 자리 → 팀 포인트 → 상대 → 자료. */
export function NextMatchCard({ m }: { m: MyNextMatch }) {
  const kickoff = formatKickoff(m.kickoff_time);
  const lineup = m.my_lineup;
  const myPlace = lineup
    ? [lineup.position ? positionLabel(lineup.position) : null, lineup.squad ? `${lineup.squad}조` : null].filter(Boolean).join(" · ")
    : null;

  return (
    <section className="card overflow-hidden border-pitch ring-1 ring-pitch/30">
      <div className="bg-pitch px-4 py-3 text-white dark:text-black">
        <p className="text-xs font-semibold opacity-80">다음 경기 · {dDayLabel(m.played_on)}</p>
        <p className="text-lg font-bold">vs {m.opponent}</p>
        <p className="text-sm opacity-90">
          {formatMatchDate(m.played_on)}
          {kickoff ? ` ${kickoff}` : ""}
          {m.venue ? ` · ${m.venue}` : ""}
        </p>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <RsvpButtons matchId={m.id} answer={m.my_rsvp?.answer ?? null} />
          <p className="mt-1 text-xs text-muted">
            {m.my_rsvp ? "다시 누르면 취소돼요." : "감독님이 인원을 미리 알 수 있게 눌러 주세요."}
            {m.going > 0 ? ` 지금 ${m.going}명 온대요.` : ""}
          </p>
        </div>

        {myPlace && (
          <p className="text-sm">
            <span className="mr-2 text-xs font-semibold text-muted">내 자리</span>
            <span className="font-semibold">{myPlace}</span>
          </p>
        )}

        {m.points.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted">이번 경기 팀 포인트</p>
            <ol className="mt-1 space-y-1">
              {m.points.map((p, i) => (
                <li key={i} className="flex gap-3 font-semibold">
                  <span className="text-pitch">{i + 1}</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {m.scout.length > 0 && (
          <p className="text-sm">
            <span className="mr-2 text-xs font-semibold text-muted">상대</span>
            {m.scout.join(" · ")}
          </p>
        )}

        {m.resources.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted">경기 전에 볼 자료</p>
            <ResourceList items={m.resources} />
          </div>
        )}
      </div>
    </section>
  );
}
