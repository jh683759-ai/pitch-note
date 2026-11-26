import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MyResource } from "@/lib/prep";
import type { RsvpAnswer } from "@/lib/matches";

/** 선수 '다음 경기' 카드 (my_next_match). 예정 경기가 없거나 선수 계정이 아니면 null. */
export type MyNextMatch = {
  id: string;
  played_on: string;
  kickoff_time: string | null;
  opponent: string;
  venue: string | null;
  match_type: string;
  points: string[]; // 감독 팀 포인트 (경기 계획)
  scout: string[]; // 상대 메모 ('팀 공개'만)
  resources: MyResource[];
  my_lineup: { position: string | null; squad: number | null } | null;
  my_rsvp: { answer: RsvpAnswer; note: string | null } | null;
  going: number;
};

export const getMyNextMatch = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_next_match");
  if (error) throw error;
  return (data as unknown as MyNextMatch | null) ?? null;
});
