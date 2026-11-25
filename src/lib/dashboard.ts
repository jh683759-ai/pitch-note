// 감독 홈(대시보드)이 쓰는 계산. 원천 데이터는 다 모으지만 화면에는 신호만 올린다.
// 표본이 작은 숫자는 숨긴다 (설계 문서 8장: 조합은 3회 이상 함께 뛴 것만).

export const MIN_LINEUP_EVENTS = 3;
export const TREND_MATCHES = 10;
export const ABSENT_STREAK = 2;
export const CAUSE_WINDOW = 3; // 최근 3경기 중
export const CAUSE_REPEAT = 2; // 2경기 이상 나온 실점 원인만 노란 카드
export const MIN_TAGGED_GOALS = 3;

export type FinishedMatch = {
  id: string;
  played_on: string;
  created_at: string;
  opponent: string;
  our_score: number;
  their_score: number;
  season_id: string;
};

/** 최신 경기부터 */
export function sortNewestFirst<T extends { played_on: string; created_at: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.played_on.localeCompare(a.played_on) || b.created_at.localeCompare(a.created_at));
}

export function seasonRecord(matches: FinishedMatch[]) {
  let w = 0,
    d = 0,
    l = 0,
    gf = 0,
    ga = 0;
  for (const m of matches) {
    gf += m.our_score;
    ga += m.their_score;
    if (m.our_score > m.their_score) w++;
    else if (m.our_score < m.their_score) l++;
    else d++;
  }
  return { w, d, l, gf, ga, played: matches.length };
}

/** 연속 불참: 최근 n경기 모두 '불참'으로 기록된 고정 멤버 */
export function absentStreak(
  recentMatchIds: string[],
  attendance: { match_id: string; player_id: string; status: string }[],
  players: { id: string; name: string; is_active: boolean; membership: string }[],
  n = ABSENT_STREAK,
) {
  if (recentMatchIds.length < n) return [];
  const window = new Set(recentMatchIds.slice(0, n));
  const absentCount = new Map<string, number>();
  for (const a of attendance) {
    if (!window.has(a.match_id) || a.status !== "absent") continue;
    absentCount.set(a.player_id, (absentCount.get(a.player_id) ?? 0) + 1);
  }
  return players.filter((p) => p.is_active && p.membership === "regular" && absentCount.get(p.id) === n);
}

/** 반복되는 실점 원인: 최근 CAUSE_WINDOW경기 중 CAUSE_REPEAT경기 이상 나온 원인 */
export function repeatedCauses(
  recentMatchIds: string[],
  tagRows: { match_id: string; kind: string; label: string; events: number | null }[],
) {
  const window = new Set(recentMatchIds.slice(0, CAUSE_WINDOW));
  const byLabel = new Map<string, { matches: Set<string>; events: number }>();
  for (const t of tagRows) {
    if (t.kind !== "concede_cause" || !window.has(t.match_id)) continue;
    const cur = byLabel.get(t.label) ?? { matches: new Set<string>(), events: 0 };
    cur.matches.add(t.match_id);
    cur.events += Number(t.events ?? 0);
    byLabel.set(t.label, cur);
  }
  return [...byLabel.entries()]
    .filter(([, v]) => v.matches.size >= CAUSE_REPEAT)
    .map(([label, v]) => ({ label, matches: v.matches.size, events: v.events, window: Math.min(window.size, CAUSE_WINDOW) }))
    .sort((a, b) => b.matches - a.matches || b.events - a.events);
}

/** 가장 많이 나온 득점 유형 (태그된 골이 충분할 때만) */
export function topGoalType(tagRows: { kind: string; label: string; events: number | null }[]) {
  const sum = new Map<string, number>();
  let total = 0;
  for (const t of tagRows) {
    if (t.kind !== "goal_type") continue;
    const n = Number(t.events ?? 0);
    sum.set(t.label, (sum.get(t.label) ?? 0) + n);
    total += n;
  }
  if (total < MIN_TAGGED_GOALS) return null;
  const [label, events] = [...sum.entries()].sort((a, b) => b[1] - a[1])[0];
  return { label, events, total };
}

export type Combo = { ids: string[]; goals_for: number; goals_against: number; goal_diff: number; events: number };

/** 득실 상위 1개, 하위 1개. 표본이 작으면 null. 상위와 하위가 같으면 하나만. */
export function bestAndWorst(combos: Combo[]) {
  const ok = combos.filter((c) => c.events >= MIN_LINEUP_EVENTS);
  if (ok.length === 0) return null;
  const sorted = [...ok].sort((a, b) => b.goal_diff - a.goal_diff || b.events - a.events);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  return { best, worst: worst === best || worst.goal_diff >= best.goal_diff ? null : worst };
}
