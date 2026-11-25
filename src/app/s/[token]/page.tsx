import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMatchDate, matchTypeLabel } from "@/lib/matches";
import { seasonRecord } from "@/lib/dashboard";
import { getSharedOverview, resultLabel } from "@/lib/share";
import { sharePath } from "@/lib/site";
import { GoalDiffBars } from "@/components/goal-diff-bars";
import { ResultBadge } from "./ui";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const o = await getSharedOverview(token);
  const last = o?.matches[0];
  if (!o || !last) return { title: "우리 팀 기록 · pitch-note" };
  const title = `vs ${last.opponent} ${last.our_score}:${last.their_score} ${resultLabel(last.our_score, last.their_score)}`;
  const description = [last.mvp_name && `MVP ${last.mvp_name}`, o.next_focus.length && `다음 경기 포인트: ${o.next_focus.join(" / ")}`]
    .filter(Boolean)
    .join(" · ");
  return { title: `${title} · pitch-note`, description, openGraph: { title, description, type: "website" } };
}

// 선수용 첫 화면: 지난 경기, 다음 경기 포인트, 시즌 흐름, 내 기록 보기
export default async function SharedHome({ params }: Props) {
  const { token } = await params;
  const o = await getSharedOverview(token);
  if (!o) notFound();

  const last = o.matches[0];
  const season = last ? o.matches.filter((m) => m.season_id === last.season_id) : [];
  const record = seasonRecord(season.map((m) => ({ ...m, created_at: "" })));
  const trend = season.slice(0, 10).reverse();

  return (
    <main className="space-y-4">
      <p className="text-sm font-semibold text-pitch">pitch-note · 우리 팀 기록</p>

      {!last && <p className="card p-6 text-center text-sm text-muted">아직 기록된 경기가 없어요.</p>}

      {last && (
        <Link href={sharePath(token, { match: last.id })} className="card block p-5">
          <p className="text-xs text-muted">
            지난 경기 · {formatMatchDate(last.played_on)} · {matchTypeLabel(last.match_type)}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xl font-bold">vs {last.opponent}</p>
            <p className="flex shrink-0 items-center gap-2 text-3xl font-bold tabular-nums">
              {last.our_score}:{last.their_score}
              <ResultBadge our={last.our_score} their={last.their_score} />
            </p>
          </div>
          {last.mvp_name && (
            <p className="mt-3 text-sm">
              <span className="mr-2 rounded-full bg-pitch-soft px-2 py-0.5 text-xs font-semibold text-pitch">MVP</span>
              {last.mvp_name}
            </p>
          )}
          <p className="mt-3 text-sm font-medium text-pitch">경기 리뷰 보기 →</p>
        </Link>
      )}

      {o.next_focus.length > 0 && (
        <section className="rounded-2xl bg-pitch-soft p-5">
          <h2 className="text-sm font-semibold text-pitch">다음 경기 포인트</h2>
          <ol className="mt-2 space-y-2">
            {o.next_focus.map((f, i) => (
              <li key={i} className="flex gap-3 text-lg font-semibold">
                <span className="text-pitch">{i + 1}</span>
                <span>{f}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {season.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">이번 시즌</h2>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {record.w}
            <span className="mx-1 text-base font-medium text-muted">승</span>
            {record.d}
            <span className="mx-1 text-base font-medium text-muted">무</span>
            {record.l}
            <span className="ml-1 text-base font-medium text-muted">패</span>
            <span className="ml-3 text-base font-medium text-muted">
              {record.gf}골 {record.ga}실점
            </span>
          </p>
          {trend.length >= 2 && (
            <div className="mt-3">
              <GoalDiffBars
                hrefBase={`/s/${token}/m/`}
                matches={trend.map((m) => ({
                  id: m.id,
                  label: `${formatMatchDate(m.played_on)} ${m.opponent} ${m.our_score}:${m.their_score}`,
                  diff: m.our_score - m.their_score,
                }))}
              />
            </div>
          )}
        </section>
      )}

      {o.players.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">내 기록 보기</h2>
          <p className="text-xs text-muted">내 이름을 누르면 경기별 내 기록이 나와요.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {o.players.map((p) => (
              <Link key={p.id} href={sharePath(token, { player: p.id })} className="btn-ghost min-h-12 px-2 text-sm">
                <span className="truncate">{p.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {o.matches.length > 1 && (
        <section className="card p-4">
          <h2 className="font-semibold">지난 경기들</h2>
          <ul className="mt-2 divide-y divide-line">
            {o.matches.slice(1, 20).map((m) => (
              <li key={m.id}>
                <Link href={sharePath(token, { match: m.id })} className="flex min-h-12 items-center gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted">{formatMatchDate(m.played_on)}</span>
                  <span className="min-w-0 flex-1 truncate">{m.opponent}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {m.our_score}:{m.their_score}
                  </span>
                  <ResultBadge our={m.our_score} their={m.their_score} small />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
