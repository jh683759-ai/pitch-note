import Link from "next/link";
import { formatMatchDate } from "@/lib/matches";

export type GrowthRow = {
  match_id: string;
  played_on: string;
  opponent: string;
  status: string; // played | bench | absent
  goals: number;
  assists: number;
  on_court_for: number;
  on_court_against?: number; // 감독 화면에만
  mvp: boolean;
};

const RECENT = 5;

/** 최근 5경기 vs 그 전 5경기, 경기당 공격포인트. 출전 6경기 이상일 때만. */
export function growthSummary(rows: GrowthRow[]) {
  const played = rows.filter((r) => r.status === "played"); // 오래된 순
  if (played.length < RECENT + 1) return null;
  const recent = played.slice(-RECENT);
  const before = played.slice(-RECENT * 2, -RECENT);
  const per = (xs: GrowthRow[]) => xs.reduce((s, r) => s + r.goals + r.assists, 0) / xs.length;
  return { recent: per(recent), before: per(before), recentN: recent.length, beforeN: before.length };
}

/**
 * 선수 한 명의 성장 추이. 순위나 다른 선수와의 비교는 없다.
 * coach=false(공유 화면)면 불참 경기와 코트 위 실점이 빠진다.
 */
export function PlayerGrowth({
  rows,
  coach,
  matchHref,
  noted,
}: {
  rows: GrowthRow[]; // 오래된 순
  coach: boolean;
  matchHref: (matchId: string) => string;
  noted?: Set<string>; // 선수 기록 노트를 쓴 경기
}) {
  const visible = coach ? rows : rows.filter((r) => r.status !== "absent");
  const played = visible.filter((r) => r.status === "played");
  const goals = played.reduce((s, r) => s + r.goals, 0);
  const assists = played.reduce((s, r) => s + r.assists, 0);
  const onFor = played.reduce((s, r) => s + r.on_court_for, 0);
  const onAgainst = played.reduce((s, r) => s + (r.on_court_against ?? 0), 0);
  const mvps = visible.filter((r) => r.mvp).length;
  const growth = growthSummary(visible);
  const maxPoints = Math.max(1, ...played.map((r) => r.goals + r.assists));

  if (visible.length === 0) {
    return <p className="card mt-4 p-6 text-center text-sm text-muted">아직 기록된 경기가 없어요.</p>;
  }

  return (
    <div className="space-y-4">
      <section className="card grid grid-cols-4 gap-2 p-4 text-center">
        <Stat label="출전" value={played.length} />
        <Stat label="골" value={goals} />
        <Stat label="어시스트" value={assists} />
        <Stat label="MVP" value={mvps} />
      </section>

      {growth && (
        <section className="rounded-2xl bg-pitch-soft p-4">
          <p className="text-sm">
            최근 {growth.recentN}경기 경기당 공격포인트{" "}
            <b className="text-pitch tabular-nums">{growth.recent.toFixed(1)}</b>
            <span className="text-muted"> · 그 전 {growth.beforeN}경기 {growth.before.toFixed(1)}</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {growth.recent > growth.before
              ? "올라가고 있어요."
              : growth.recent < growth.before
                ? "골이 아니어도 팀에 기여하는 방법은 많아요."
                : "꾸준해요."}
          </p>
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-semibold">{coach ? "코트에 있을 때" : "내가 코트에 있을 때"}</h2>
        {coach ? (
          <p className="mt-1 text-sm">
            우리 골 <b className="tabular-nums">{onFor}</b> · 실점 <b className="tabular-nums">{onAgainst}</b>
            {" · "}
            <span className={`font-semibold tabular-nums ${onFor - onAgainst >= 0 ? "text-pitch" : "text-danger"}`}>
              득실 {onFor - onAgainst > 0 ? "+" : ""}
              {onFor - onAgainst}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm">
            우리 팀이 <b className="tabular-nums">{onFor}골</b>을 넣었어요.
          </p>
        )}
        <p className="mt-1 text-xs text-muted">골·실점이 나온 순간 코트 위 4명에 있었던 기록이에요. 골을 안 넣어도 팀에 기여한 게 보여요.</p>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">경기별</h2>
        {played.length >= 2 && (
          <div className="mt-3 flex h-12 items-end gap-[2px]" aria-hidden>
            {played.map((r) => {
              const pts = r.goals + r.assists;
              return (
                <span
                  key={r.match_id}
                  title={`${formatMatchDate(r.played_on)} ${r.opponent}: 골 ${r.goals} 어시 ${r.assists}`}
                  className={`flex-1 rounded-t-[4px] ${pts > 0 ? "bg-pitch" : "bg-line"}`}
                  style={{ height: pts > 0 ? `${Math.max(12, (pts / maxPoints) * 100)}%` : 3 }}
                />
              );
            })}
          </div>
        )}
        {played.length >= 2 && <p className="mt-1 text-[11px] text-muted">경기별 공격포인트 (오른쪽이 최근)</p>}
        <ul className="mt-3 divide-y divide-line">
          {[...visible].reverse().map((r) => (
            <li key={r.match_id}>
              <Link href={matchHref(r.match_id)} className="flex min-h-12 items-center gap-3 py-2 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted">{formatMatchDate(r.played_on)}</span>
                <span className="min-w-0 flex-1 truncate">{r.opponent}</span>
                {noted?.has(r.match_id) && <span className="shrink-0 text-xs text-muted">노트</span>}
                {r.mvp && <span className="rounded-full bg-pitch-soft px-2 py-0.5 text-xs font-semibold text-pitch">MVP</span>}
                <span className="shrink-0 text-right tabular-nums">
                  {r.status === "played" ? (
                    <>
                      {r.goals > 0 && <span className="mr-2">골 {r.goals}</span>}
                      {r.assists > 0 && <span className="mr-2">어시 {r.assists}</span>}
                      {coach && (
                        <span className="text-xs text-muted">
                          +{r.on_court_for} −{r.on_court_against ?? 0}
                        </span>
                      )}
                      {!coach && r.goals + r.assists === 0 && <span className="text-xs text-muted">출전</span>}
                    </>
                  ) : (
                    <span className={`text-xs ${r.status === "absent" ? "text-danger" : "text-muted"}`}>
                      {r.status === "bench" ? "벤치" : "불참"}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
