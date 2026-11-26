import Link from "next/link";
import { redirect } from "next/navigation";
import { positionLabel } from "@/lib/players";
import { formatMatchDate } from "@/lib/matches";
import { getMyPage } from "@/lib/me";
import { PlayerGrowth } from "@/components/player-growth";

export const metadata = { title: "내 기록 · pitch-note" };

// 선수 첫 화면: 지금 할 일(노트 쓰기, 다음 경기 포인트)이 위, 기록은 아래.
export default async function MyPage() {
  const p = await getMyPage();
  if (!p) redirect("/coach");

  const noted = new Set(p.noted_match_ids);

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

      {(p.my_focus.length > 0 || p.team_focus.length > 0) && (
        <section className="rounded-2xl bg-pitch-soft p-5">
          <h2 className="text-sm font-semibold text-pitch">다음 경기에서</h2>
          {p.my_focus.length > 0 && (
            <ol className="mt-2 space-y-2">
              {p.my_focus.map((f, i) => (
                <li key={i} className="flex gap-3 text-lg font-semibold">
                  <span className="text-pitch">{i + 1}</span>
                  <span>{f}</span>
                </li>
              ))}
            </ol>
          )}
          {p.team_focus.length > 0 && (
            <div className={p.my_focus.length > 0 ? "mt-4 border-t border-pitch/20 pt-3" : "mt-2"}>
              <p className="text-xs font-semibold text-muted">감독님 팀 포인트</p>
              <ul className="mt-1 space-y-1 text-sm">
                {p.team_focus.map((f, i) => (
                  <li key={i}>· {f}</li>
                ))}
              </ul>
            </div>
          )}
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
