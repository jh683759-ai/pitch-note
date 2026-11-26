import Link from "next/link";
import { redirect } from "next/navigation";
import { positionLabel } from "@/lib/players";
import { formatMatchDate } from "@/lib/matches";
import { getMyPage } from "@/lib/me";
import { PlayerGrowth } from "@/components/player-growth";
import { getMyPrep } from "@/lib/prep";
import { ResourceList } from "./resource-list";
import { getMyNextMatch } from "@/lib/next-match";
import { NextMatchCard } from "./next-match-card";

export const metadata = { title: "내 기록 · pitch-note" };

// 선수 첫 화면: 지금 할 일(다음 경기 → 노트 쓰기 → 내 준비 → 자료)이 위, 기록은 아래.
export default async function MyPage({ searchParams }: { searchParams: Promise<{ trained?: string }> }) {
  const [p, prep, next, sp] = await Promise.all([getMyPage(), getMyPrep(), getMyNextMatch(), searchParams]);
  if (!p) redirect("/coach");

  const noted = new Set(p.noted_match_ids);
  const practiced = new Set(prep?.focus_practiced ?? []);
  const trained = sp.trained === "1";

  return (
    <main className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pitch-soft text-lg font-bold text-pitch tabular-nums">
          {p.jersey_number ?? "-"}
        </span>
        <div>
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <p className="text-sm text-muted">{positionLabel(p.main_position)} · 내 기록</p>
        </div>
      </div>

      {next && <NextMatchCard m={next} />}

      {p.todo_match && (
        <Link href={`/me/m/${p.todo_match.id}`} className="card flex items-center gap-3 border-pitch p-4 ring-1 ring-pitch/30">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">기록 노트 쓰기</span>
            <span className="block truncate text-sm text-muted">
              {formatMatchDate(p.todo_match.played_on)} vs {p.todo_match.opponent} · 잘된 점, 아쉬운 점, 다음에 해 볼 것
            </span>
          </span>
          <span className="text-pitch">→</span>
        </Link>
      )}

      {/* 다음 경기 준비: 내 포인트(연습하면 ✓) → 감독님 팀 포인트 → 오늘 연습 기록 */}
      <section className="rounded-2xl bg-pitch-soft p-5">
        <h2 className="text-sm font-semibold text-pitch">{next ? "내 준비" : "다음 경기 준비"}</h2>
        {p.my_focus.length > 0 ? (
          <ol className="mt-2 space-y-2">
            {p.my_focus.map((f, i) => {
              const done = practiced.has(i);
              return (
                <li key={i} className="flex gap-3 text-lg font-semibold">
                  <span className="text-pitch">{done ? "✓" : i + 1}</span>
                  <span>{f}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted">경기 노트에 &lsquo;다음 경기 내 포인트&rsquo;를 쓰면 여기에 떠요.</p>
        )}
        {p.team_focus.length > 0 && !next?.points.length && (
          <div className="mt-4 border-t border-pitch/20 pt-3">
            <p className="text-xs font-semibold text-muted">감독님 팀 포인트</p>
            <ul className="mt-1 space-y-1 text-sm">
              {p.team_focus.map((f, i) => (
                <li key={i}>· {f}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-pitch/20 pt-3">
          <span className="text-sm text-muted">
            {trained ? "저장했어요. " : ""}
            {prep && prep.trainings_since > 0 ? `지난 경기 뒤 연습 ${prep.trainings_since}번` : "지난 경기 뒤 연습 기록 없음"}
          </span>
          <Link href="/me/train" className="btn-primary min-h-10 shrink-0 px-4 text-sm">
            오늘 연습했어요
          </Link>
        </div>
      </section>

      {prep && prep.resources_total > 0 && (
        <section className="card px-4">
          <div className="flex items-baseline justify-between pt-3">
            <h2 className="text-sm font-semibold">
              감독님이 준 자료
              {prep.resources_unseen > 0 && <span className="ml-1 text-pitch">안 본 것 {prep.resources_unseen}</span>}
            </h2>
            {prep.resources_total > prep.resources.length && (
              <Link href="/me/resources" className="text-xs text-muted">
                전체 {prep.resources_total}개 →
              </Link>
            )}
          </div>
          <ResourceList items={prep.resources.filter((r) => !next?.resources.some((x) => x.id === r.id))} />
        </section>
      )}

      <PlayerGrowth
        rows={p.matches.map((r) => ({ ...r, goals: Number(r.goals), assists: Number(r.assists), on_court_for: Number(r.on_court_for) }))}
        coach={false}
        matchHref={(m) => `/me/m/${m}`}
        noted={noted}
      />
    </main>
  );
}
