import { notFound } from "next/navigation";
import { getMyMatch } from "@/lib/me";
import { formatMatchDate } from "@/lib/matches";
import { BackLink } from "@/app/coach/matches/ui";
import { MatchReview } from "@/components/match-review";
import { NoteForm } from "./note-form";

export const metadata = { title: "경기 · pitch-note" };

// 선수 경기 화면: 내 노트 쓰기가 위, 감독님 리뷰('팀 공개')는 아래.
export default async function MyMatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const res = await getMyMatch(matchId);
  if (!res) notFound();
  const { match, notes } = res;

  return (
    <main className="space-y-4">
      <BackLink href="/me">내 기록</BackLink>
      <h1 className="text-xl font-bold">
        {formatMatchDate(match.played_on)} vs {match.opponent}{" "}
        <span className="tabular-nums text-muted">
          {match.our_score}:{match.their_score}
        </span>
      </h1>
      {match.attended ? (
        <NoteForm matchId={match.id} initial={notes} />
      ) : (
        <p className="card p-4 text-sm text-muted">이 경기에는 출석 기록이 없어서 노트를 쓸 수 없어요.</p>
      )}
      <MatchReview m={match} />
    </main>
  );
}
