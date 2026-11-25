import { formatMatchDate, MAX_NEXT_FOCUS, type Visibility } from "@/lib/matches";
import { loadMatch, loadPreviousMatch } from "../../load";
import { BackLink } from "../../ui";
import { NotesForm, type NoteDraft } from "./notes-form";

export const metadata = { title: "경기 메모 · pitch-note" };

export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { match, notes } = await loadMatch(id);
  const previous = await loadPreviousMatch(match);

  const draft = (kind: string): NoteDraft => {
    const n = notes.find((x) => x.kind === kind);
    return { body: n?.body ?? "", visibility: (n?.visibility as Visibility) ?? "coach" };
  };
  const focus = notes.filter((n) => n.kind === "next_focus").map((n) => ({ body: n.body, visibility: n.visibility as Visibility }));
  while (focus.length < MAX_NEXT_FOCUS) focus.push({ body: "", visibility: "coach" });

  return (
    <main className="pt-6">
      <BackLink href={`/coach/matches/${id}`}>경기로</BackLink>
      <h1 className="mt-2 text-2xl font-bold">메모</h1>
      <p className="mt-1 text-sm text-muted">
        {formatMatchDate(match.played_on)} · {match.opponent}
      </p>

      {/* 지난 경기에서 정한 포인트를 오늘 지켰는지 보고 쓰면 리뷰가 이어진다 */}
      {previous && previous.focus.length > 0 && (
        <section className="mt-5 rounded-2xl bg-pitch-soft p-4">
          <h2 className="text-sm font-semibold text-pitch">
            지난 경기 포인트 ({formatMatchDate(previous.played_on)} {previous.opponent})
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {previous.focus.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted">오늘 잘 지켰는지 떠올리면서 쓰세요.</p>
        </section>
      )}

      <NotesForm matchId={id} good={draft("good")} improve={draft("improve")} focus={focus} />
    </main>
  );
}
