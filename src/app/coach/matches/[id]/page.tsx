import Link from "next/link";
import { formatMatchDate, matchTypeLabel, resultOf } from "@/lib/matches";
import { loadMatch, nameMap, type EventWithDetails } from "../load";
import { BackLink } from "../ui";
import { ScoreEditor } from "./score-editor";
import { createClient } from "@/lib/supabase/server";
import { sharePath, siteUrl } from "@/lib/site";
import { CopyButton } from "../../share/share-controls";
import { getRole, staffNames } from "@/lib/role";
import { UpcomingHub } from "./upcoming-hub";

export const metadata = { title: "경기 · pitch-note" };

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ match, roster, events, tags, notes }, role, staff] = await Promise.all([loadMatch(id), getRole(), staffNames()]);
  const isCoach = role === "coach";
  if (match.status === "scheduled") return <UpcomingHub match={match} notes={notes} isCoach={isCoach} />;
  const supabase = await createClient();
  const { data: link } = await supabase
    .from("share_links")
    .select("token")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const shareUrl = link ? `${await siteUrl()}${sharePath(link.token, { match: id })}` : null;

  const names = nameMap(roster.map((r) => r.player));
  // 코트 위 4명은 누른 순서가 아니라 명단 순서(등번호)로 보여줘야 골마다 비교하기 쉽다
  const rosterOrder = new Map(roster.map((r, i) => [r.player.id, i]));
  const tagLabel = new Map(tags.map((t) => [t.id, t.label]));
  const played = roster.filter((r) => r.status === "played");
  const guests = played.filter((r) => r.membership === "guest").length;
  const goalsLogged = events.filter((e) => e.side === "for").length;
  const concedesLogged = events.length - goalsLogged;
  const missingFor = Math.max((match.our_score ?? 0) - goalsLogged, 0);
  const missingAgainst = Math.max((match.their_score ?? 0) - concedesLogged, 0);
  const review = notes.filter((n) => n.kind === "good" || n.kind === "improve");
  const focus = notes.filter((n) => n.kind === "next_focus");

  // 지금 해야 할 단계 하나만 강조한다
  // 기록원은 3단계(메모)가 없다. 메모·MVP는 감독이 쓴다.
  const step =
    played.length === 0 ? 1 : missingFor + missingAgainst > 0 ? 2 : isCoach && review.length + focus.length === 0 ? 3 : 0;
  const createdBy = match.created_by ? staff.get(match.created_by) : null;
  const updatedBy = match.updated_by ? staff.get(match.updated_by) : null;
  const result = resultOf(match.our_score, match.their_score, played.length);

  return (
    <main className="pt-6 pb-10">
      <BackLink href="/coach/matches">경기 목록</BackLink>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{match.opponent}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatMatchDate(match.played_on)} · {matchTypeLabel(match.match_type)}
            {match.venue ? ` · ${match.venue}` : ""}
          </p>
          {(createdBy || updatedBy) && (
            <p className="mt-0.5 text-xs text-muted">
              {createdBy ? `기록 ${createdBy}` : ""}
              {updatedBy && updatedBy !== createdBy ? `${createdBy ? " · " : ""}마지막 수정 ${updatedBy}` : ""}
            </p>
          )}
        </div>
        <Link href={`/coach/matches/${id}/edit`} className="shrink-0 py-1 text-sm text-muted">
          수정
        </Link>
      </div>

      <ScoreEditor matchId={id} our={match.our_score ?? 0} their={match.their_score ?? 0} result={result} />

      {step === 0 && (
        <div className="mt-4 rounded-xl bg-pitch-soft px-4 py-3">
          <p className="text-sm font-medium text-pitch">기록 완료. 수고하셨어요!</p>
          {!isCoach ? (
            <p className="mt-1 text-xs text-muted">메모와 MVP는 감독이 정리해서 선수들에게 공유해요.</p>
          ) : shareUrl ? (
            <div className="mt-2 flex items-center gap-2">
              <CopyButton text={shareUrl} label="단톡방용 리뷰 링크 복사" className="btn-primary min-h-10 flex-1 text-sm" />
              <a href={shareUrl} target="_blank" rel="noreferrer" className="btn-ghost min-h-10 px-3 text-sm">
                미리보기
              </a>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted">
              선수들과 나누려면{" "}
              <Link href="/coach" className="underline">
                홈에서 공유 링크
              </Link>
              를 먼저 만드세요.
            </p>
          )}
          {isCoach && <p className="mt-2 text-xs text-muted">선수 화면에는 &lsquo;팀 공개&rsquo; 메모와 MVP만 보여요.</p>}
        </div>
      )}

      {/* 1. 출석 */}
      <Step n={1} title="출석" active={step === 1} href={`/coach/matches/${id}/attendance`} cta={played.length ? "고치기" : "체크하기"}>
        {played.length ? (
          <p className="text-sm">
            출전 {played.length}명{guests ? ` (용병 ${guests})` : ""} · 벤치 {roster.filter((r) => r.status === "bench").length} · 불참{" "}
            {roster.filter((r) => r.status === "absent").length}
          </p>
        ) : (
          <p className="text-sm text-muted">출석을 먼저 체크해야 골·실점을 적을 수 있어요.</p>
        )}
      </Step>

      {/* 2. 골·실점 */}
      <Step n={2} title="골 · 실점" active={step === 2}>
        {played.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/coach/matches/${id}/events/new?side=for`} className="btn-primary">
              + 우리 골
            </Link>
            <Link href={`/coach/matches/${id}/events/new?side=against`} className="btn-ghost border-danger/40 text-danger">
              + 실점
            </Link>
          </div>
        )}
        {(missingFor > 0 || missingAgainst > 0) && played.length > 0 && (
          <p className="mt-3 text-xs text-danger">
            스코어보다 기록이 적어요:{missingFor > 0 ? ` 우리 골 ${missingFor}개` : ""}
            {missingAgainst > 0 ? ` 실점 ${missingAgainst}개` : ""}. 기억 안 나면 그냥 두셔도 돼요.
          </p>
        )}
        {events.length > 0 && (
          <ol className="mt-3 divide-y divide-line">
            {events.map((e) => (
              <EventRow key={e.id} e={e} matchId={id} names={names} order={rosterOrder} tagLabel={tagLabel} />
            ))}
          </ol>
        )}
      </Step>

      {/* 3. 메모 */}
      <Step
        n={3}
        title="메모 · 다음 경기 포인트"
        active={step === 3}
        href={isCoach ? `/coach/matches/${id}/notes` : undefined}
        cta={review.length + focus.length ? "고치기" : "쓰기"}
      >
        {match.mvp_player_id && (
          <p className="mb-2 text-sm">
            <span className="mr-2 rounded-full bg-pitch-soft px-2 py-0.5 text-xs font-semibold text-pitch">MVP</span>
            {names.get(match.mvp_player_id) ?? "?"}
          </p>
        )}
        {!isCoach && review.length + focus.length === 0 ? (
          <p className="text-sm text-muted">메모와 MVP는 감독이 써요.</p>
        ) : review.length + focus.length === 0 ? (
          <p className="text-sm text-muted">잘된 점 한 줄, 개선점 한 줄, 다음 경기 포인트 1~3개면 충분해요.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {review.map((n) => (
              <li key={n.id} className="flex gap-2">
                <span className="shrink-0 text-muted">{n.kind === "good" ? "잘됨" : "개선"}</span>
                <span className="line-clamp-2 flex-1">{n.body}</span>
                <Visibility v={n.visibility} />
              </li>
            ))}
            {focus.map((n, i) => (
              <li key={n.id} className="flex gap-2">
                <span className="shrink-0 font-semibold text-pitch">포인트 {i + 1}</span>
                <span className="flex-1">{n.body}</span>
                <Visibility v={n.visibility} />
              </li>
            ))}
          </ul>
        )}
      </Step>
    </main>
  );
}

function Step({
  n,
  title,
  active,
  href,
  cta,
  children,
}: {
  n: number;
  title: string;
  active: boolean;
  href?: string;
  cta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`card mt-4 p-4 ${active ? "border-pitch ring-1 ring-pitch/30" : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${active ? "bg-pitch text-white dark:text-black" : "bg-line"}`}
          >
            {n}
          </span>
          {title}
        </h2>
        {href && (
          <Link href={href} className={`min-h-10 content-center px-1 text-sm ${active ? "font-semibold text-pitch" : "text-muted"}`}>
            {cta} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function EventRow({
  e,
  matchId,
  names,
  order,
  tagLabel,
}: {
  e: EventWithDetails;
  matchId: string;
  names: Map<string, string>;
  order: Map<string, number>;
  tagLabel: Map<number, string>;
}) {
  const n = (id: string | null) => (id ? (names.get(id) ?? "?") : null);
  const isFor = e.side === "for";
  const who = isFor
    ? e.is_own_goal
      ? "상대 자책골"
      : `${n(e.scorer_id) ?? "득점자 미입력"}${e.assist_id ? ` ← ${n(e.assist_id)}` : ""}`
    : e.is_own_goal
      ? "우리 자책골"
      : "실점";
  const tagsText = e.tagIds.map((t) => tagLabel.get(t)).filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={`/coach/matches/${matchId}/events/${e.id}`} className="flex gap-3 py-2.5">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            isFor ? "bg-pitch-soft text-pitch" : "bg-danger/10 text-danger"
          }`}
        >
          {e.seq}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-medium">
            {who}
            {tagsText && <span className="font-normal text-muted"> · {tagsText}</span>}
          </span>
          <span className="block truncate text-xs text-muted">
            {e.onCourt.length ? [...e.onCourt]
                  .sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
                  .map((id) => n(id))
                  .join(" ") : "코트 위 미입력"}
            {e.onCourt.length > 0 && e.onCourt.length < 4 ? ` (${e.onCourt.length}/4)` : ""}
            {e.goalkeeper_id ? ` · GK ${n(e.goalkeeper_id)}` : ""}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Visibility({ v }: { v: string }) {
  return (
    <span className={`shrink-0 text-xs ${v === "team" ? "text-pitch" : "text-muted"}`}>{v === "team" ? "팀 공개" : "감독만"}</span>
  );
}
