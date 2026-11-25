import type { Database } from "@/lib/database.types";

type T = Database["public"]["Tables"];
export type Match = T["matches"]["Row"];
export type EventTag = T["event_tags"]["Row"];
export type GoalEvent = T["goal_events"]["Row"];
export type MatchNote = T["match_notes"]["Row"];

export const MATCH_TYPES = [
  { value: "friendly", label: "친선" },
  { value: "league", label: "리그" },
  { value: "tournament", label: "대회" },
  { value: "internal", label: "자체전" },
] as const;
export type MatchType = (typeof MATCH_TYPES)[number]["value"];

export const ATTENDANCE = [
  { value: "played", label: "출전" },
  { value: "bench", label: "벤치" },
  { value: "absent", label: "불참" },
] as const;
export type AttendanceStatus = (typeof ATTENDANCE)[number]["value"];

export type Side = "for" | "against";
export const REVIEW_KINDS = ["good", "improve", "next_focus"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export type Visibility = "team" | "coach";

export const MAX_ON_COURT = 4;
export const MAX_NEXT_FOCUS = 3;

/** 한국 시간 기준 오늘 (YYYY-MM-DD). 서버가 UTC여도 경기 날짜가 하루 밀리지 않게. */
export function todayKST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/** 2026-11-22 → "11월 22일 (일)" */
export function formatMatchDate(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

export function matchTypeLabel(value: string) {
  return MATCH_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function resultOf(our: number | null, their: number | null) {
  if (our == null || their == null) return null;
  return our > their ? "승" : our < their ? "패" : "무";
}

export type MatchInput = {
  played_on: string;
  opponent: string;
  venue: string | null;
  match_type: MatchType;
};

export function parseMatchForm(form: FormData): { ok: true; value: MatchInput } | { ok: false; error: string } {
  const played_on = String(form.get("played_on") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(played_on)) return { ok: false, error: "경기 날짜를 고르세요." };
  const opponent = String(form.get("opponent") ?? "").trim();
  if (!opponent) return { ok: false, error: "상대 팀 이름을 입력하세요. 자체전이면 '자체전'이라고 적어도 돼요." };
  if (opponent.length > 40) return { ok: false, error: "상대 팀 이름은 40자 이내로 입력하세요." };
  const venue = String(form.get("venue") ?? "").trim();
  if (venue.length > 60) return { ok: false, error: "장소는 60자 이내로 입력하세요." };
  const rawType = String(form.get("match_type") ?? "friendly");
  const match_type = (MATCH_TYPES.some((t) => t.value === rawType) ? rawType : "friendly") as MatchType;
  return { ok: true, value: { played_on, opponent, venue: venue || null, match_type } };
}

/** Postgres 오류를 감독이 이해할 수 있는 말로. DB 함수가 한국어로 올린 메시지는 그대로 쓴다. */
export function friendlyMatchError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "권한이 없어요. 감독 계정으로 로그인했는지 확인하세요.";
  if (error.code === "23505") return "방금 다른 기록과 순서가 겹쳤어요. 한 번 더 저장해 주세요.";
  if (/[가-힣]/.test(error.message)) return error.message;
  return `저장하지 못했어요: ${error.message}`;
}
