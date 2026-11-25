"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  friendlyMatchError,
  MAX_NEXT_FOCUS,
  MAX_ON_COURT,
  parseMatchForm,
  type AttendanceStatus,
  type ReviewKind,
  type Side,
  type Visibility,
} from "@/lib/matches";

export type ActionResult = { error: string | null };

function refresh(matchId?: string) {
  revalidatePath("/coach/matches");
  if (matchId) revalidatePath(`/coach/matches/${matchId}`, "layout");
}

// ---------------------------------------------------------------------------
// 경기
// ---------------------------------------------------------------------------
export async function createMatch(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = parseMatchForm(form);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { data: seasonId, error: seasonError } = await supabase.rpc("ensure_season_for", {
    p_date: parsed.value.played_on,
  });
  if (seasonError) return { error: friendlyMatchError(seasonError) };

  // 경기 후에 기록하는 흐름이라 '끝난 경기 0:0'으로 만들고, 골을 적으면 스코어가 따라 올라간다.
  const { data, error } = await supabase
    .from("matches")
    .insert({ ...parsed.value, season_id: seasonId, status: "finished", our_score: 0, their_score: 0 })
    .select("id")
    .single();
  if (error) return { error: friendlyMatchError(error) };

  refresh();
  // 1단계 출석부터 바로
  redirect(`/coach/matches/${data.id}/attendance?new=1`);
}

export async function updateMatch(id: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = parseMatchForm(form);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { data: seasonId, error: seasonError } = await supabase.rpc("ensure_season_for", {
    p_date: parsed.value.played_on,
  });
  if (seasonError) return { error: friendlyMatchError(seasonError) };

  const { error } = await supabase
    .from("matches")
    .update({ ...parsed.value, season_id: seasonId })
    .eq("id", id);
  if (error) return { error: friendlyMatchError(error) };

  refresh(id);
  redirect(`/coach/matches/${id}`);
}

export async function deleteMatch(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  // 출석·골/실점·메모는 cascade로 같이 지워진다. 화면에서 한 번 더 확인받는다.
  const { error } = await supabase.from("matches").delete().eq("id", id);
  if (error) return { error: friendlyMatchError(error) };
  refresh();
  redirect("/coach/matches");
}

export async function setScore(id: string, our: number, their: number): Promise<ActionResult> {
  if (![our, their].every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) {
    return { error: "스코어는 0~99 사이로 입력하세요." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("matches").update({ our_score: our, their_score: their }).eq("id", id);
  if (error) return { error: friendlyMatchError(error) };
  refresh(id);
  return { error: null };
}

// ---------------------------------------------------------------------------
// 출석
// ---------------------------------------------------------------------------
export async function saveAttendance(
  matchId: string,
  rows: { player_id: string; status: AttendanceStatus }[],
): Promise<ActionResult> {
  if (!rows.some((r) => r.status === "played")) return { error: "출전한 선수를 한 명 이상 골라주세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_attendance", { p_match_id: matchId, p_rows: rows });
  if (error) return { error: friendlyMatchError(error) };

  refresh(matchId);
  redirect(`/coach/matches/${matchId}`);
}

/** 경기 날 처음 온 용병을 이름만으로 바로 등록 */
export async function addGuest(name: string): Promise<{ error: string | null; id?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "이름을 입력하세요." };
  if (trimmed.length > 30) return { error: "이름은 30자 이내로 입력하세요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .insert({ name: trimmed, membership: "guest" })
    .select("id")
    .single();
  if (error) return { error: friendlyMatchError(error) };
  revalidatePath("/coach/players");
  return { error: null, id: data.id };
}

// ---------------------------------------------------------------------------
// 골 / 실점
// ---------------------------------------------------------------------------
export type GoalEventInput = {
  side: Side;
  scorerId: string | null;
  assistId: string | null;
  isOwnGoal: boolean;
  goalkeeperId: string | null;
  tagIds: number[];
  onCourt: string[];
  note: string;
};

export async function saveGoalEvent(
  matchId: string,
  eventId: string | null,
  input: GoalEventInput,
  next: "match" | "another",
): Promise<ActionResult> {
  if (input.onCourt.length > MAX_ON_COURT) return { error: `코트 위 필드 플레이어는 ${MAX_ON_COURT}명까지예요.` };
  if (input.side === "for" && input.scorerId && input.scorerId === input.assistId) {
    return { error: "득점자와 어시스트가 같은 선수예요." };
  }
  if (input.note.length > 200) return { error: "메모는 200자 이내로 입력하세요." };

  const supabase = await createClient();
  const isFor = input.side === "for";
  const { error } = await supabase.rpc("save_goal_event", {
    p_match_id: matchId,
    p_event_id: eventId,
    p_side: input.side,
    p_scorer_id: isFor && !input.isOwnGoal ? input.scorerId : null,
    p_assist_id: isFor && !input.isOwnGoal ? input.assistId : null,
    p_is_own_goal: input.isOwnGoal,
    p_goalkeeper_id: input.goalkeeperId,
    p_tag_ids: input.tagIds,
    p_on_court: input.onCourt,
    p_note: input.note,
  });
  if (error) return { error: friendlyMatchError(error) };

  refresh(matchId);
  if (next === "another") redirect(`/coach/matches/${matchId}/events/new?side=${input.side}&saved=1`);
  redirect(`/coach/matches/${matchId}`);
}

export async function deleteGoalEvent(matchId: string, eventId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("goal_events").delete().eq("id", eventId).eq("match_id", matchId);
  if (error) return { error: friendlyMatchError(error) };
  refresh(matchId);
  redirect(`/coach/matches/${matchId}?deleted=1`);
}

// ---------------------------------------------------------------------------
// 경기 메모 (잘된 점 / 개선점 / 다음 경기 포인트)
// ---------------------------------------------------------------------------
export type ReviewNoteInput = { kind: ReviewKind; body: string; visibility: Visibility };

export async function saveReview(matchId: string, notes: ReviewNoteInput[]): Promise<ActionResult> {
  const filled = notes.filter((n) => n.body.trim());
  if (filled.filter((n) => n.kind === "next_focus").length > MAX_NEXT_FOCUS) {
    return { error: `다음 경기 포인트는 ${MAX_NEXT_FOCUS}개까지예요.` };
  }
  if (filled.some((n) => n.body.trim().length > 1000)) return { error: "메모 한 칸은 1000자 이내로 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_match_review", { p_match_id: matchId, p_notes: filled });
  if (error) return { error: friendlyMatchError(error) };

  refresh(matchId);
  redirect(`/coach/matches/${matchId}`);
}
