"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPrep, todayKst } from "@/lib/prep";

export type TrainState = { error: string | null };

/** 개인 훈련 기록 (선수 본인). 공식 경기 기록이 아니다. */
export async function saveTraining(_prev: TrainState, form: FormData): Promise<TrainState> {
  const supabase = await createClient();
  const { data: pid } = await supabase.rpc("my_player_id");
  if (!pid) return { error: "선수 계정만 쓸 수 있어요." };

  const body = String(form.get("body") ?? "").trim().slice(0, 200) || null;
  const minutesRaw = Number(form.get("minutes"));
  const minutes = Number.isInteger(minutesRaw) && minutesRaw >= 1 && minutesRaw <= 600 ? minutesRaw : null;
  const date = String(form.get("trained_on") ?? "");
  const today = todayKst();
  const trained_on = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : today;

  const prep = await getMyPrep();
  const focus_orders = prep?.focus_match_id
    ? [...new Set(form.getAll("focus").map(Number))].filter((n) => [0, 1, 2].includes(n))
    : [];
  if (!body && focus_orders.length === 0) return { error: "연습한 포인트를 고르거나 한 줄을 써 주세요." };

  const { error } = await supabase.from("training_logs").insert({
    player_id: pid,
    trained_on,
    body,
    minutes,
    focus_match_id: focus_orders.length ? prep!.focus_match_id : null,
    focus_orders,
  });
  if (error) return { error: "저장하지 못했어요. 잠시 뒤 다시 해 주세요." };
  revalidatePath("/me", "layout");
  redirect("/me?trained=1");
}

export async function deleteTraining(id: string) {
  const supabase = await createClient();
  await supabase.from("training_logs").delete().eq("id", id); // RLS: 본인 것만
  revalidatePath("/me", "layout");
}

/** 자료 '봤어요' (다시 누르면 취소) */
export async function toggleSeen(resourceId: string, seen: boolean) {
  const supabase = await createClient();
  const { data: pid } = await supabase.rpc("my_player_id");
  if (!pid) return;
  if (seen) {
    await supabase.from("resource_views").delete().eq("resource_id", resourceId).eq("player_id", pid);
  } else {
    await supabase.from("resource_views").upsert({ resource_id: resourceId, player_id: pid }, { ignoreDuplicates: true });
  }
  revalidatePath("/me", "layout");
}

/** 다음 경기 참석 응답 (본인). 같은 걸 다시 누르면 취소. */
export async function setMyRsvp(matchId: string, answer: "yes" | "no" | null): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: pid } = await supabase.rpc("my_player_id");
  if (!pid) return { error: "선수 계정만 응답할 수 있어요." };
  const { error } = answer
    ? await supabase.from("match_rsvp").upsert({ match_id: matchId, player_id: pid, answer })
    : await supabase.from("match_rsvp").delete().eq("match_id", matchId).eq("player_id", pid);
  if (error) return { error: "저장하지 못했어요. 경기가 이미 끝났을 수 있어요." };
  revalidatePath("/me", "layout");
  return { error: null };
}
