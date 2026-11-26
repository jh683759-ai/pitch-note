import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SharedMatch, SharedPlayer } from "@/lib/share";
import type { PlayerNote } from "@/lib/player-notes";

/** 선수 계정 '내 페이지'. 선수 계정이 아니면 null. */
export type MyPage = SharedPlayer & {
  team_focus: string[]; // 마지막 경기의 '팀 공개' 다음 경기 포인트 (감독)
  my_focus: string[]; // 내가 마지막으로 쓴 다음 경기 내 포인트
  noted_match_ids: string[];
  todo_match: { id: string; played_on: string; opponent: string } | null; // 내가 온 최근 경기인데 노트가 없으면
};

export type MyMatch = SharedMatch & { attended: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getMyPage = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_page");
  if (error) throw error;
  return (data as unknown as MyPage | null) ?? null;
});

export const getMyMatch = cache(async (matchId: string) => {
  if (!UUID_RE.test(matchId)) return null;
  const supabase = await createClient();
  const [matchRes, notesRes] = await Promise.all([
    supabase.rpc("my_match", { p_match_id: matchId }),
    // RLS가 본인 노트만 돌려준다
    supabase.from("player_notes").select("kind, body").eq("match_id", matchId).order("sort_order"),
  ]);
  if (matchRes.error) throw matchRes.error;
  if (notesRes.error) throw notesRes.error;
  const match = (matchRes.data as unknown as MyMatch | null) ?? null;
  if (!match) return null;
  return { match, notes: (notesRes.data ?? []) as PlayerNote[] };
});
