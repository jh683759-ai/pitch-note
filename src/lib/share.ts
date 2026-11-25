import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "@/lib/supabase/env";

// 공유 페이지는 로그인 없이 연다. 쿠키 없는 anon 클라이언트로 토큰 검사 함수만 부른다.
function anonClient() {
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient<Database>(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type SharedMatchListItem = {
  id: string;
  played_on: string;
  opponent: string;
  match_type: string;
  our_score: number;
  their_score: number;
  season_id: string;
  mvp_name: string | null;
};

export type SharedOverview = {
  label: string | null;
  matches: SharedMatchListItem[];
  latest_match_id: string | null;
  next_focus: string[];
  players: { id: string; name: string; jersey_number: number | null }[];
};

export type SharedMatch = {
  id: string;
  played_on: string;
  opponent: string;
  match_type: string;
  venue: string | null;
  our_score: number;
  their_score: number;
  mvp: { id: string; name: string } | null;
  players_played: number;
  goals: { seq: number; side: "for" | "against"; own_goal: boolean; scorer: string | null; assist: string | null; tags: string[] }[];
  notes: { kind: "good" | "improve" | "next_focus"; body: string }[];
};

export type SharedPlayer = {
  id: string;
  name: string;
  jersey_number: number | null;
  main_position: string | null;
  matches: {
    match_id: string;
    played_on: string;
    opponent: string;
    status: string;
    goals: number;
    assists: number;
    on_court_for: number;
    mvp: boolean;
  }[];
};

const TOKEN_RE = /^[0-9a-f]{32,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getSharedOverview = cache(async (token: string) => {
  if (!TOKEN_RE.test(token)) return null;
  const { data, error } = await anonClient().rpc("shared_overview", { p_token: token });
  if (error) throw error;
  return (data as unknown as SharedOverview | null) ?? null;
});

export const getSharedMatch = cache(async (token: string, matchId: string) => {
  if (!TOKEN_RE.test(token) || !UUID_RE.test(matchId)) return null;
  const { data, error } = await anonClient().rpc("shared_match", { p_token: token, p_match_id: matchId });
  if (error) throw error;
  return (data as unknown as SharedMatch | null) ?? null;
});

export const getSharedPlayer = cache(async (token: string, playerId: string) => {
  if (!TOKEN_RE.test(token) || !UUID_RE.test(playerId)) return null;
  const { data, error } = await anonClient().rpc("shared_player", { p_token: token, p_player_id: playerId });
  if (error) throw error;
  return (data as unknown as SharedPlayer | null) ?? null;
});

export function resultLabel(our: number, their: number) {
  return our > their ? "승" : our < their ? "패" : "무";
}
