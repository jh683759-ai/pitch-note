import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** 선수에게 온 자료 한 줄 */
export type MyResource = { id: string; title: string; url: string; note: string | null; seen: boolean };

/** 선수 '다음 경기 준비' (my_prep). 선수 계정이 아니면 null. */
export type MyPrep = {
  focus_match_id: string | null; // my_focus가 나온 노트의 경기
  focus_practiced: number[]; // my_focus 중 연습 체크한 번호 (0부터)
  trainings_since: number; // 마지막 경기 이후 훈련 기록 수
  recent_trainings: { id: string; trained_on: string; body: string | null; minutes: number | null }[];
  resources: MyResource[]; // 안 본 것 먼저, 최대 3개
  resources_total: number;
  resources_unseen: number;
};

export const getMyPrep = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_prep");
  if (error) throw error;
  return (data as unknown as MyPrep | null) ?? null;
});

export type ResourceAudience = "team" | "position" | "player";

/** 오늘 날짜 (한국 시간, YYYY-MM-DD) */
export function todayKst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/** 링크 정리: http(s)만, 500자까지. 아니면 null. */
export function cleanUrl(value: FormDataEntryValue | null) {
  const s = String(value ?? "").trim();
  if (!s || s.length > 500) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type PrepSummary = {
  trainings: number;
  minutes: number;
  focus_set: number;
  focus_practiced: number;
  resources: number;
  resources_seen: number;
};

/** 감독용 '다음 경기 준비' 한 줄. 볼 게 없으면 null. */
export function prepLine(s: PrepSummary | undefined) {
  if (!s) return null;
  const parts = [s.trainings > 0 ? `연습 ${s.trainings}번${s.minutes > 0 ? `(${s.minutes}분)` : ""}` : "연습 기록 없음"];
  if (s.focus_set > 0) parts.push(`포인트 ${s.focus_practiced}/${s.focus_set}`);
  if (s.resources > 0) parts.push(`자료 ${s.resources_seen}/${s.resources}`);
  return parts.join(" · ");
}
