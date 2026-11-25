import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatMatchDate, matchTypeLabel } from "@/lib/matches";
import { getSharedMatch, resultLabel } from "@/lib/share";
import { ResultBadge, ShareBack } from "../../ui";

type Props = { params: Promise<{ token: string; matchId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token, matchId } = await params;
  const m = await getSharedMatch(token, matchId);
  if (!m) return { title: "경기 리뷰 · pitch-note" };
  const title = `vs ${m.opponent} ${m.our_score}:${m.their_score} ${resultLabel(m.our_score, m.their_score)}`;
  const focus = m.notes.filter((n) => n.kind === "next_focus").map((n) => n.body);
  const description = [
    formatMatchDate(m.played_on),
    m.mvp && `MVP ${m.mvp.name}`,
    focus.length && `다음 경기 포인트: ${focus.join(" / ")}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return { title: `${title} · pitch-note`, description, openGraph: { title, description, type: "article" } };
}

// 선수용 경기 리뷰: 메모가 숫자보다 위에. '팀 공개' 메모만 온다.
export default async function SharedMatchPage({ params }: Props) {
  const { token, matchId } = await params;
  const m = await getSharedMatch(token, matchId);
  if (!m) notFound();

  const good = m.notes.filter((n) => n.kind === "good");
  const improve = m.notes.filter((n) => n.kind === "improve");
  const focus = m.notes.filter((n) => n.kind === "next_focus");
  const ours = m.goals.filter((g) => g.side === "for");

  return (
    <main className="space-y-4">
      <ShareBack token={token} />

      <section className="card p-5 text-center">
        <p className="text-xs text-muted">
          {formatMatchDate(m.played_on)} · {matchTypeLabel(m.match_type)}
          {m.venue ? ` · ${m.venue}` : ""}
        </p>
        <p className="mt-1 text-lg font-semibold">vs {m.opponent}</p>
        <p className="mt-2 flex items-center justify-center gap-3 text-5xl font-bold tabular-nums">
          {m.our_score}
          <span className="text-2xl text-muted">:</span>
          {m.their_score}
        </p>
        <div className="mt-2">
          <ResultBadge our={m.our_score} their={m.their_score} />
        </div>
        {m.mvp && (
          <p className="mt-4 text-base">
            <span className="mr-2 rounded-full bg-pitch px-2.5 py-0.5 text-xs font-bold text-white dark:text-black">MVP</span>
            <b>{m.mvp.name}</b>
          </p>
        )}
      </section>

      {(good.length > 0 || improve.length > 0) && (
        <section className="card space-y-3 p-4">
          {good.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-pitch">잘된 점</h2>
              {good.map((n, i) => (
                <p key={i} className="mt-1 whitespace-pre-line">
                  {n.body}
                </p>
              ))}
            </div>
          )}
          {improve.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold">개선할 점</h2>
              {improve.map((n, i) => (
                <p key={i} className="mt-1 whitespace-pre-line">
                  {n.body}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      {focus.length > 0 && (
        <section className="rounded-2xl bg-pitch-soft p-5">
          <h2 className="text-sm font-semibold text-pitch">다음 경기 포인트</h2>
          <ol className="mt-2 space-y-2">
            {focus.map((f, i) => (
              <li key={i} className="flex gap-3 text-lg font-semibold">
                <span className="text-pitch">{i + 1}</span>
                <span>{f.body}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {ours.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">우리 골</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {ours.map((g) => (
              <li key={g.seq} className="flex gap-2">
                <span className="text-pitch">⚽</span>
                <span className="flex-1">
                  {g.own_goal ? "상대 자책골" : (g.scorer ?? "득점")}
                  {g.assist && <span className="text-muted"> ← {g.assist}</span>}
                  {g.tags.length > 0 && <span className="text-muted"> · {g.tags.join(" · ")}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {good.length + improve.length + focus.length === 0 && (
        <p className="px-1 text-sm text-muted">감독님이 아직 이 경기 리뷰를 공개하지 않았어요.</p>
      )}
    </main>
  );
}
