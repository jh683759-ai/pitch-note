"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError, parsePlayerForm } from "@/lib/players";

export type FormState = { error: string | null };

export async function createPlayer(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parsePlayerForm(form);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("players").insert(parsed.value);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/coach/players");
  // "저장 후 하나 더": 경기 전에 여러 명을 연달아 등록하는 경우
  if (form.get("intent") === "save-and-new") redirect("/coach/players/new?saved=1");
  redirect("/coach/players");
}

export async function updatePlayer(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parsePlayerForm(form);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("players").update(parsed.value).eq("id", id);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/coach/players", "layout");
  redirect(`/coach/players/${id}`);
}

export async function setPlayerActive(id: string, active: boolean, _prev: FormState): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("players").update({ is_active: active }).eq("id", id);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/coach/players");
  redirect("/coach/players");
}

export async function deletePlayer(id: string, _prev: FormState): Promise<FormState> {
  const supabase = await createClient();
  // 연결된 선수 계정은 지우지 않고 승인 대기로 되돌린다 (그냥 지우면 계정 신청까지 사라진다)
  await supabase.from("members").update({ status: "pending", player_id: null, approved_at: null, approved_by: null }).eq("player_id", id);
  // 경기 기록(출석·골·코트 위 4명)이 있으면 FK가 막는다 → 보관을 안내
  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/coach/players");
  redirect("/coach/players");
}

/** 기록까지 함께 삭제 (감독만, 되돌릴 수 없음). DB 함수가 감독인지와 이름을 다시 확인한다. */
export async function deletePlayerWithRecords(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const confirmName = String(form.get("confirm_name") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_player_with_records", { p_player_id: id, p_confirm_name: confirmName });
  if (error) {
    if (error.code === "23514") return { error: "선수 이름이 맞지 않아요. 똑같이 입력하세요." };
    if (error.code === "42501") return { error: "감독만 할 수 있어요." };
    return { error: `삭제하지 못했어요: ${error.message}` };
  }

  revalidatePath("/coach", "layout");
  redirect("/coach/players");
}
