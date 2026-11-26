import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatMatchDate } from "@/lib/matches";
import { getSharedMatch, resultLabel } from "@/lib/share";
import { ShareBack } from "../../ui";
import { MatchReview } from "@/components/match-review";

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

export default async function SharedMatchPage({ params }: Props) {
  const { token, matchId } = await params;
  const m = await getSharedMatch(token, matchId);
  if (!m) notFound();

  return (
    <main className="space-y-4">
      <ShareBack token={token} />
      <MatchReview m={m} />
    </main>
  );
}
