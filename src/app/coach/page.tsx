import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMatchDate, todayKST } from "@/lib/matches";
import {
  absentStreak,
  bestAndWorst,
  repeatedCauses,
  seasonRecord,
  sortNewestFirst,
  topGoalType,
  TREND_MATCHES,
  type Combo,
  type FinishedMatch,
} from "@/lib/dashboard";
import { sharePath, siteUrl } from "@/lib/site";
import { ShareLinkControls } from "./share/share-controls";
import { getRole } from "@/lib/role";
import { UpcomingStrip } from "./upcoming-strip";

export const metadata = { title: "홈 · pitch-note" };

// 감독 홈: 지금 상황과 다음 할 일만. 숫자는 표본이 충분할 때만 보인다.
export default async function CoachHome() {
  const supabase = await createClient();
  const isCoach = (await getRole()) === "coach";
  const [matchesRes, summaryRes, playersRes, shareRes, pendingRes] = await Promise.all([
    supabase
      .from("matches")
      .select("id, played_on, created_at, opponent, our_score, their_score, season_id, status, match_notes(kind, body, sort_order)")
      .eq("status", "finished")
      .order("played_on", { ascending: false })
      .limit(200),
    supabase.from("match_summary").select("match_id, players_played, events_missing"),
    supabase.from("players").select("id, name, jersey_number, is_active, membership"),
    supabase.from("share_links").select("token").is("revoked_at", null).order("created_at", { ascending: false }).limit(1),
    // 감독만 보인다 (RLS). 기록원은 0명으로 나온다.
    supabase.from("members").select("user_id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const pendingCount = isCoach ? (pendingRes.count ?? 0) : 0;
  for (const r of [matchesRes, summaryRes, playersRes, shareRes]) {
    if (r.error) return <p className="mt-8 text-danger">홈을 불러오지 못했어요: {r.error.message}</p>;
  }

  const all = sortNewestFirst(
    (matchesRes.data ?? []).map((m) => ({ ...m, our_score: m.our_score ?? 0, their_score: m.their_score ?? 0 })),
  );
  const players = playersRes.data ?? [];
  const name = new Map(players.map((p) => [p.id, p.name]));
  const shareToken = shareRes.data?.[0]?.token ?? null;
  const shareUrl = shareToken ? `${await siteUrl()}${sharePath(shareToken)}` : null;

  if (all.length === 0) {
    return (
      <main className="space-y-3 pt-4">
        <Today />
        <UpcomingStrip isCoach={isCoach} />
        <div className="card p-6 text-center">
          <p className="font-medium">첫 경기를 기록하면 여기에 지금 상황과 다음 할 일이 떠요</p>
          <p className="mt-1 text-sm text-muted">경기 후 5분이면 돼요. 출석 → 골·실점 → 메모 순서예요.</p>
          <Link href="/coach/matches/new" className="btn-primary mt-4">
            + 경기 기록
          </Link>
        </div>
        {isCoach && <SettingsList pending={pendingCount} shareUrl={shareUrl} />}
      </main>
    );
  }

  const latest = all[0];
  const seasonMatches: FinishedMatch[] = all.filter((m) => m.season_id === latest.season_id);
  const recentIds = all.map((m) => m.id);
  const summary = new Map((summaryRes.data ?? []).map((s) => [s.match_id, s]));

  const [seasonRes, attendanceRes, tagRes, lineupRes, pairRes] = await Promise.all([
    supabase.from("seasons").select("name").eq("id", latest.season_id).maybeSingle(),
    supabase.from("match_attendance").select("match_id, player_id, status").in("match_id", recentIds.slice(0, 3)),
    supabase.from("tag_counts").select("match_id, kind, label, events, season_id").eq("season_id", latest.season_id),
    supabase.from("lineup_goal_diff").select("*").eq("season_id", latest.season_id),
    supabase.from("pair_goal_diff").select("*").eq("season_id", latest.season_id),
  ]);

  // --- 다음 할 일 ------------------------------------------------------------
  const latestSummary = summary.get(latest.id);
  const latestNotes = [...(latest.match_notes ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const focus = latestNotes.filter((n) => n.kind === "next_focus").map((n) => n.body);
  const hasReview = latestNotes.some((n) => n.kind === "good" || n.kind === "improve");
  const todo =
    Number(latestSummary?.players_played ?? 0) === 0
      ? { text: "출석이 비어 있어요", href: `/coach/matches/${latest.id}/attendance`, cta: "출석 체크하기" }
      : Number(latestSummary?.events_missing ?? 0) > 0
        ? {
            text: `골·실점 기록이 ${latestSummary?.events_missing}개 남았어요`,
            href: `/coach/matches/${latest.id}`,
            cta: "이어서 기록하기",
          }
        : isCoach && !hasReview && focus.length === 0
          ? { text: "메모와 다음 경기 포인트가 비어 있어요", href: `/coach/matches/${latest.id}/notes`, cta: "메모 쓰기 · 2분이면 돼요" }
          : null;

  // --- 신호 (켜질 때만) -------------------------------------------------------
  const absent = absentStreak(recentIds, attendanceRes.data ?? [], players);
  const causes = repeatedCauses(recentIds, tagRes.data ?? []);

  // --- 시즌 -------------------------------------------------------------------
  const record = seasonRecord(seasonMatches);
  const trend = seasonMatches.slice(0, TREND_MATCHES).reverse();
  const goalType = topGoalType(tagRes.data ?? []);

  // --- 조합 (4명 조합이 표본이 모자라면 두 명 조합) ---------------------------
  const lineups: Combo[] = (lineupRes.data ?? []).map((r) => ({
    ids: r.player_ids ?? [],
    goals_for: Number(r.goals_for ?? 0),
    goals_against: Number(r.goals_against ?? 0),
    goal_diff: Number(r.goal_diff ?? 0),
    events: Number(r.events ?? 0),
  }));
  const pairs: Combo[] = (pairRes.data ?? []).map((r) => ({
    ids: [r.player_a, r.player_b].filter((x): x is string => !!x),
    goals_for: Number(r.goals_for ?? 0),
    goals_against: Number(r.goals_against ?? 0),
    goal_diff: Number(r.goal_diff ?? 0),
    events: Number(r.events ?? 0),
  }));
  const lineupPick = bestAndWorst(lineups);
  const combo = lineupPick ? { kind: "4명 조합", ...lineupPick } : (() => {
    const p = bestAndWorst(pairs);
    return p ? { kind: "두 명 조합", ...p } : null;
  })();
  const comboNames = (c: Combo) => c.ids.map((id) => name.get(id) ?? "?").join(" · ");

  return (
    <main className="space-y-3 pt-4">
      <Today />

      {/* 1. 지금 할 일: 화면에서 가장 눈에 띄는 것은 이것 하나 */}
      {todo && (
        <section className="rounded-2xl bg-pitch p-4 text-white dark:text-black">
          <p className="text-xs font-medium opacity-75">
            지금 할 일 · {formatMatchDate(latest.played_on)} {latest.opponent}전
          </p>
          <p className="mt-1 text-[17px] leading-snug font-bold">{todo.text}</p>
          <Link
            href={todo.href}
            className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-white text-[15px] font-semibold text-pitch dark:bg-background"
          >
            {todo.cta}
          </Link>
        </section>
      )}

      {/* 0. 다가오는 경기 + 그 경기에 가져갈 포인트 */}
      <UpcomingStrip isCoach={isCoach}>
        <h2 className="text-xs font-semibold text-pitch">다음 경기 포인트</h2>
        {focus.length > 0 ? (
          <>
            <ol className="mt-1.5 space-y-1">
              {focus.map((f, i) => (
                <li key={i} className="flex gap-2 font-medium">
                  <span className="text-pitch tabular-nums">{i + 1}</span>
                  <span>{f}</span>
                </li>
              ))}
            </ol>
            <p className="mt-1.5 text-xs text-muted">
              {formatMatchDate(latest.played_on)} {latest.opponent}전에서 정한 것
            </p>
          </>
        ) : (
          <p className="mt-1 text-[13px] text-muted">
            {isCoach ? (
              <>
                아직 없어요. 지난 경기 메모에서 1~3개 정하면 여기 떠요.{" "}
                <Link href={`/coach/matches/${latest.id}/notes`} className="font-semibold text-pitch">
                  정하기
                </Link>
              </>
            ) : (
              "감독이 팀에 공개한 포인트가 여기 떠요."
            )}
          </p>
        )}
      </UpcomingStrip>

      {/* 2. 신호: 켜진 것만. 없으면 조용히 한 줄 */}
      {absent.length + causes.length > 0 ? (
        <section className="space-y-2">
          {absent.length > 0 && (
            <Signal title="2경기 연속 불참" action="안부 한 번 물어보세요">
              {absent.map((p) => p.name).join(", ")}
            </Signal>
          )}
          {causes.map((c) => (
            <Signal key={c.label} title={`반복되는 실점: ${c.label}`} action="다음 훈련 주제로 하나 정해보세요">
              최근 {c.window}경기 중 {c.matches}경기에서 나왔어요 (실점 {c.events}개)
            </Signal>
          ))}
        </section>
      ) : (
        <p className="px-1 text-[13px] text-muted">✓ 지금 특별히 챙길 신호는 없어요</p>
      )}

      {/* 3. 시즌 */}
      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{seasonRes.data?.name ?? "이번 시즌"}</h2>
          <Link href="/coach/matches" className="text-sm text-muted">
            경기 {record.played}개 ›
          </Link>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex gap-1.5 tabular-nums">
            <RecordChip n={record.w} label="승" tone="win" />
            <RecordChip n={record.d} label="무" tone="draw" />
            <RecordChip n={record.l} label="패" tone="loss" />
          </div>
          <div className="text-right tabular-nums">
            <p className="text-2xl font-bold">
              {record.gf}:{record.ga}
            </p>
            <p className="text-xs text-muted">
              득실 {record.gf - record.ga > 0 ? "+" : ""}
              {record.gf - record.ga}
            </p>
          </div>
        </div>
        {trend.length >= 2 && (
          <div className="mt-4 flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-muted">최근</span>
            <span className="flex flex-wrap gap-1">
              {trend.map((m) => {
                const r = m.our_score > m.their_score ? "win" : m.our_score < m.their_score ? "loss" : "draw";
                return (
                  <Link
                    key={m.id}
                    href={`/coach/matches/${m.id}`}
                    title={`${formatMatchDate(m.played_on)} ${m.opponent} ${m.our_score}:${m.their_score}`}
                    aria-label={`${formatMatchDate(m.played_on)} ${m.opponent} ${m.our_score}:${m.their_score}`}
                    className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white ${FORM_BG[r]}`}
                  >
                    {r === "win" ? "승" : r === "loss" ? "패" : "무"}
                  </Link>
                );
              })}
            </span>
            <span className="shrink-0 text-[11px] text-muted">→ 최근</span>
          </div>
        )}
        {goalType && (
          <p className="mt-3 text-sm">
            가장 많이 넣은 방식은 <b>{goalType.label}</b>
            <span className="text-muted">
              {" "}
              ({goalType.total}골 중 {goalType.events}골)
            </span>
          </p>
        )}
      </section>

      {/* 4. 조합: 3번 이상 함께 뛴 것만 */}
      {combo && (
        <section className="card p-4">
          <h2 className="font-semibold">코트 위 {combo.kind}</h2>
          <p className="text-xs text-muted">골·실점 순간 함께 있던 횟수가 3번 이상인 조합만 봐요</p>
          <ComboRow label="잘 맞는" tone="pitch" names={comboNames(combo.best)} c={combo.best} />
          {combo.worst && <ComboRow label="흔들리는" tone="danger" names={comboNames(combo.worst)} c={combo.worst} />}
        </section>
      )}

      {isCoach && <SettingsList pending={pendingCount} shareUrl={shareUrl} />}
    </main>
  );
}

/** 오늘 날짜 한 줄. 탭 이름과 겹치는 '홈' 제목 대신. */
function Today() {
  return <p className="px-1 text-[13px] text-muted">{formatMatchDate(todayKST())}</p>;
}

const FORM_BG = { win: "bg-pitch dark:text-black", draw: "bg-muted", loss: "bg-danger" } as const;

function RecordChip({ n, label, tone }: { n: number; label: string; tone: "win" | "draw" | "loss" }) {
  const cls = {
    win: "bg-pitch-soft text-pitch",
    draw: "bg-background text-foreground",
    loss: "bg-danger/10 text-danger",
  }[tone];
  return (
    <span className={`min-w-11 rounded-lg px-2.5 py-1 text-center ${cls}`}>
      <b className="block text-xl leading-tight">{n}</b>
      <span className="text-[11px]">{label}</span>
    </span>
  );
}

/** 한 번 설정하면 끝나는 것들은 목록 두 줄로. 승인 대기가 있을 때만 눈에 띄게. */
function SettingsList({ pending, shareUrl }: { pending: number; shareUrl: string | null }) {
  return (
    <section className="card divide-y divide-line">
      <Link href="/coach/team" className="flex min-h-12 items-center gap-3 px-4">
        <span className="flex-1">팀원 관리</span>
        <span className={`text-sm ${pending > 0 ? "font-semibold text-pitch" : "text-muted"}`}>
          {pending > 0 ? `승인 대기 ${pending}명 ›` : "›"}
        </span>
      </Link>
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
          <span className="flex-1">선수용 공유 링크</span>
          <span className={`text-sm ${shareUrl ? "text-muted" : "font-semibold text-pitch"}`}>
            {shareUrl ? "복사·관리" : "만들기"} <span className="inline-block transition group-open:rotate-90">›</span>
          </span>
        </summary>
        <div className="px-4 pb-4">
          <p className="mb-3 text-xs text-muted">
            로그인 없이 볼 수 있어요. 경기 결과, MVP, &lsquo;팀 공개&rsquo; 메모, 다음 경기 포인트, 그리고 선수마다 본인 기록만 보여요.
          </p>
          <ShareLinkControls url={shareUrl} />
        </div>
      </details>
    </section>
  );
}

function Signal({ title, action, children }: { title: string; action: string; children: React.ReactNode }) {
  return (
    <div className="card border-amber-400/60 bg-amber-50 p-4 dark:bg-amber-950/30">
      <p className="text-sm font-semibold">
        <span aria-hidden>⚠️ </span>
        {title}
      </p>
      <p className="mt-0.5 text-sm">{children}</p>
      <p className="mt-1 text-xs text-muted">{action}</p>
    </div>
  );
}

function ComboRow({ label, tone, names, c }: { label: string; tone: "pitch" | "danger"; names: string; c: Combo }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <span className={`w-14 shrink-0 text-xs font-semibold ${tone === "pitch" ? "text-pitch" : "text-danger"}`}>{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{names}</span>
      <span className="shrink-0 text-sm tabular-nums">
        +{c.goals_for} −{c.goals_against}
        <span className="ml-1 text-xs text-muted">({c.events}번)</span>
      </span>
    </div>
  );
}
